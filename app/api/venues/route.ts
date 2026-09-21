import { NextResponse, type NextRequest } from "next/server";
import type { VenueSearchResponse, VenueSearchResult } from "@/lib/venue-types";
import { prefectureByCode } from "@/lib/prefectures";
import { HttpError, hash, limit, log, logError, readBody, short, traceId } from "@/lib/server/security";
import { database } from "@/lib/server/db";

export const runtime = "nodejs";

const HOTPEPPER_URL = "https://webservice.recruit.co.jp/hotpepper/gourmet/v1/";

/** Bumping this retires every stored response, for when the request or the shape changes. */
const VENUE_VERSION = "v1";
/** How long a stored response answers without calling the provider. */
const FRESH_TTL_MS = 30 * 60 * 1000;
/** How old a stored response may be and still answer when the provider is unreachable. */
const STALE_MAX_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const BREAKER_THRESHOLD = 3;
const breakerCooldownMs = () => envInteger("ENCOPA_VENUE_BREAKER_COOLDOWN_MS", 60000, 500, 600000);
/**
 * Consecutive failures trip this and every request is answered from storage until the
 * cooldown passes. The point is not speed: it stops a provider outage from being paid for
 * once per visitor, and it stops us hammering a service that is already struggling.
 */
const breaker = { failures: 0, openedAt: 0 };

type HotPepperShop = {
  id?: string;
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  catch?: string;
  access?: string;
  capacity?: number;
  party_capacity?: number;
  open?: string;
  close?: string;
  private_room?: string;
  free_drink?: string;
  course?: string;
  non_smoking?: string;
  genre?: { name?: string; catch?: string };
  budget?: { name?: string; average?: string };
  urls?: { pc?: string };
  photo?: { pc?: { l?: string; m?: string } };
};

type HotPepperPayload = {
  results?: {
    error?: Array<{ message?: string }>;
    results_available?: number;
    shop?: HotPepperShop[];
  };
};

type Priority = "balance" | "conversation" | "cost" | "access";

export async function POST(request: NextRequest) {
  try {
    const body = await readBody(request);
    const prefecture = prefectureByCode(body.prefectureCode);
    if (!prefecture) throw new HttpError(400, "都道府県を選択してください。");
    const purpose = short(body.purpose, 40, "目的");
    const budget = boundedNumber(body.budget, 1000, 30000, "予算");
    const people = boundedNumber(body.people, 2, 200, "人数");
    const priority = parsePriority(body.priority);
    const privateRoom = body.privateRoom === true;
    const dietary = body.dietary === true;
    const apiKey = process.env.HOTPEPPER_API_KEY;
    if (!apiKey) throw new HttpError(503, "店舗検索の設定が完了していません。管理者にお問い合わせください。");

    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    await limit(`venue-search:${forwarded}`, envInteger("ENCOPA_VENUE_IP_HOURLY_LIMIT", 30, 1, 1000), 3600);

    const trace = traceId();
    // The provider is only ever asked for an area and a party size, so one stored response
    // answers every budget, priority and purpose asked about the same search.
    const key = hash([VENUE_VERSION, prefecture.code, people].join("|"));
    const scoring = { purpose, budget, people, priority, privateRoom, dietary };

    const fresh = await readCache(key, FRESH_TTL_MS, trace);
    if (fresh) {
      log("venue_cache_hit", { traceId: trace, tier: "fresh", shops: fresh.shops.length });
      return venueResponse(fresh, scoring, false);
    }

    if (breakerOpen()) {
      const stale = await readCache(key, STALE_MAX_MS, trace);
      if (stale) {
        log("venue_served_stale", { traceId: trace, reason: "breaker_open", ageMs: Date.now() - stale.fetchedAt });
        return venueResponse(stale, scoring, true);
      }
      throw new HttpError(503, "店舗検索が一時的に混み合っています。少し待ってから再度お試しください。");
    }

    // The daily ceiling is a stop, not a slowdown: once the budget for provider calls is
    // spent, the route answers from storage or declines, and never spends more.
    try {
      await limit("venue-provider-daily", envInteger("ENCOPA_VENUE_DAILY_LIMIT", 1000, 1, 100000), 86400);
    } catch {
      const stale = await readCache(key, STALE_MAX_MS, trace);
      if (stale) {
        log("venue_served_stale", { traceId: trace, reason: "daily_cap", ageMs: Date.now() - stale.fetchedAt });
        return venueResponse(stale, scoring, true);
      }
      throw new HttpError(429, "本日の店舗検索の上限に達しました。時間をおいて再度お試しください。");
    }

    let payload: HotPepperPayload;
    try {
      payload = await fetchShops(apiKey, prefecture.code, people, trace);
      breaker.failures = 0;
    } catch (error) {
      breaker.failures += 1;
      if (breaker.failures >= BREAKER_THRESHOLD) breaker.openedAt = Date.now();
      logError("venue_provider_failed", { traceId: trace, error: error instanceof Error ? error.name : "unknown", consecutiveFailures: breaker.failures });
      // A stale answer beats no answer: the organiser can still compare, and the page says
      // when the information was taken.
      const stale = await readCache(key, STALE_MAX_MS, trace);
      if (stale) {
        log("venue_served_stale", { traceId: trace, reason: "provider_error", ageMs: Date.now() - stale.fetchedAt });
        return venueResponse(stale, scoring, true);
      }
      throw error;
    }

    const entry: CacheEntry = {
      shops: payload.results?.shop ?? [],
      total: Number(payload.results?.results_available ?? 0),
      fetchedAt: Date.now(),
    };
    await writeCache(key, entry, trace);
    log("venue_provider_call", { traceId: trace, shops: entry.shops.length });
    return venueResponse(entry, scoring, false);
  } catch (error) {
    if (error instanceof TransientProviderError) return NextResponse.json({ error: error.httpError.message }, { status: error.httpError.status, headers: { "Cache-Control": "no-store" } });
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    if (error instanceof Error && error.name === "AbortError") return NextResponse.json({ error: "店舗検索に時間がかかっています。少し待って再度お試しください。" }, { status: 504, headers: { "Cache-Control": "no-store" } });
    console.error("[encopa] venue search failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "店舗情報を取得できませんでした。少し待って再度お試しください。" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

type CacheEntry = { shops: HotPepperShop[]; total: number; fetchedAt: number };
type Scoring = { purpose: string; budget: number; people: number; priority: Priority; privateRoom: boolean; dietary: boolean };

/**
 * Scoring happens per request, not per provider call: two organisers searching the same
 * area with different budgets share one stored response but get their own ranking.
 */
function venueResponse(entry: CacheEntry, scoring: Scoring, stale: boolean) {
  const venues = entry.shops
    .map((shop) => normalize(shop, scoring))
    .filter((venue): venue is VenueSearchResult => venue !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 9);
  const data: VenueSearchResponse = {
    venues,
    total: entry.total || venues.length,
    provider: "ホットペッパー グルメ",
    fetchedAt: entry.fetchedAt,
    ...(stale ? { stale: true } : {}),
  };
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}

/**
 * One retry, and only for a failure that a retry can fix. A rejected key or a rate limit is
 * permanent for this request: retrying it wastes the provider's budget and ours, and delays
 * the error the organiser needs to see.
 */
async function fetchShops(apiKey: string, areaCode: string, people: number, trace: string): Promise<HotPepperPayload> {
  const params = new URLSearchParams({
    key: apiKey,
    large_area: areaCode,
    party_capacity: String(people),
    count: "30",
    order: "4",
    format: "json",
  });
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await callProvider(params);
    } catch (error) {
      const retryable = error instanceof TransientProviderError;
      if (!retryable || attempt >= 1) throw error;
      log("venue_provider_retry", { traceId: trace, error: error instanceof Error ? error.name : "unknown" });
      // Jittered, so several instances failing together do not retry in lockstep.
      await new Promise((resolve) => setTimeout(resolve, 250 + Math.floor(Math.random() * 250)));
    }
  }
}

/** Marks the failures that are worth trying again: a timeout, a network drop, a 5xx. */
class TransientProviderError extends Error {
  constructor(public readonly status: number, public readonly httpError: HttpError) {
    super(`provider_${status}`);
    this.name = "TransientProviderError";
  }
}

async function callProvider(params: URLSearchParams): Promise<HotPepperPayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${providerUrl()}?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    // A timeout or a dropped connection says nothing about the request itself.
    throw new TransientProviderError(0, new HttpError(error instanceof Error && error.name === "AbortError" ? 504 : 503, "店舗検索に時間がかかっています。少し待って再度お試しください。"));
  } finally {
    clearTimeout(timeout);
  }
  if (response.status === 401 || response.status === 403) {
    console.error("[encopa] venue provider authentication rejected", response.status);
    throw new HttpError(503, "店舗検索の接続設定を確認しています。しばらくしてからお試しください。");
  }
  if (response.status === 429) throw new HttpError(429, "検索が集中しています。少し待ってからお試しください。");
  if (response.status >= 500) {
    console.error("[encopa] venue provider HTTP error", response.status);
    throw new TransientProviderError(response.status, new HttpError(502, "店舗検索サービスが一時的に利用できません。少し待って再度お試しください。"));
  }
  if (!response.ok) {
    console.error("[encopa] venue provider HTTP error", response.status);
    throw new HttpError(502, "店舗検索サービスが一時的に利用できません。少し待って再度お試しください。");
  }
  const payload = await response.json() as HotPepperPayload;
  if (payload.results?.error?.length) {
    const providerMessage = payload.results.error.map((item) => item.message || "").join(" ");
    console.error("[encopa] venue provider API error", providerErrorKind(providerMessage));
    if (/key|キー|認証|authorization/i.test(providerMessage)) throw new HttpError(503, "店舗検索の接続設定を確認しています。しばらくしてからお試しください。");
    throw new HttpError(502, "店舗検索サービスが一時的に利用できません。少し待って再度お試しください。");
  }
  return payload;
}

/**
 * The provider host is fixed. An override exists so the integration tests can point at a
 * mock, but it only loosens the scheme and host behind an explicit opt-in, so a stray
 * environment variable in production cannot send the API key somewhere else.
 */
function providerUrl() {
  const raw = process.env.HOTPEPPER_BASE_URL?.trim() || HOTPEPPER_URL;
  const url = new URL(raw);
  // The opt-in is the flag, not the build mode: the integration suite runs `next start`,
  // which is a production build. The flag is never set in a deployed environment.
  const testLoopback = process.env.HOTPEPPER_ALLOW_INSECURE_LOCALHOST === "true"
    && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  if (!testLoopback && (url.protocol !== "https:" || url.hostname !== "webservice.recruit.co.jp")) {
    throw new HttpError(503, "店舗検索の接続先が許可されていません。");
  }
  return url.toString();
}

function breakerOpen() {
  if (breaker.failures < BREAKER_THRESHOLD) return false;
  if (Date.now() - breaker.openedAt < breakerCooldownMs()) return true;
  breaker.failures = 0;
  breaker.openedAt = 0;
  return false;
}

/** Storage is an optimisation, never a dependency: a failure here falls through to a call. */
async function readCache(key: string, maxAgeMs: number, trace: string): Promise<CacheEntry | null> {
  try {
    const db = await database();
    const r = await db.execute({ sql: "SELECT payload,created_at FROM encopa_venue_cache WHERE key=? AND created_at>?", args: [key, Date.now() - maxAgeMs] });
    if (!r.rows.length) return null;
    const parsed = JSON.parse(String(r.rows[0].payload)) as { shops?: unknown; total?: unknown };
    if (!Array.isArray(parsed.shops)) return null;
    return { shops: parsed.shops as HotPepperShop[], total: Number(parsed.total) || 0, fetchedAt: Number(r.rows[0].created_at) };
  } catch (error) {
    logError("venue_cache_read_failed", { traceId: trace, error: error instanceof Error ? error.name : "unknown" });
    return null;
  }
}

async function writeCache(key: string, entry: CacheEntry, trace: string) {
  try {
    const db = await database();
    if (Math.random() < 0.02) await db.execute({ sql: "DELETE FROM encopa_venue_cache WHERE created_at<=?", args: [Date.now() - STALE_MAX_MS] });
    await db.execute({
      sql: "INSERT INTO encopa_venue_cache(key,payload,created_at,expires_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,created_at=excluded.created_at,expires_at=excluded.expires_at",
      args: [key, JSON.stringify({ shops: entry.shops, total: entry.total }), entry.fetchedAt, entry.fetchedAt + FRESH_TTL_MS],
    });
  } catch (error) {
    logError("venue_cache_write_failed", { traceId: trace, error: error instanceof Error ? error.name : "unknown" });
  }
}

function envInteger(name: string, fallback: number, min: number, max: number) {
  const number = Number(process.env[name]);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

function providerErrorKind(message: string) {
  if (/key|キー|認証|authorization/i.test(message)) return "authentication";
  if (/limit|回数|上限|too many/i.test(message)) return "rate_limit";
  return "provider_error";
}

function normalize(shop: HotPepperShop, query: { purpose: string; budget: number; people: number; priority: Priority; privateRoom: boolean; dietary: boolean }): VenueSearchResult | null {
  const id = text(shop.id, 80);
  const name = text(shop.name, 120);
  const address = text(shop.address, 200);
  const url = safeUrl(shop.urls?.pc);
  if (!id || !name || !address || !url) return null;
  const estimatedPrice = estimatePrice(shop.budget?.average || shop.budget?.name || "");
  const partyCapacity = positiveNumber(shop.party_capacity);
  const capacity = positiveNumber(shop.capacity);
  const privateRoom = shop.private_room === "あり";
  const freeDrink = shop.free_drink === "あり";
  const course = shop.course === "あり";
  const budgetFit = estimatedPrice === null ? 65 : Math.max(10, Math.min(100, Math.round(100 - Math.abs(query.budget - estimatedPrice) / 45)));
  const capacityFit = partyCapacity === null ? 65 : partyCapacity >= query.people ? 100 : 20;
  const conversationFit = query.privateRoom ? privateRoom ? 100 : 35 : privateRoom ? 90 : 75;
  const conditionFit = Math.round((capacityFit + conversationFit) / 2);
  const convenience = Math.round((capacityFit + (privateRoom ? 95 : 70) + (freeDrink ? 95 : 70) + (course ? 90 : 65) + (shop.access ? 90 : 55)) / 5);
  const weights = query.priority === "cost" ? [.28, .52, .2]
    : query.priority === "conversation" ? [.58, .18, .24]
      : query.priority === "access" ? [.3, .2, .5]
        : [.45, .3, .25];
  const score = Math.max(35, Math.min(99, Math.round(conditionFit * weights[0] + budgetFit * weights[1] + convenience * weights[2])));
  const strengths = [
    estimatedPrice !== null && estimatedPrice <= query.budget ? "予算の目安内" : "料金は店舗へ確認",
    partyCapacity !== null && partyCapacity >= query.people ? `${query.people}名以上の宴会に対応` : "宴会人数は店舗へ確認",
    privateRoom ? "個室あり" : "席タイプは店舗へ確認",
    freeDrink ? "飲み放題あり" : "",
  ].filter(Boolean).slice(0, 3);

  return {
    id,
    name,
    genre: text(shop.genre?.name, 80) || "飲食店",
    catchCopy: text(shop.catch || shop.genre?.catch, 180),
    address,
    access: text(shop.access, 220) || "アクセスは店舗ページで確認",
    latitude: finiteNumber(shop.lat),
    longitude: finiteNumber(shop.lng),
    budgetLabel: text(shop.budget?.average || shop.budget?.name, 100) || "店舗へ確認",
    estimatedPrice,
    capacity,
    partyCapacity,
    privateRoom,
    freeDrink,
    course,
    nonSmoking: text(shop.non_smoking, 80),
    openingHours: text(shop.open, 300),
    closed: text(shop.close, 120),
    url,
    photoUrl: safeImageUrl(shop.photo?.pc?.l || shop.photo?.pc?.m),
    score,
    reason: `${strengths.join("・")}。${query.purpose}の条件と「${priorityLabel(query.priority)}」をもとに並べています。${query.dietary ? "食事制限は予約前に店舗へ確認してください。" : ""}`,
    breakdown: { fit: conditionFit, budget: budgetFit, convenience },
  };
}

function boundedNumber(value: unknown, min: number, max: number, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new HttpError(400, `${label}を確認してください。`);
  return number;
}
function parsePriority(value: unknown): Priority {
  return value === "conversation" || value === "cost" || value === "access" || value === "balance" ? value : "balance";
}
function priorityLabel(value: Priority) {
  return value === "conversation" ? "会話しやすさ" : value === "cost" ? "予算" : value === "access" ? "アクセス情報" : "バランス";
}
function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function finiteNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function positiveNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) && number > 0 ? Math.round(number) : null; }
function estimatePrice(value: string) {
  const prices = [...value.matchAll(/\d{3,6}/g)].map((match) => Number(match[0])).filter((number) => number >= 500 && number <= 100000);
  if (!prices.length) return null;
  return Math.round(prices.reduce((sum, number) => sum + number, 0) / prices.length);
}
function safeUrl(value: unknown) { const url = text(value, 500); return /^https:\/\//i.test(url) ? url : ""; }
function safeImageUrl(value: unknown) { const url = text(value, 500); return /^https:\/\/imgfp\.hotp\.jp\//i.test(url) ? url : ""; }

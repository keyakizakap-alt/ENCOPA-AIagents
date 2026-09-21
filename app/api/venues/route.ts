import { NextResponse, type NextRequest } from "next/server";
import type { VenueSearchResponse, VenueSearchResult } from "@/lib/venue-types";
import { prefectureByCode } from "@/lib/prefectures";
import { HttpError, limit, readBody, short } from "@/lib/server/security";

export const runtime = "nodejs";

const HOTPEPPER_URL = "https://webservice.recruit.co.jp/hotpepper/gourmet/v1/";

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
    await limit(`venue-search:${forwarded}`, 30, 3600);

    const params = new URLSearchParams({
      key: apiKey,
      large_area: prefecture.code,
      party_capacity: String(people),
      count: "30",
      order: "4",
      format: "json",
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let response: Response;
    try {
      response = await fetch(`${HOTPEPPER_URL}?${params.toString()}`, {
        signal: controller.signal,
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
    } finally {
      clearTimeout(timeout);
    }
    if (response.status === 401 || response.status === 403) {
      console.error("[encopa] venue provider authentication rejected", response.status);
      throw new HttpError(503, "店舗検索の接続設定を確認しています。しばらくしてからお試しください。");
    }
    if (response.status === 429) throw new HttpError(429, "検索が集中しています。少し待ってからお試しください。");
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

    const venues = (payload.results?.shop ?? [])
      .map((shop) => normalize(shop, { purpose, budget, people, priority, privateRoom, dietary }))
      .filter((venue): venue is VenueSearchResult => venue !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 9);

    const data: VenueSearchResponse = {
      venues,
      total: Number(payload.results?.results_available ?? venues.length),
      provider: "ホットペッパー グルメ",
      fetchedAt: Date.now(),
    };
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    if (error instanceof Error && error.name === "AbortError") return NextResponse.json({ error: "店舗検索に時間がかかっています。少し待って再度お試しください。" }, { status: 504, headers: { "Cache-Control": "no-store" } });
    console.error("[encopa] venue search failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "店舗情報を取得できませんでした。少し待って再度お試しください。" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
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

import { NextResponse, type NextRequest } from "next/server";
import { HttpError, limit, readBody } from "@/lib/server/security";

const ORCA_URL = "https://api.orcarouter.ai/v1/chat/completions";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const traceId = crypto.randomUUID();
  let body: unknown;
  try { body = await readBody(request); } catch (error) {
    return NextResponse.json({ error: error instanceof HttpError ? error.message : "入力を確認してください。" }, { status: error instanceof HttpError ? error.status : 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;

  const purpose = clean(input.purpose, 40);
  const area = clean(input.area, 80);
  const priority = clean(input.priority, 30);
  const budget = clampNumber(input.budget, 1000, 30000);
  const people = clampNumber(input.people, 2, 200);
  if (!purpose || !area || !budget || !people) {
    return NextResponse.json({ error: "invalid_criteria" }, { status: 400 });
  }

  const apiKey = process.env.ORCAROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      router: "OrcaRouter",
      route: "deterministic-fallback",
      model: null,
      traceId,
      latencyMs: Date.now() - startedAt,
      tokenBudget: 0,
      summary: "OrcaRouter接続待機中。検証済みのローカル評価へ安全に切り替えました。",
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const requestedLimit = Number(process.env.ENCOPA_AI_DAILY_LIMIT || 100);
    const dailyLimit = Number.isInteger(requestedLimit) && requestedLimit > 0 && requestedLimit <= 10000 ? requestedLimit : 100;
    await limit("orca-global-daily", dailyLimit, 86400);
    const response = await fetch(ORCA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "orcarouter/auto",
        temperature: 0.15,
        max_tokens: 220,
        messages: [
          {
            role: "system",
            content: "You are a venue-planning analyst. Return a concise Japanese explanation of the ranking policy. Never request personal data. Do not claim a reservation or real-time availability.",
          },
          {
            role: "user",
            content: JSON.stringify({ purpose, area, budget, people, priority }),
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`orca_http_${response.status}`);
    const data = await response.json() as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const summary = data?.choices?.[0]?.message?.content;
    return NextResponse.json({
      router: "OrcaRouter",
      route: "orcarouter/auto",
      model: data?.model ?? "auto-selected",
      traceId,
      latencyMs: Date.now() - startedAt,
      tokenBudget: 220,
      summary: typeof summary === "string" ? summary.slice(0, 800) : "条件に応じて評価方針を更新しました。",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      router: "OrcaRouter",
      route: "deterministic-fallback",
      model: null,
      traceId,
      latencyMs: Date.now() - startedAt,
      tokenBudget: 0,
      summary: "外部モデルが応答しなかったため、候補生成を止めずローカル評価へ切り替えました。",
    }, { headers: { "Cache-Control": "no-store" } });
  } finally {
    clearTimeout(timeout);
  }
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function clampNumber(value: unknown, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : 0;
}

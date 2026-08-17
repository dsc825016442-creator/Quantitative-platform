import { desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { marketSnapshots } from "../../../db/schema";
import type { AnalyticsSnapshot, MarketSnapshot } from "../../../lib/market-snapshot";

export const dynamic = "force-dynamic";

type RuntimeEnv = typeof env & { REFRESH_SECRET?: string };

async function authorized(request: Request) {
  const expected = (env as RuntimeEnv).REFRESH_SECRET;
  if (!expected) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!provided) return false;
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function validAnalytics(value: unknown): value is AnalyticsSnapshot {
  if (!value || typeof value !== "object") return false;
  const analytics = value as Partial<AnalyticsSnapshot>;
  return analytics.engine === "python"
    && analytics.schemaVersion === "research-analytics/v1"
    && typeof analytics.generatedAt === "string"
    && Array.isArray(analytics.observations)
    && analytics.observations.length >= 3
    && Array.isArray(analytics.factors)
    && analytics.factors.length >= 5
    && Array.isArray(analytics.portfolio)
    && analytics.portfolio.length === 5
    && analytics.portfolio.every(item => Number.isFinite(item.weight))
    && Math.abs(analytics.portfolio.reduce((sum, item) => sum + item.weight, 0) - 100) < 0.01
    && (analytics.backtest === null || (
      Number.isFinite(analytics.backtest.totalReturnPct)
      && Number.isFinite(analytics.backtest.benchmarkReturnPct)
      && Number.isFinite(analytics.backtest.maxDrawdownPct)
    ));
}

async function latestSnapshot() {
  const db = getDb();
  const [row] = await db.select().from(marketSnapshots).orderBy(desc(marketSnapshots.generatedAt)).limit(1);
  return { db, row };
}

export async function GET(request: Request) {
  if (!(await authorized(request))) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { row } = await latestSnapshot();
  if (!row) return Response.json({ ok: false, error: "snapshot unavailable" }, { status: 404 });
  const snapshot = JSON.parse(row.payload) as MarketSnapshot;
  if (!snapshot.researchInputs) {
    return Response.json({ ok: false, error: "research inputs unavailable; refresh market first" }, { status: 409 });
  }
  return Response.json({ ok: true, inputs: snapshot.researchInputs }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await authorized(request))) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const payload = await request.json() as { tradeDate?: string; analytics?: unknown };
  if (!payload.tradeDate || !validAnalytics(payload.analytics)) {
    return Response.json({ ok: false, error: "invalid analytics payload" }, { status: 400 });
  }
  const { db, row } = await latestSnapshot();
  if (!row) return Response.json({ ok: false, error: "snapshot unavailable" }, { status: 404 });
  if (row.tradeDate !== payload.tradeDate) {
    return Response.json({ ok: false, error: "stale analytics trade date" }, { status: 409 });
  }
  const snapshot = JSON.parse(row.payload) as MarketSnapshot;
  snapshot.analytics = payload.analytics;
  snapshot.modules.Python研究引擎 = {
    status: "live",
    records: payload.analytics.factors.length + payload.analytics.portfolio.length + payload.analytics.observations.length,
    message: `Python ${payload.analytics.schemaVersion} · ${payload.analytics.generatedAt}`,
  };
  await db.update(marketSnapshots).set({ payload: JSON.stringify(snapshot) }).where(eq(marketSnapshots.id, row.id));
  return Response.json({ ok: true, tradeDate: row.tradeDate, engine: payload.analytics.engine });
}

import { desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { marketSnapshots } from "../../../db/schema";
import { buildMarketSnapshot } from "../../../lib/tushare";

export const dynamic = "force-dynamic";

type RuntimeEnv = typeof env & { TUSHARE_TOKEN?: string };

function chinaClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    minutes: Number(value.hour) * 60 + Number(value.minute),
  };
}

export async function POST() {
  try {
    const token = (env as RuntimeEnv).TUSHARE_TOKEN;
    if (!token) {
      return Response.json({ ok: false, error: "TUSHARE_TOKEN is not configured" }, { status: 503 });
    }

    const db = getDb();
    const [latest] = await db
      .select()
      .from(marketSnapshots)
      .orderBy(desc(marketSnapshots.generatedAt))
      .limit(1);
    const now = chinaClock();
    if (latest && chinaClock(new Date(latest.generatedAt)).date === now.date) {
      return Response.json({ ok: true, updated: false, reason: "already_refreshed_today", tradeDate: latest.tradeDate });
    }
    if (latest && now.minutes < 18 * 60 + 25) {
      return Response.json({ ok: false, error: "daily refresh window opens at 18:25 Asia/Shanghai" }, { status: 425 });
    }
    const snapshot = await buildMarketSnapshot(token);

    if (latest?.tradeDate === snapshot.tradeDate && latest.status === "live" && snapshot.status !== "live") {
      return Response.json({ ok: true, updated: false, reason: "kept_more_complete_snapshot", tradeDate: latest.tradeDate });
    }

    const existing = await db
      .select({ id: marketSnapshots.id })
      .from(marketSnapshots)
      .where(eq(marketSnapshots.tradeDate, snapshot.tradeDate))
      .limit(1);
    const values = {
      tradeDate: snapshot.tradeDate,
      generatedAt: snapshot.generatedAt,
      status: snapshot.status,
      payload: JSON.stringify(snapshot),
    };

    if (existing[0]) {
      await db.update(marketSnapshots).set(values).where(eq(marketSnapshots.id, existing[0].id));
    } else {
      await db.insert(marketSnapshots).values(values);
    }

    return Response.json({
      ok: true,
      updated: true,
      tradeDate: snapshot.tradeDate,
      status: snapshot.status,
      modules: snapshot.modules,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "refresh failed",
    }, { status: 500 });
  }
}

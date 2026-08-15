import { desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { marketSnapshots, refreshRuns } from "../../../db/schema";
import { buildMarketSnapshot } from "../../../lib/tushare";

export const dynamic = "force-dynamic";

type RuntimeEnv = typeof env & {
  TUSHARE_TOKEN?: string;
  REFRESH_SECRET?: string;
};

async function secretsEqual(provided: string, expected: string) {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

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

export async function POST(request: Request) {
  try {
    const runtimeEnv = env as RuntimeEnv;
    const token = runtimeEnv.TUSHARE_TOKEN;
    const refreshSecret = runtimeEnv.REFRESH_SECRET;
    if (!token || !refreshSecret) {
      return Response.json({ ok: false, error: "refresh secrets are not configured" }, { status: 503 });
    }
    const authorization = request.headers.get("authorization") ?? "";
    const providedSecret = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!providedSecret || !(await secretsEqual(providedSecret, refreshSecret))) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const [latest] = await db
      .select()
      .from(marketSnapshots)
      .orderBy(desc(marketSnapshots.generatedAt))
      .limit(1);
    const now = chinaClock();
    const force = request.headers.get("x-refresh-force") === "true";
    if (!force && latest && chinaClock(new Date(latest.generatedAt)).date === now.date) {
      return Response.json({ ok: true, updated: false, reason: "already_refreshed_today", tradeDate: latest.tradeDate });
    }
    if (!force && latest && now.minutes < 18 * 60 + 25) {
      return Response.json({ ok: false, error: "daily refresh window opens at 18:25 Asia/Shanghai" }, { status: 425 });
    }
    const startedAt = new Date().toISOString();
    const [run] = await db.insert(refreshRuns).values({
      startedAt,
      status: "running",
      message: force ? "manual forced refresh" : "scheduled refresh",
    }).returning({ id: refreshRuns.id });

    try {
      const snapshot = await buildMarketSnapshot(token);

      if (latest?.tradeDate === snapshot.tradeDate && latest.status === "live" && snapshot.quality.score < 70) {
        await db.update(refreshRuns).set({
          finishedAt: new Date().toISOString(),
          status: "skipped",
          tradeDate: latest.tradeDate,
          message: "kept more complete snapshot",
          moduleSummary: JSON.stringify(snapshot.modules),
        }).where(eq(refreshRuns.id, run.id));
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
      await db.update(refreshRuns).set({
        finishedAt: new Date().toISOString(),
        status: snapshot.status === "live" ? "succeeded" : "partial",
        tradeDate: snapshot.tradeDate,
        message: `quality score ${snapshot.quality.score}`,
        moduleSummary: JSON.stringify(snapshot.modules),
      }).where(eq(refreshRuns.id, run.id));

      return Response.json({
        ok: true,
        updated: true,
        tradeDate: snapshot.tradeDate,
        status: snapshot.status,
        quality: snapshot.quality,
        modules: snapshot.modules,
      });
    } catch (error) {
      await db.update(refreshRuns).set({
        finishedAt: new Date().toISOString(),
        status: "failed",
        message: error instanceof Error ? error.message : "refresh failed",
      }).where(eq(refreshRuns.id, run.id));
      throw error;
    }
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "refresh failed",
    }, { status: 500 });
  }
}

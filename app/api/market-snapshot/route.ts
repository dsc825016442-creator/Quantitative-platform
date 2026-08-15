import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { marketSnapshots, refreshRuns } from "../../../db/schema";
import type { MarketSnapshot } from "../../../lib/market-snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(marketSnapshots)
      .orderBy(desc(marketSnapshots.generatedAt))
      .limit(1);
    const [latestRun] = await db
      .select()
      .from(refreshRuns)
      .orderBy(desc(refreshRuns.startedAt))
      .limit(1);

    if (!row) {
      return Response.json({ snapshot: null, latestRun: latestRun ?? null, status: "waiting_for_first_refresh" });
    }
    const freshnessHours = Math.max(0, (Date.now() - new Date(row.generatedAt).getTime()) / 3_600_000);
    return Response.json({
      snapshot: JSON.parse(row.payload) as MarketSnapshot,
      latestRun: latestRun ?? null,
      freshnessHours,
      status: row.status,
    }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return Response.json({
      snapshot: null,
      status: "database_unavailable",
      error: error instanceof Error ? error.message : "database unavailable",
    }, { status: 503 });
  }
}

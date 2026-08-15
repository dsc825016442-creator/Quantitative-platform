import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { marketSnapshots } from "../../../db/schema";
import type { MarketSnapshot } from "../../../lib/market-snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [row] = await getDb()
      .select()
      .from(marketSnapshots)
      .orderBy(desc(marketSnapshots.generatedAt))
      .limit(1);

    if (!row) {
      return Response.json({ snapshot: null, status: "waiting_for_first_refresh" });
    }
    return Response.json({
      snapshot: JSON.parse(row.payload) as MarketSnapshot,
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

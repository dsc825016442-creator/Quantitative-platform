import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const marketSnapshots = sqliteTable("market_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tradeDate: text("trade_date").notNull().unique(),
  generatedAt: text("generated_at").notNull(),
  status: text("status").notNull(),
  payload: text("payload").notNull(),
});

export const refreshRuns = sqliteTable("refresh_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  status: text("status").notNull(),
  tradeDate: text("trade_date"),
  message: text("message").notNull().default(""),
  moduleSummary: text("module_summary").notNull().default("{}"),
}, table => [
  index("idx_refresh_runs_status_started_at").on(table.status, table.startedAt),
]);

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const marketSnapshots = sqliteTable("market_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tradeDate: text("trade_date").notNull().unique(),
  generatedAt: text("generated_at").notNull(),
  status: text("status").notNull(),
  payload: text("payload").notNull(),
});

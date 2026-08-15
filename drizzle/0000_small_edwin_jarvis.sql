CREATE TABLE `market_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trade_date` text NOT NULL,
	`generated_at` text NOT NULL,
	`status` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_snapshots_trade_date_unique` ON `market_snapshots` (`trade_date`);
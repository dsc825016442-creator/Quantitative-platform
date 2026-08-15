CREATE TABLE `refresh_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`trade_date` text,
	`message` text DEFAULT '' NOT NULL,
	`module_summary` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_refresh_runs_status_started_at` ON `refresh_runs` (`status`,`started_at`);
CREATE INDEX `idx_road_reports_status_created` ON `road_reports` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_road_reports_duplicate_of` ON `road_reports` (`duplicate_of`);--> statement-breakpoint
CREATE INDEX `idx_submission_rate_limits_expires` ON `submission_rate_limits` (`expires_at`);--> statement-breakpoint
PRAGMA optimize;

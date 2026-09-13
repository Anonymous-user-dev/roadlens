CREATE TABLE `submission_rate_limits` (
	`fingerprint` text PRIMARY KEY NOT NULL,
	`request_count` integer DEFAULT 1 NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `road_reports` ADD `location_accuracy` real;--> statement-breakpoint
ALTER TABLE `road_reports` ADD `location_source` text DEFAULT 'approximate' NOT NULL;--> statement-breakpoint
ALTER TABLE `road_reports` ADD `defect_type` text;--> statement-breakpoint
ALTER TABLE `road_reports` ADD `ai_explanation` text;--> statement-breakpoint
ALTER TABLE `road_reports` ADD `duplicate_of` text;--> statement-breakpoint
ALTER TABLE `road_reports` ADD `reviewer_note` text;--> statement-breakpoint
ALTER TABLE `road_reports` ADD `reviewed_at` text;--> statement-breakpoint
ALTER TABLE `road_reports` ADD `updated_at` text;
CREATE TABLE `review_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`action` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`reviewer` text NOT NULL,
	`details` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_review_audit_report_created` ON `review_audit_events` (`report_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_review_audit_created` ON `review_audit_events` (`created_at`);
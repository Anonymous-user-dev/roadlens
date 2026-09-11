CREATE TABLE `road_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`street` text NOT NULL,
	`detail` text NOT NULL,
	`severity` text NOT NULL,
	`confidence` real,
	`confirmations` integer DEFAULT 1 NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`image_key` text,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`created_at` text NOT NULL
);

CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`record_id` text,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`previous_status` text,
	`new_status` text,
	`details` text,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_events_created_at` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_events_record_id` ON `audit_events` (`record_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `source_monitoring` (
	`id` text PRIMARY KEY NOT NULL,
	`discovered_at` text NOT NULL,
	`publication_date` text,
	`publisher` text NOT NULL,
	`title` text NOT NULL,
	`language` text NOT NULL,
	`presence` text NOT NULL,
	`topic` text NOT NULL,
	`source_url` text NOT NULL,
	`discovery_type` text NOT NULL,
	`query_text` text,
	`link_status` text NOT NULL,
	`http_status` integer,
	`last_checked_at` text,
	`verification_status` text NOT NULL,
	`notes` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_source_monitoring_url` ON `source_monitoring` (`source_url`);--> statement-breakpoint
CREATE INDEX `idx_source_monitoring_discovered_at` ON `source_monitoring` (`discovered_at`);--> statement-breakpoint
CREATE INDEX `idx_source_monitoring_link_status` ON `source_monitoring` (`link_status`,`last_checked_at`);--> statement-breakpoint
ALTER TABLE `google_form_intake` ADD `edition_city` text;--> statement-breakpoint
ALTER TABLE `google_form_intake` ADD `media_type` text;--> statement-breakpoint
ALTER TABLE `google_form_intake` ADD `ocr_text` text;--> statement-breakpoint
ALTER TABLE `google_form_intake` ADD `ocr_confidence` real;--> statement-breakpoint
ALTER TABLE `google_form_intake` ADD `ocr_engine` text;--> statement-breakpoint
ALTER TABLE `google_form_intake` ADD `duplicate_score` real;--> statement-breakpoint
ALTER TABLE `google_form_intake` ADD `duplicate_record_id` text;--> statement-breakpoint
ALTER TABLE `google_form_intake` ADD `duplicate_reasons` text;--> statement-breakpoint
ALTER TABLE `google_form_intake` ADD `link_status` text;--> statement-breakpoint
ALTER TABLE `google_form_intake` ADD `link_http_status` integer;--> statement-breakpoint
ALTER TABLE `google_form_intake` ADD `last_link_check` text;--> statement-breakpoint
ALTER TABLE `google_form_intake` ADD `verification_status` text;--> statement-breakpoint
ALTER TABLE `google_form_intake` ADD `reviewed_by` text;--> statement-breakpoint
ALTER TABLE `google_form_intake` ADD `reviewed_at` text;--> statement-breakpoint
ALTER TABLE `google_form_intake` ADD `updated_at` text;
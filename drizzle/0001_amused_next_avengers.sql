CREATE TABLE `google_form_intake` (
	`id` text PRIMARY KEY NOT NULL,
	`sha256` text NOT NULL,
	`received_at` text NOT NULL,
	`form_timestamp` text,
	`form_response_id` text,
	`drive_file_id` text,
	`drive_file_url` text,
	`drive_folder_url` text,
	`sheet_row` integer,
	`submitter_email` text,
	`original_filename` text NOT NULL,
	`original_key` text NOT NULL,
	`original_content_type` text NOT NULL,
	`original_size` integer NOT NULL,
	`publication_date` text NOT NULL,
	`publisher` text NOT NULL,
	`page` text,
	`language` text NOT NULL,
	`headline` text NOT NULL,
	`presence` text NOT NULL,
	`notes` text NOT NULL,
	`source_url` text,
	`status` text NOT NULL,
	`error_message` text,
	`approved_at` text,
	`approved_record_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_google_form_intake_sha256` ON `google_form_intake` (`sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_google_form_intake_drive_file_id` ON `google_form_intake` (`drive_file_id`);--> statement-breakpoint
CREATE INDEX `idx_google_form_intake_status_received_at` ON `google_form_intake` (`status`,`received_at`);--> statement-breakpoint
CREATE INDEX `idx_google_form_intake_publication_date` ON `google_form_intake` (`publication_date`);--> statement-breakpoint
CREATE INDEX `idx_google_form_intake_publisher` ON `google_form_intake` (`publisher`);
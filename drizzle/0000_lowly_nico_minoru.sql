CREATE TABLE `clipping_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`sha256` text NOT NULL,
	`uploaded_at` text NOT NULL,
	`original_filename` text NOT NULL,
	`original_key` text NOT NULL,
	`enhanced_key` text NOT NULL,
	`original_content_type` text NOT NULL,
	`enhanced_content_type` text NOT NULL,
	`original_size` integer NOT NULL,
	`enhanced_size` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`publisher` text NOT NULL,
	`publication_date` text NOT NULL,
	`page` text,
	`language` text NOT NULL,
	`headline` text NOT NULL,
	`ocr_text` text NOT NULL,
	`ocr_confidence` real,
	`ocr_languages` text NOT NULL,
	`presence` text NOT NULL,
	`status` text NOT NULL,
	`reviewed` integer NOT NULL,
	`notes` text NOT NULL,
	`source_url` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_clipping_uploads_sha256` ON `clipping_uploads` (`sha256`);--> statement-breakpoint
CREATE INDEX `idx_clipping_uploads_publication_date` ON `clipping_uploads` (`publication_date`);--> statement-breakpoint
CREATE INDEX `idx_clipping_uploads_publisher` ON `clipping_uploads` (`publisher`);--> statement-breakpoint
CREATE INDEX `idx_clipping_uploads_uploaded_at` ON `clipping_uploads` (`uploaded_at`);--> statement-breakpoint
PRAGMA optimize;

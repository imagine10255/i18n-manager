CREATE TABLE `shared_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyPath` varchar(512) NOT NULL,
	`description` text,
	`isDeleted` boolean NOT NULL DEFAULT false,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shared_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `shared_keys_keyPath_unique` UNIQUE(`keyPath`)
);
--> statement-breakpoint
CREATE TABLE `shared_translation_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sharedKeyId` int NOT NULL,
	`localeCode` varchar(16) NOT NULL,
	`oldValue` text,
	`newValue` text,
	`changedBy` int NOT NULL,
	`changedAt` timestamp NOT NULL DEFAULT (now()),
	`action` enum('create','update','delete') NOT NULL,
	CONSTRAINT `shared_translation_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shared_translations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sharedKeyId` int NOT NULL,
	`localeCode` varchar(16) NOT NULL,
	`value` text,
	`isTranslated` boolean NOT NULL DEFAULT false,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shared_translations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
DROP TABLE `template_keys`;--> statement-breakpoint
DROP TABLE `template_translations`;--> statement-breakpoint
DROP TABLE `templates`;--> statement-breakpoint
DROP INDEX `idx_template_key` ON `translation_keys`;--> statement-breakpoint
ALTER TABLE `translation_keys` ADD `sharedKeyId` int;--> statement-breakpoint
CREATE INDEX `idx_skey_path` ON `shared_keys` (`keyPath`);--> statement-breakpoint
CREATE INDEX `idx_skey_deleted` ON `shared_keys` (`isDeleted`);--> statement-breakpoint
CREATE INDEX `idx_shist_key` ON `shared_translation_history` (`sharedKeyId`);--> statement-breakpoint
CREATE INDEX `idx_shist_locale` ON `shared_translation_history` (`localeCode`);--> statement-breakpoint
CREATE INDEX `idx_shist_changed_by` ON `shared_translation_history` (`changedBy`);--> statement-breakpoint
CREATE INDEX `idx_shist_changed_at` ON `shared_translation_history` (`changedAt`);--> statement-breakpoint
CREATE INDEX `idx_str_key_locale` ON `shared_translations` (`sharedKeyId`,`localeCode`);--> statement-breakpoint
CREATE INDEX `idx_str_locale` ON `shared_translations` (`localeCode`);--> statement-breakpoint
CREATE INDEX `idx_shared_key` ON `translation_keys` (`sharedKeyId`);--> statement-breakpoint
ALTER TABLE `translation_keys` DROP COLUMN `templateKeyId`;
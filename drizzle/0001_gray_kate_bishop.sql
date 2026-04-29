CREATE TABLE `locales` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(16) NOT NULL,
	`name` varchar(64) NOT NULL,
	`nativeName` varchar(64) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `locales_id` PRIMARY KEY(`id`),
	CONSTRAINT `locales_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `translation_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyId` int NOT NULL,
	`localeCode` varchar(16) NOT NULL,
	`oldValue` text,
	`newValue` text,
	`changedBy` int NOT NULL,
	`changedAt` timestamp NOT NULL DEFAULT (now()),
	`action` enum('create','update','delete') NOT NULL,
	CONSTRAINT `translation_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `translation_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyPath` varchar(512) NOT NULL,
	`description` text,
	`tags` varchar(256),
	`isDeleted` boolean NOT NULL DEFAULT false,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `translation_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `translation_keys_keyPath_unique` UNIQUE(`keyPath`)
);
--> statement-breakpoint
CREATE TABLE `translations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyId` int NOT NULL,
	`localeCode` varchar(16) NOT NULL,
	`value` text,
	`isTranslated` boolean NOT NULL DEFAULT false,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `translations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','editor','rd','qa') NOT NULL DEFAULT 'rd';--> statement-breakpoint
CREATE INDEX `idx_history_key` ON `translation_history` (`keyId`);--> statement-breakpoint
CREATE INDEX `idx_history_locale` ON `translation_history` (`localeCode`);--> statement-breakpoint
CREATE INDEX `idx_history_changed_by` ON `translation_history` (`changedBy`);--> statement-breakpoint
CREATE INDEX `idx_history_changed_at` ON `translation_history` (`changedAt`);--> statement-breakpoint
CREATE INDEX `idx_key_path` ON `translation_keys` (`keyPath`);--> statement-breakpoint
CREATE INDEX `idx_is_deleted` ON `translation_keys` (`isDeleted`);--> statement-breakpoint
CREATE INDEX `idx_key_locale` ON `translations` (`keyId`,`localeCode`);--> statement-breakpoint
CREATE INDEX `idx_locale_code` ON `translations` (`localeCode`);
CREATE TABLE `template_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`templateId` int NOT NULL,
	`keyPath` varchar(512) NOT NULL,
	`description` text,
	`isDeleted` boolean NOT NULL DEFAULT false,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `template_keys_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `template_translations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`templateKeyId` int NOT NULL,
	`localeCode` varchar(16) NOT NULL,
	`value` text,
	`isTranslated` boolean NOT NULL DEFAULT false,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `template_translations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `templates_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `translation_keys` ADD `templateKeyId` int;--> statement-breakpoint
CREATE INDEX `idx_tkey_template` ON `template_keys` (`templateId`);--> statement-breakpoint
CREATE INDEX `idx_tkey_path` ON `template_keys` (`templateId`,`keyPath`);--> statement-breakpoint
CREATE INDEX `idx_tkey_deleted` ON `template_keys` (`isDeleted`);--> statement-breakpoint
CREATE INDEX `idx_ttr_key_locale` ON `template_translations` (`templateKeyId`,`localeCode`);--> statement-breakpoint
CREATE INDEX `idx_ttr_locale` ON `template_translations` (`localeCode`);--> statement-breakpoint
CREATE INDEX `idx_template_name` ON `templates` (`name`);--> statement-breakpoint
CREATE INDEX `idx_template_key` ON `translation_keys` (`templateKeyId`);
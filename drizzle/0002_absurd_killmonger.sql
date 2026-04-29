CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`),
	CONSTRAINT `projects_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `translation_exports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`versionId` int NOT NULL,
	`projectId` int NOT NULL,
	`localeCode` varchar(16) NOT NULL,
	`jsonContent` text NOT NULL,
	`exportedBy` int NOT NULL,
	`exportedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `translation_exports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `translation_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`versionNumber` varchar(64) NOT NULL,
	`description` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `translation_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `translation_keys` DROP INDEX `translation_keys_keyPath_unique`;--> statement-breakpoint
ALTER TABLE `translation_history` ADD `versionId` int;--> statement-breakpoint
ALTER TABLE `translation_keys` ADD `projectId` int NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_project_name` ON `projects` (`name`);--> statement-breakpoint
CREATE INDEX `idx_export_version` ON `translation_exports` (`versionId`);--> statement-breakpoint
CREATE INDEX `idx_export_project` ON `translation_exports` (`projectId`);--> statement-breakpoint
CREATE INDEX `idx_version_project` ON `translation_versions` (`projectId`);--> statement-breakpoint
CREATE INDEX `idx_version_number` ON `translation_versions` (`versionNumber`);--> statement-breakpoint
CREATE INDEX `idx_history_version` ON `translation_history` (`versionId`);--> statement-breakpoint
CREATE INDEX `idx_project_key` ON `translation_keys` (`projectId`,`keyPath`);--> statement-breakpoint
CREATE INDEX `idx_updated_by` ON `translations` (`updatedBy`);--> statement-breakpoint
CREATE INDEX `idx_updated_at` ON `translations` (`updatedAt`);
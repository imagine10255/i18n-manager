CREATE TABLE `translation_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`versionId` int NOT NULL,
	`keyId` int NOT NULL,
	`localeCode` varchar(16) NOT NULL,
	`value` text,
	`isTranslated` boolean NOT NULL DEFAULT false,
	`wasChanged` boolean NOT NULL DEFAULT false,
	`updatedBy` int,
	`updatedAt` timestamp,
	`snapshotAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `translation_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `translation_keys` ADD `sortOrder` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_snapshot_version` ON `translation_snapshots` (`versionId`);--> statement-breakpoint
CREATE INDEX `idx_snapshot_version_key_locale` ON `translation_snapshots` (`versionId`,`keyId`,`localeCode`);--> statement-breakpoint
CREATE INDEX `idx_sort_order` ON `translation_keys` (`sortOrder`);
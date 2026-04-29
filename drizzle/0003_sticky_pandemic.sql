ALTER TABLE `translations` ADD `versionId` int;--> statement-breakpoint
CREATE INDEX `idx_version_id` ON `translations` (`versionId`);
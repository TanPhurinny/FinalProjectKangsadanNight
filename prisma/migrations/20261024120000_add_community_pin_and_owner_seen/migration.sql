-- AlterTable
ALTER TABLE `CommunityPost` ADD COLUMN `isPinned` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `ownerSeenAt` DATETIME(3) NULL,
    ADD COLUMN `pinnedAt` DATETIME(3) NULL;

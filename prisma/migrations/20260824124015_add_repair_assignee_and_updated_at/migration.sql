-- AlterTable
ALTER TABLE `MaintenanceReport` ADD COLUMN `assignedToId` INTEGER NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- CreateIndex
CREATE INDEX `MaintenanceReport_assignedToId_fkey` ON `MaintenanceReport`(`assignedToId`);

-- AddForeignKey
ALTER TABLE `MaintenanceReport` ADD CONSTRAINT `MaintenanceReport_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

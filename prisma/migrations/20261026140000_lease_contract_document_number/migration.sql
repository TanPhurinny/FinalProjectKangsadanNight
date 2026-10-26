-- AlterTable
ALTER TABLE `LeaseContractRequest` DROP COLUMN `contractFileUrl`,
    ADD COLUMN `documentNumber` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `LeaseContractRequest_documentNumber_key` ON `LeaseContractRequest`(`documentNumber`);


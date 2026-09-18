-- AlterTable
ALTER TABLE `ActivityEnrollment` ADD COLUMN `tradeAccountId` INTEGER NULL,
    ADD COLUMN `tradeId` VARCHAR(64) NULL;

-- AddForeignKey
ALTER TABLE `ActivityEnrollment` ADD CONSTRAINT `ActivityEnrollment_tradeAccountId_fkey` FOREIGN KEY (`tradeAccountId`) REFERENCES `TradeAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

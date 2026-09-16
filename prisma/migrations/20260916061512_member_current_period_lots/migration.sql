-- AlterTable
ALTER TABLE `Member` ADD COLUMN `currentPeriodLots` DECIMAL(18, 8) NOT NULL DEFAULT 0,
    ADD COLUMN `currentPeriodLotsAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Member` ADD COLUMN `currentPeriodLotsFrom` DATETIME(3) NULL,
    ADD COLUMN `currentPeriodLotsTo` DATETIME(3) NULL;

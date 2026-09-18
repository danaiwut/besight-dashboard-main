-- AlterTable
ALTER TABLE `Activity` ADD COLUMN `coverImage` TEXT NULL,
    ADD COLUMN `registrationOpensAt` DATETIME(3) NULL,
    ADD COLUMN `visibleFrom` DATETIME(3) NULL;

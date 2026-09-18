-- AlterTable
ALTER TABLE `RenewalRecord` ADD COLUMN `note` TEXT NULL,
    ADD COLUMN `origin` VARCHAR(16) NOT NULL DEFAULT 'auto';

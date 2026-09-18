-- AlterTable
ALTER TABLE `Course` ADD COLUMN `minLevel` ENUM('basic', 'standard', 'premium') NOT NULL DEFAULT 'basic';

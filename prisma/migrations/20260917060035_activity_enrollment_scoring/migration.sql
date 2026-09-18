-- AlterTable
ALTER TABLE `ActivityEnrollment` ADD COLUMN `checkError` TEXT NULL,
    ADD COLUMN `isDemo` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `lots` DECIMAL(18, 8) NOT NULL DEFAULT 0,
    ADD COLUMN `lotsAt` DATETIME(3) NULL,
    ADD COLUMN `lotsFrom` DATETIME(3) NULL,
    ADD COLUMN `lotsTo` DATETIME(3) NULL,
    ADD COLUMN `verificationNote` TEXT NULL,
    ADD COLUMN `verifiedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `ActivityEnrollment_activityId_lots_idx` ON `ActivityEnrollment`(`activityId`, `lots`);

-- Existing registrations were made with a verified CRM trade account, so mark
-- them verified (only the new manual/demo path starts out pending).
UPDATE `ActivityEnrollment` SET `verifiedAt` = `createdAt` WHERE `tradeAccountId` IS NOT NULL;

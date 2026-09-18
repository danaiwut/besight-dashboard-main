-- CreateTable
CREATE TABLE `ActivityEnrollment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `activityId` INTEGER NOT NULL,
    `memberId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActivityEnrollment_memberId_createdAt_idx`(`memberId`, `createdAt`),
    INDEX `ActivityEnrollment_activityId_createdAt_idx`(`activityId`, `createdAt`),
    UNIQUE INDEX `ActivityEnrollment_activityId_memberId_key`(`activityId`, `memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ActivityEnrollment` ADD CONSTRAINT `ActivityEnrollment_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `Activity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityEnrollment` ADD CONSTRAINT `ActivityEnrollment_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

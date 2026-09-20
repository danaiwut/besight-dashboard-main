-- AlterTable
ALTER TABLE `Activity` ADD COLUMN `mode` VARCHAR(16) NOT NULL DEFAULT 'registered',
    ADD COLUMN `winnersFinalizedAt` DATETIME(3) NULL;

-- Backfill: every activity that predates this feature was demo-only.
UPDATE `Activity` SET `mode` = 'demo_legacy';

-- CreateTable
CREATE TABLE `CompetitionPrize` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `activityId` INTEGER NOT NULL,
    `rankFrom` INTEGER NOT NULL,
    `rankTo` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `valueNote` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CompetitionPrize_activityId_sortOrder_idx`(`activityId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RewardTier` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(32) NOT NULL,
    `title` VARCHAR(96) NOT NULL,
    `titleEn` VARCHAR(96) NULL,
    `threshold` DECIMAL(18, 2) NOT NULL,
    `reward` VARCHAR(191) NOT NULL,
    `rewardEn` VARCHAR(191) NULL,
    `icon` VARCHAR(48) NOT NULL DEFAULT 'redeem',
    `image` TEXT NULL,
    `accent` VARCHAR(16) NOT NULL DEFAULT '#2F6FED',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RewardTier_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RewardClaim` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `memberId` INTEGER NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `refKey` VARCHAR(96) NOT NULL,
    `activityId` INTEGER NULL,
    `title` VARCHAR(191) NOT NULL,
    `detail` TEXT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `decidedAt` DATETIME(3) NULL,

    INDEX `RewardClaim_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `RewardClaim_memberId_createdAt_idx`(`memberId`, `createdAt`),
    UNIQUE INDEX `RewardClaim_memberId_kind_refKey_key`(`memberId`, `kind`, `refKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CompetitionPrize` ADD CONSTRAINT `CompetitionPrize_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `Activity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RewardClaim` ADD CONSTRAINT `RewardClaim_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RewardClaim` ADD CONSTRAINT `RewardClaim_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `Activity`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

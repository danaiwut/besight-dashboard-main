-- AlterTable
ALTER TABLE `Member` ADD COLUMN `discordUserId` VARCHAR(96) NULL,
    ADD COLUMN `lineDisplayName` VARCHAR(191) NULL,
    ADD COLUMN `lineUserId` VARCHAR(96) NULL;

-- CreateTable
CREATE TABLE `SocialAccount` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `memberId` INTEGER NOT NULL,
    `provider` VARCHAR(16) NOT NULL,
    `providerUserId` VARCHAR(96) NOT NULL,
    `username` VARCHAR(191) NULL,
    `verifiedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SocialAccount_memberId_provider_idx`(`memberId`, `provider`),
    UNIQUE INDEX `SocialAccount_memberId_provider_key`(`memberId`, `provider`),
    UNIQUE INDEX `SocialAccount_provider_providerUserId_key`(`provider`, `providerUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SocialAccount` ADD CONSTRAINT `SocialAccount_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

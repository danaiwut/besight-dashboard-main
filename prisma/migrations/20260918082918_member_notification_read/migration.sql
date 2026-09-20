-- CreateTable
CREATE TABLE `MemberNotificationRead` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `memberId` INTEGER NOT NULL,
    `key` VARCHAR(96) NOT NULL,
    `readAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MemberNotificationRead_memberId_readAt_idx`(`memberId`, `readAt`),
    UNIQUE INDEX `MemberNotificationRead_memberId_key_key`(`memberId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MemberNotificationRead` ADD CONSTRAINT `MemberNotificationRead_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

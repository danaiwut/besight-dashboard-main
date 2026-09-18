-- CreateTable
CREATE TABLE `BecRate` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `symbol` VARCHAR(32) NOT NULL,
    `pointsPerLot` DECIMAL(12, 4) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BecRate_symbol_key`(`symbol`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SpinPrize` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `icon` VARCHAR(48) NOT NULL DEFAULT 'redeem',
    `image` TEXT NULL,
    `weight` INTEGER NOT NULL DEFAULT 1,
    `stock` INTEGER NULL,
    `valueNote` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SpinResult` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `memberId` INTEGER NOT NULL,
    `prizeId` INTEGER NOT NULL,
    `cost` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `status` ENUM('pending', 'fulfilled', 'cancelled') NOT NULL DEFAULT 'pending',
    `spunAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fulfilledAt` DATETIME(3) NULL,
    `note` TEXT NULL,

    INDEX `SpinResult_memberId_spunAt_idx`(`memberId`, `spunAt`),
    INDEX `SpinResult_status_spunAt_idx`(`status`, `spunAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SpinResult` ADD CONSTRAINT `SpinResult_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SpinResult` ADD CONSTRAINT `SpinResult_prizeId_fkey` FOREIGN KEY (`prizeId`) REFERENCES `SpinPrize`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

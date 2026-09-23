-- CreateTable
CREATE TABLE `JournalAccount` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `memberId` INTEGER NOT NULL,
    `tradeAccountId` INTEGER NULL,
    `tradeId` VARCHAR(64) NOT NULL,
    `broker` VARCHAR(120) NOT NULL,
    `accountType` VARCHAR(64) NOT NULL DEFAULT 'Standard',
    `platform` VARCHAR(32) NOT NULL DEFAULT 'MetaTrader 5',
    `startingBalance` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `startDate` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `JournalAccount_memberId_createdAt_idx`(`memberId`, `createdAt`),
    UNIQUE INDEX `JournalAccount_memberId_tradeAccountId_key`(`memberId`, `tradeAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JournalTrade` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accountId` INTEGER NOT NULL,
    `externalKey` VARCHAR(191) NULL,
    `ticket` VARCHAR(64) NULL,
    `symbol` VARCHAR(32) NOT NULL,
    `side` VARCHAR(8) NOT NULL,
    `openAt` DATETIME(3) NOT NULL,
    `closeAt` DATETIME(3) NULL,
    `openPrice` DECIMAL(18, 5) NOT NULL,
    `closePrice` DECIMAL(18, 5) NULL,
    `tp` DECIMAL(18, 5) NULL,
    `sl` DECIMAL(18, 5) NULL,
    `lots` DECIMAL(18, 2) NOT NULL,
    `pnl` DECIMAL(18, 2) NULL,
    `commission` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `swap` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `note` TEXT NULL,
    `tagsJson` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `JournalTrade_externalKey_key`(`externalKey`),
    INDEX `JournalTrade_accountId_closeAt_idx`(`accountId`, `closeAt`),
    INDEX `JournalTrade_accountId_openAt_idx`(`accountId`, `openAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RiskRule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accountId` INTEGER NOT NULL,
    `maxDailyLoss` DECIMAL(18, 2) NOT NULL DEFAULT 250,
    `maxLoss` DECIMAL(18, 2) NOT NULL DEFAULT 500,
    `profitTarget` DECIMAL(18, 2) NOT NULL DEFAULT 400,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RiskRule_accountId_key`(`accountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `JournalAccount` ADD CONSTRAINT `JournalAccount_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JournalAccount` ADD CONSTRAINT `JournalAccount_tradeAccountId_fkey` FOREIGN KEY (`tradeAccountId`) REFERENCES `TradeAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JournalTrade` ADD CONSTRAINT `JournalTrade_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `JournalAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RiskRule` ADD CONSTRAINT `RiskRule_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `JournalAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

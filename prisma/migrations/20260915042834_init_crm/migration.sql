-- CreateTable
CREATE TABLE `Member` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `externalId` VARCHAR(191) NULL,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NULL,
    `avatarUrl` TEXT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(64) NULL,
    `country` VARCHAR(96) NULL,
    `address` TEXT NULL,
    `tradingView` VARCHAR(96) NULL,
    `telegramUsername` VARCHAR(96) NULL,
    `telegramUserId` VARCHAR(96) NULL,
    `discordUsername` VARCHAR(96) NULL,
    `socialLinksJson` TEXT NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `plan` ENUM('free', 'ib_partner') NOT NULL DEFAULT 'free',
    `primaryTradeAccountId` INTEGER NULL,
    `requiredLotsOverride` DECIMAL(12, 4) NULL,
    `requiredLotsOverrideNote` TEXT NULL,
    `customerStageOverride` ENUM('new', 'existing') NULL,

    UNIQUE INDEX `Member_externalId_key`(`externalId`),
    UNIQUE INDEX `Member_code_key`(`code`),
    UNIQUE INDEX `Member_email_key`(`email`),
    UNIQUE INDEX `Member_primaryTradeAccountId_key`(`primaryTradeAccountId`),
    INDEX `Member_joinedAt_idx`(`joinedAt`),
    INDEX `Member_plan_idx`(`plan`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MemberAcquisitionChannel` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `memberId` INTEGER NOT NULL,
    `channel` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MemberAcquisitionChannel_memberId_channel_key`(`memberId`, `channel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Broker` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `logoUrl` TEXT NULL,
    `code` VARCHAR(32) NOT NULL,
    `url` TEXT NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `importMethod` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Broker_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TradeAccount` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `memberId` INTEGER NOT NULL,
    `brokerId` INTEGER NOT NULL,
    `tradeId` VARCHAR(64) NOT NULL,
    `accountType` VARCHAR(64) NULL,
    `partnerIb` VARCHAR(96) NULL,
    `verification` ENUM('verified', 'pending', 'not_found') NOT NULL DEFAULT 'pending',
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `lastSyncAt` DATETIME(3) NULL,

    INDEX `TradeAccount_memberId_status_idx`(`memberId`, `status`),
    INDEX `TradeAccount_tradeId_idx`(`tradeId`),
    UNIQUE INDEX `TradeAccount_brokerId_tradeId_key`(`brokerId`, `tradeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TradeLog` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tradeAccountId` INTEGER NOT NULL,
    `memberId` INTEGER NOT NULL,
    `externalKey` VARCHAR(191) NULL,
    `symbol` VARCHAR(64) NOT NULL,
    `lots` DECIMAL(18, 8) NOT NULL,
    `rebate` DECIMAL(18, 8) NOT NULL DEFAULT 0,
    `campaignName` VARCHAR(191) NULL,
    `country` VARCHAR(96) NULL,
    `tradeDate` DATETIME(3) NOT NULL,
    `source` VARCHAR(64) NOT NULL DEFAULT 'besight_lot_api',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TradeLog_externalKey_key`(`externalKey`),
    INDEX `TradeLog_memberId_tradeDate_idx`(`memberId`, `tradeDate`),
    INDEX `TradeLog_tradeAccountId_tradeDate_idx`(`tradeAccountId`, `tradeDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Indicator` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `publicationId` VARCHAR(191) NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `eaFileUrl` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Indicator_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlanIndicatorEntitlement` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `plan` ENUM('free', 'ib_partner') NOT NULL,
    `indicatorId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PlanIndicatorEntitlement_plan_indicatorId_key`(`plan`, `indicatorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MemberIndicatorAccess` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `memberId` INTEGER NOT NULL,
    `indicatorId` INTEGER NOT NULL,
    `status` ENUM('active', 'suspended', 'pending', 'expired') NOT NULL DEFAULT 'pending',
    `source` ENUM('Broker', 'Admin', 'SpecialAccess', 'Plan') NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `lastRenewedAt` DATETIME(3) NULL,
    `manualLock` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MemberIndicatorAccess_status_expiresAt_idx`(`status`, `expiresAt`),
    UNIQUE INDEX `MemberIndicatorAccess_memberId_indicatorId_key`(`memberId`, `indicatorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RenewalRecord` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `memberId` INTEGER NOT NULL,
    `indicatorId` INTEGER NOT NULL,
    `indicatorAccessId` INTEGER NULL,
    `period` VARCHAR(7) NOT NULL,
    `qualifiedLots` DECIMAL(18, 8) NOT NULL,
    `requiredLots` DECIMAL(18, 8) NOT NULL,
    `renewed` BOOLEAN NOT NULL,
    `oldExpiry` DATETIME(3) NULL,
    `newExpiry` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RenewalRecord_period_renewed_idx`(`period`, `renewed`),
    UNIQUE INDEX `RenewalRecord_memberId_indicatorId_period_key`(`memberId`, `indicatorId`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TelegramAccess` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `memberId` INTEGER NOT NULL,
    `username` VARCHAR(96) NULL,
    `userId` VARCHAR(96) NULL,
    `room` VARCHAR(191) NOT NULL,
    `status` ENUM('active', 'pending', 'expired', 'banned') NOT NULL DEFAULT 'pending',
    `grantedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TelegramAccess_memberId_room_key`(`memberId`, `room`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LotCheckRun` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `memberId` INTEGER NULL,
    `tradeAccountId` INTEGER NULL,
    `tradeId` VARCHAR(64) NULL,
    `dateFrom` DATETIME(3) NOT NULL,
    `dateTo` DATETIME(3) NOT NULL,
    `totalLots` DECIMAL(18, 8) NOT NULL DEFAULT 0,
    `qualified` BOOLEAN NOT NULL DEFAULT false,
    `autoProcessed` BOOLEAN NOT NULL DEFAULT false,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LotCheckRun_tradeId_dateFrom_dateTo_idx`(`tradeId`, `dateFrom`, `dateTo`),
    INDEX `LotCheckRun_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LotCheckResult` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `runId` BIGINT NOT NULL,
    `kind` ENUM('account', 'campaign', 'country', 'excluded_symbol') NOT NULL,
    `campaignName` VARCHAR(191) NULL,
    `loginId` VARCHAR(64) NULL,
    `country` VARCHAR(96) NULL,
    `instrument` VARCHAR(64) NULL,
    `lots` DECIMAL(18, 8) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LotCheckResult_kind_createdAt_idx`(`kind`, `createdAt`),
    INDEX `LotCheckResult_loginId_idx`(`loginId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivityLog` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `memberId` INTEGER NULL,
    `actor` VARCHAR(96) NOT NULL,
    `action` VARCHAR(120) NOT NULL,
    `description` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActivityLog_createdAt_idx`(`createdAt`),
    INDEX `ActivityLog_memberId_createdAt_idx`(`memberId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Admin` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `role` VARCHAR(32) NOT NULL,
    `isOwner` BOOLEAN NOT NULL DEFAULT false,
    `passwordHash` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Admin_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemSetting` (
    `key` VARCHAR(96) NOT NULL,
    `valueJson` TEXT NOT NULL,
    `description` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Member` ADD CONSTRAINT `Member_primaryTradeAccountId_fkey` FOREIGN KEY (`primaryTradeAccountId`) REFERENCES `TradeAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MemberAcquisitionChannel` ADD CONSTRAINT `MemberAcquisitionChannel_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TradeAccount` ADD CONSTRAINT `TradeAccount_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TradeAccount` ADD CONSTRAINT `TradeAccount_brokerId_fkey` FOREIGN KEY (`brokerId`) REFERENCES `Broker`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TradeLog` ADD CONSTRAINT `TradeLog_tradeAccountId_fkey` FOREIGN KEY (`tradeAccountId`) REFERENCES `TradeAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TradeLog` ADD CONSTRAINT `TradeLog_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlanIndicatorEntitlement` ADD CONSTRAINT `PlanIndicatorEntitlement_indicatorId_fkey` FOREIGN KEY (`indicatorId`) REFERENCES `Indicator`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MemberIndicatorAccess` ADD CONSTRAINT `MemberIndicatorAccess_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MemberIndicatorAccess` ADD CONSTRAINT `MemberIndicatorAccess_indicatorId_fkey` FOREIGN KEY (`indicatorId`) REFERENCES `Indicator`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RenewalRecord` ADD CONSTRAINT `RenewalRecord_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RenewalRecord` ADD CONSTRAINT `RenewalRecord_indicatorId_fkey` FOREIGN KEY (`indicatorId`) REFERENCES `Indicator`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RenewalRecord` ADD CONSTRAINT `RenewalRecord_indicatorAccessId_fkey` FOREIGN KEY (`indicatorAccessId`) REFERENCES `MemberIndicatorAccess`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TelegramAccess` ADD CONSTRAINT `TelegramAccess_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LotCheckRun` ADD CONSTRAINT `LotCheckRun_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LotCheckRun` ADD CONSTRAINT `LotCheckRun_tradeAccountId_fkey` FOREIGN KEY (`tradeAccountId`) REFERENCES `TradeAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LotCheckResult` ADD CONSTRAINT `LotCheckResult_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `LotCheckRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

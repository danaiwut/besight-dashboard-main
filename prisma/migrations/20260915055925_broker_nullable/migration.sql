-- DropForeignKey
ALTER TABLE `TradeAccount` DROP FOREIGN KEY `TradeAccount_brokerId_fkey`;

-- DropIndex
DROP INDEX `TradeAccount_brokerId_tradeId_key` ON `TradeAccount`;

-- DropIndex
DROP INDEX `TradeAccount_tradeId_idx` ON `TradeAccount`;

-- AlterTable
ALTER TABLE `TradeAccount` MODIFY `brokerId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `TradeAccount_brokerId_tradeId_idx` ON `TradeAccount`(`brokerId`, `tradeId`);

-- CreateIndex
CREATE INDEX `TradeAccount_memberId_tradeId_idx` ON `TradeAccount`(`memberId`, `tradeId`);

-- AddForeignKey
ALTER TABLE `TradeAccount` ADD CONSTRAINT `TradeAccount_brokerId_fkey` FOREIGN KEY (`brokerId`) REFERENCES `Broker`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

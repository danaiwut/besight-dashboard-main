DELETE FROM `Broker`
WHERE `code` NOT IN ('XM', 'EXNESS')
  AND NOT EXISTS (
    SELECT 1 FROM `TradeAccount` a WHERE a.`brokerId` = `Broker`.`id`
  );

INSERT INTO `Broker` (`name`, `code`, `url`, `status`, `importMethod`, `createdAt`, `updatedAt`)
SELECT 'Exness', 'EXNESS', 'https://www.exness.com/', 'active', 'API', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `Broker` WHERE `code` = 'EXNESS');

INSERT INTO `Broker` (`name`, `code`, `url`, `status`, `importMethod`, `createdAt`, `updatedAt`)
SELECT 'XM', 'XM', 'https://www.xm.com/', 'active', 'API', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `Broker` WHERE `code` = 'XM');

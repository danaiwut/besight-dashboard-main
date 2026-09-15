ALTER TABLE `ActivityLog`
  ADD COLUMN `notification` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `notificationReadAt` DATETIME(3) NULL;

CREATE INDEX `ActivityLog_notification_notificationReadAt_createdAt_idx`
  ON `ActivityLog` (`notification`, `notificationReadAt`, `createdAt`);

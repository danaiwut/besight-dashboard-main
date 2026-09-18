-- One competition account belongs to a single member per activity.
-- (MySQL allows multiple NULL tradeIds, so rows without an account are unaffected.)
CREATE UNIQUE INDEX `ActivityEnrollment_activityId_tradeId_key` ON `ActivityEnrollment`(`activityId`, `tradeId`);

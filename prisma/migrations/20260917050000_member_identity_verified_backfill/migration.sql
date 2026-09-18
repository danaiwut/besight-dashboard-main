-- Backfill: any member who already claimed a trade account passed the identity
-- check at claim time (the claim endpoint requires it), so don't ask them again.
UPDATE `Member`
SET `identityVerifiedAt` = NOW(3)
WHERE `identityVerifiedAt` IS NULL
  AND `id` IN (SELECT DISTINCT `memberId` FROM `TradeAccount` WHERE `memberConfirmed` = true);

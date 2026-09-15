UPDATE `Indicator`
SET `name` = 'BeSight One STR',
    `publicationId` = '75ee20d5bee6431c9bdef0282d58fdd3'
WHERE `name` = 'BeSight ONE';

UPDATE `Indicator`
SET `name` = 'Besight Orca',
    `publicationId` = '341c1526463b46f198b3f2ee63d9bf4a'
WHERE `name` = 'BeSight Orca';

DELETE FROM `PlanIndicatorEntitlement`
WHERE `indicatorId` IN (SELECT `id` FROM `Indicator` WHERE `name` = 'BeSight Starter');

DELETE FROM `Indicator`
WHERE `name` = 'BeSight Starter';

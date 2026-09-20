/*
  Warnings:

  - Added the required column `updatedAt` to the `LessonProgress` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `LessonProgress` ADD COLUMN `durationSec` INTEGER NULL,
    ADD COLUMN `maxPositionSec` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

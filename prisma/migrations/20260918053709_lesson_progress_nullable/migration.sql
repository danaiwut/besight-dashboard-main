-- AlterTable
ALTER TABLE `LessonProgress` MODIFY `completedAt` DATETIME(3) NULL,
    ALTER COLUMN `updatedAt` DROP DEFAULT;

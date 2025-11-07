-- AlterTable
ALTER TABLE `civic_actions` MODIFY `image_url` LONGTEXT NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `auto_sync` BOOLEAN NOT NULL DEFAULT true;

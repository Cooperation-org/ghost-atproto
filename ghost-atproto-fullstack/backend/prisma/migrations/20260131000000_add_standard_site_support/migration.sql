-- AlterTable
-- Add standard.site support fields to users table
ALTER TABLE `users` ADD COLUMN `standard_site_publication_uri` VARCHAR(191) NULL;
ALTER TABLE `users` ADD COLUMN `standard_site_publication_rkey` VARCHAR(191) NULL;
ALTER TABLE `users` ADD COLUMN `use_standard_site` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `users` ADD COLUMN `standard_site_dual_post` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `users` ADD COLUMN `publication_name` VARCHAR(191) NULL;
ALTER TABLE `users` ADD COLUMN `publication_description` TEXT NULL;

-- AlterTable
-- Add standard.site document URI to posts table
ALTER TABLE `posts` ADD COLUMN `standard_site_document_uri` VARCHAR(191) NULL;

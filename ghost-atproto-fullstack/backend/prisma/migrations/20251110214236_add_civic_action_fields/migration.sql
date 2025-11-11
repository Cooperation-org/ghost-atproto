-- AlterTable
ALTER TABLE `civic_actions` ADD COLUMN `is_virtual` BOOLEAN NULL,
    ADD COLUMN `deleted_at` DATETIME(3) NULL,
    ADD COLUMN `priority` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `recommended_by` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `civic_actions_recommended_by_fkey` ON `civic_actions`(`recommended_by`);

-- CreateIndex
CREATE INDEX `civic_actions_is_virtual_idx` ON `civic_actions`(`is_virtual`);

-- CreateIndex
CREATE INDEX `civic_actions_deleted_at_idx` ON `civic_actions`(`deleted_at`);

-- CreateIndex
CREATE INDEX `civic_actions_priority_idx` ON `civic_actions`(`priority`);

-- AddForeignKey
ALTER TABLE `civic_actions` ADD CONSTRAINT `civic_actions_recommended_by_fkey` FOREIGN KEY (`recommended_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

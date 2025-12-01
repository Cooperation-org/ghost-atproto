-- CreateTable
CREATE TABLE `comment_mappings` (
    `id` VARCHAR(191) NOT NULL,
    `bsky_reply_uri` VARCHAR(191) NOT NULL,
    `ghost_comment_id` VARCHAR(191) NOT NULL,
    `post_id` VARCHAR(191) NOT NULL,
    `bsky_author_did` VARCHAR(191) NULL,
    `bsky_author_handle` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `comment_mappings_bsky_reply_uri_key`(`bsky_reply_uri`),
    INDEX `comment_mappings_post_id_idx`(`post_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `comment_mappings` ADD CONSTRAINT `comment_mappings_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

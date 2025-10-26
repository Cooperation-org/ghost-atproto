-- Migration to fix OAuth implementation
-- Remove password requirement, add OAuth fields, create OAuth storage tables

-- Make email optional for ATProto users
ALTER TABLE users MODIFY COLUMN email VARCHAR(191);

-- Add OAuth provider fields
ALTER TABLE users ADD COLUMN google_id VARCHAR(191) UNIQUE;
ALTER TABLE users ADD COLUMN avatar LONGTEXT;
ALTER TABLE users ADD COLUMN newsletter_subscribed BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN last_login_at DATETIME(3);

-- Make bluesky_did unique
ALTER TABLE users ADD UNIQUE INDEX users_bluesky_did_key (bluesky_did);
ALTER TABLE users ADD UNIQUE INDEX users_google_id_key (google_id);

-- Add indexes for performance
CREATE INDEX users_email_idx ON users(email);
CREATE INDEX users_bluesky_did_idx ON users(bluesky_did);
CREATE INDEX users_google_id_idx ON users(google_id);

-- Remove the old oauth_sessions table if it exists
DROP TABLE IF EXISTS oauth_sessions;

-- Create OAuth state storage
CREATE TABLE oauth_states (
    `key` VARCHAR(191) NOT NULL PRIMARY KEY,
    value TEXT NOT NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt DATETIME(3) NOT NULL,
    INDEX oauth_states_updatedAt_idx (updatedAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create OAuth session storage
CREATE TABLE oauth_sessions (
    `key` VARCHAR(191) NOT NULL PRIMARY KEY,
    value LONGTEXT NOT NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt DATETIME(3) NOT NULL,
    INDEX oauth_sessions_updatedAt_idx (updatedAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- IMPORTANT: Remove bluesky_password field if you have it
-- ALTER TABLE users DROP COLUMN bluesky_password;
-- This is commented out for safety - run manually if the column exists

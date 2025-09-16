-- CreateTable
CREATE TABLE `plans` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `monthlyPriceUSD` DOUBLE NOT NULL,
    `features` JSON NOT NULL,
    `chainLimit` INTEGER NULL,
    `transactionLimit` INTEGER NULL,
    `hasAIHealing` BOOLEAN NOT NULL DEFAULT false,
    `hasAdvancedReports` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `plan_id` VARCHAR(191) NOT NULL,
    `two_factor_enabled` BOOLEAN NOT NULL DEFAULT false,
    `two_factor_secret` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallets` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `chain` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_synced_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `wallets_user_id_idx`(`user_id`),
    INDEX `wallets_chain_idx`(`chain`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transactions` (
    `id` VARCHAR(191) NOT NULL,
    `wallet_id` VARCHAR(191) NOT NULL,
    `hash` VARCHAR(191) NOT NULL,
    `chain` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `token_symbol` VARCHAR(191) NOT NULL,
    `token_address` VARCHAR(191) NULL,
    `amount` VARCHAR(191) NOT NULL,
    `price_usd` DOUBLE NULL,
    `fee_amount` VARCHAR(191) NULL,
    `fee_token_symbol` VARCHAR(191) NULL,
    `timestamp` DATETIME(3) NOT NULL,
    `block_number` INTEGER NULL,
    `is_healed` BOOLEAN NOT NULL DEFAULT false,
    `healing_confidence` DOUBLE NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `transactions_wallet_id_idx`(`wallet_id`),
    INDEX `transactions_chain_idx`(`chain`),
    INDEX `transactions_hash_idx`(`hash`),
    INDEX `transactions_timestamp_idx`(`timestamp`),
    INDEX `transactions_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_invoices` (
    `id` VARCHAR(191) NOT NULL,
    `plan_type` VARCHAR(191) NOT NULL,
    `cryptocurrency` VARCHAR(191) NOT NULL,
    `amount` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `qr_code` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `payment_invoices_status_idx`(`status`),
    INDEX `payment_invoices_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cost_basis_entries` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `transaction_id` VARCHAR(191) NOT NULL,
    `token_symbol` VARCHAR(191) NOT NULL,
    `amount` VARCHAR(191) NOT NULL,
    `cost_basis_usd` DOUBLE NOT NULL,
    `acquisition_date` DATETIME(3) NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `tax_year` INTEGER NOT NULL,
    `is_disposed` BOOLEAN NOT NULL DEFAULT false,
    `disposal_txn_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `cost_basis_entries_user_id_idx`(`user_id`),
    INDEX `cost_basis_entries_transaction_id_idx`(`transaction_id`),
    INDEX `cost_basis_entries_tax_year_idx`(`tax_year`),
    INDEX `cost_basis_entries_token_symbol_idx`(`token_symbol`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tax_reports` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `tax_year` INTEGER NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `total_gain_usd` DOUBLE NOT NULL,
    `total_loss_usd` DOUBLE NOT NULL,
    `net_gain_loss_usd` DOUBLE NOT NULL,
    `report_data` JSON NOT NULL,
    `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tax_reports_user_id_idx`(`user_id`),
    INDEX `tax_reports_tax_year_idx`(`tax_year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallets` ADD CONSTRAINT `wallets_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_wallet_id_fkey` FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

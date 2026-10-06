-- RewardProfile：标准奖励档（系统配置，seed 16 条；Task.rewardProfile NULL=业务视为 CUSTOM）
-- 由 `prisma migrate diff --from-empty` 生成的 DDL 手工整理（增量：仅新表 + tasks 加列 + FK Restrict）。

-- CreateTable
CREATE TABLE "reward_profiles" (
    "code" VARCHAR(32) NOT NULL,
    "label" VARCHAR(64) NOT NULL,
    "category" VARCHAR(16) NOT NULL,
    "xp" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "intelligence" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "logic" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "expression" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "exploration" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "connection" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "vitality" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "coins" DECIMAL(12,4) NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reward_profiles_pkey" PRIMARY KEY ("code")
);

-- AlterTable：tasks 增加 reward_profile（可空；NULL 业务上视为 CUSTOM）
ALTER TABLE "tasks" ADD COLUMN "reward_profile" VARCHAR(32);

-- AddForeignKey（删除策略 Restrict：不允许删除仍被 Task 引用的档位）
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reward_profile_fkey" FOREIGN KEY ("reward_profile") REFERENCES "reward_profiles"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

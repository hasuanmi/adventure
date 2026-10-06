-- P4：Attendance（打卡）—— 数据模型迁移自 WorkPulse（MIT）
-- 防重第一道闸 = 手写唯一索引 uniq_attendances_user_date（并发下由 DB 兜底；服务层捕获 23505 → 409）
-- 手写迁移（不依赖 prisma migrate dev 生成）：与既有 p1/reward_profiles 等迁移保持同一风格。

CREATE TABLE "attendances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "attendance_date" DATE NOT NULL,
    "check_in_at" TIMESTAMPTZ(6) NOT NULL,
    "check_out_at" TIMESTAMPTZ(6),
    "total_minutes" INTEGER,
    "status" VARCHAR(16) NOT NULL DEFAULT 'present',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_attendances_family_id" ON "attendances"("family_id");
CREATE INDEX "idx_attendances_user_id" ON "attendances"("user_id");

-- 防重第一道闸：同一用户同一天只能有一条（手写唯一索引，见 docs/opensource-mapping.md WorkPulse 行）
CREATE UNIQUE INDEX "uniq_attendances_user_date" ON "attendances"("user_id", "attendance_date");

ALTER TABLE "attendances"
    ADD CONSTRAINT "attendances_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

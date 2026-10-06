-- P1: Task / Completion / Approval / Growth
-- 说明：由 `prisma migrate diff` 生成的 DDL 手工整理；部分唯一索引（pending 守卫）为手写 SQL 追加。

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "title" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "subject" VARCHAR(32),
    "priority" SMALLINT NOT NULL DEFAULT 0,
    "start_at" TIMESTAMPTZ(6),
    "due_date" DATE,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "reviewer_id" UUID,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_completions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "note" TEXT,
    "evidence_json" JSONB,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_comment" TEXT,
    "approval_request_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "task_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "business_type" VARCHAR(32) NOT NULL,
    "business_id" UUID NOT NULL,
    "applicant_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "comment" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "actor_id" UUID NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_growth" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "xp" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "intelligence" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "logic" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "expression" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "exploration" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "connection" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "vitality" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "coins" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_growth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "task_id" UUID,
    "completion_id" UUID,
    "type" VARCHAR(16) NOT NULL DEFAULT 'base',
    "xp" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "intelligence" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "logic" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "expression" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "exploration" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "connection" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "vitality" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "coins" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" UUID NOT NULL,

    CONSTRAINT "reward_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_tasks_family_id" ON "tasks"("family_id");
CREATE INDEX "idx_tasks_child_id" ON "tasks"("child_id");
CREATE INDEX "idx_tasks_status" ON "tasks"("status");

CREATE INDEX "idx_task_completions_task_id" ON "task_completions"("task_id");
CREATE INDEX "idx_task_completions_child_id" ON "task_completions"("child_id");

CREATE INDEX "idx_approval_requests_family_id" ON "approval_requests"("family_id");
CREATE INDEX "idx_approval_requests_child_id" ON "approval_requests"("child_id");
CREATE INDEX "idx_approval_requests_reviewer_id" ON "approval_requests"("reviewer_id");
CREATE INDEX "idx_approval_requests_status" ON "approval_requests"("status");

CREATE INDEX "idx_approval_records_request_id" ON "approval_records"("request_id");

CREATE UNIQUE INDEX "user_growth_user_id_key" ON "user_growth"("user_id");

CREATE UNIQUE INDEX "reward_grants_completion_id_key" ON "reward_grants"("completion_id");
CREATE INDEX "idx_reward_grants_user_id" ON "reward_grants"("user_id");
CREATE INDEX "idx_reward_grants_task_id" ON "reward_grants"("task_id");

-- 幂等/并发守卫：同任务至多一个 pending 完成记录（v1.2 §8；StaffScheduler pending guard 的 DB 层兜底）
CREATE UNIQUE INDEX "task_completions_pending_task_unique" ON "task_completions"("task_id") WHERE status = 'pending';

-- 幂等：同业务对象至多一个 pending 审批申请（Quorum 幂等键思想 → DB 约束）
CREATE UNIQUE INDEX "approval_requests_pending_business_unique" ON "approval_requests"("business_type", "business_id") WHERE status = 'pending';

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_records" ADD CONSTRAINT "approval_records_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_growth" ADD CONSTRAINT "user_growth_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reward_grants" ADD CONSTRAINT "reward_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reward_grants" ADD CONSTRAINT "reward_grants_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reward_grants" ADD CONSTRAINT "reward_grants_completion_id_fkey" FOREIGN KEY ("completion_id") REFERENCES "task_completions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

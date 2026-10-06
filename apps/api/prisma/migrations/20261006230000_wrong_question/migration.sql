-- P6：错题本（逐字段对齐上游 wrong-notebook v1.9.1；见 docs/wrong-notebook-feature-inventory.md）
-- 硬基线适配：family_id / child_id、软删除 deleted_at、学科固定枚举、图片存 key；
-- 上游已废弃的 knowledgePoints 列不移植（单一来源 = knowledge_tags M2M）。

-- 上游 User.educationStage / enrollmentYear（知识点标签按年级取用）
ALTER TABLE "users" ADD COLUMN "education_stage" VARCHAR(24);
ALTER TABLE "users" ADD COLUMN "enrollment_year" SMALLINT;

CREATE TABLE "knowledge_tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "subject" VARCHAR(32) NOT NULL,
    "parent_id" UUID,
    "order" SMALLINT NOT NULL DEFAULT 0,
    "code" VARCHAR(32),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "child_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "knowledge_tags_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_knowledge_tags_family_id" ON "knowledge_tags"("family_id");
CREATE INDEX "idx_knowledge_tags_subject" ON "knowledge_tags"("subject");
CREATE INDEX "idx_knowledge_tags_parent_id" ON "knowledge_tags"("parent_id");

-- 上游 @@unique([subject, name, userId, parentId])：SQLite 下 NULL 不参与唯一 → 根节点/系统标签实际不受保护。
-- 迁到 PG 后拆成两条**手写部分唯一索引**修掉该漏洞（同级同名不重复）：
CREATE UNIQUE INDEX "uniq_knowledge_tags_system_sibling"
    ON "knowledge_tags" ("family_id", "subject", "name", COALESCE("parent_id", '00000000-0000-0000-0000-000000000000'::uuid))
    WHERE "child_id" IS NULL;
CREATE UNIQUE INDEX "uniq_knowledge_tags_custom_sibling"
    ON "knowledge_tags" ("family_id", "subject", "name", "child_id", COALESCE("parent_id", '00000000-0000-0000-0000-000000000000'::uuid))
    WHERE "child_id" IS NOT NULL;

ALTER TABLE "knowledge_tags"
    ADD CONSTRAINT "knowledge_tags_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "knowledge_tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "knowledge_tags"
    ADD CONSTRAINT "knowledge_tags_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "wrong_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "subject" VARCHAR(32),
    "original_image_key" VARCHAR(255),
    "ocr_text" TEXT,
    "question_text" TEXT,
    "answer_text" TEXT,
    "analysis" TEXT,
    "wrong_answer_text" TEXT,
    "mistake_analysis" TEXT,
    "mistake_status" VARCHAR(16),
    "geogebra_commands" TEXT,
    "source" VARCHAR(64),
    "error_type" VARCHAR(64),
    "user_notes" TEXT,
    "mastery_level" SMALLINT NOT NULL DEFAULT 0,
    "grade_semester" VARCHAR(48),
    "paper_level" VARCHAR(8),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "wrong_questions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_wrong_questions_family_id" ON "wrong_questions"("family_id");
CREATE INDEX "idx_wrong_questions_child_id" ON "wrong_questions"("child_id");
CREATE INDEX "idx_wrong_questions_subject" ON "wrong_questions"("subject");
CREATE INDEX "idx_wrong_questions_mastery_level" ON "wrong_questions"("mastery_level");
-- 列表/搜索主路径（按孩子 + 未删除 + 时间倒序）
CREATE INDEX "idx_wrong_questions_child_active" ON "wrong_questions"("child_id", "created_at" DESC) WHERE "deleted_at" IS NULL;

ALTER TABLE "wrong_questions"
    ADD CONSTRAINT "wrong_questions_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 上游隐式 M2M：ErrorItem.tags <-> KnowledgeTag.errorItems（Prisma 隐式连接表命名同上游约定）
CREATE TABLE "_KnowledgeTagToWrongQuestion" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);
CREATE UNIQUE INDEX "_KnowledgeTagToWrongQuestion_AB_unique" ON "_KnowledgeTagToWrongQuestion"("A", "B");
CREATE INDEX "_KnowledgeTagToWrongQuestion_B_index" ON "_KnowledgeTagToWrongQuestion"("B");
ALTER TABLE "_KnowledgeTagToWrongQuestion"
    ADD CONSTRAINT "_KnowledgeTagToWrongQuestion_A_fkey" FOREIGN KEY ("A") REFERENCES "knowledge_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_KnowledgeTagToWrongQuestion"
    ADD CONSTRAINT "_KnowledgeTagToWrongQuestion_B_fkey" FOREIGN KEY ("B") REFERENCES "wrong_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "wrong_question_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "wrong_question_id" UUID NOT NULL,
    "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "is_correct" BOOLEAN,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wrong_question_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_wrong_question_reviews_family_id" ON "wrong_question_reviews"("family_id");
CREATE INDEX "idx_wrong_question_reviews_question_id" ON "wrong_question_reviews"("wrong_question_id");

ALTER TABLE "wrong_question_reviews"
    ADD CONSTRAINT "wrong_question_reviews_wrong_question_id_fkey" FOREIGN KEY ("wrong_question_id") REFERENCES "wrong_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "practice_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "subject" VARCHAR(32),
    "difficulty" VARCHAR(16),
    "is_correct" BOOLEAN,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "practice_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_practice_records_family_id" ON "practice_records"("family_id");
CREATE INDEX "idx_practice_records_child_id" ON "practice_records"("child_id");

ALTER TABLE "practice_records"
    ADD CONSTRAINT "practice_records_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

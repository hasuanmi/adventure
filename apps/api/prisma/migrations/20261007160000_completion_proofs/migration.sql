-- Completion proofs (child attaches evidence when finishing a task).
-- Reviewer (parent) must be able to read the text and every uploaded image/file.
-- One row per proof item: text note, image, or file. No limit on the number of images.
CREATE TABLE "completion_proofs" (
  "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
  "family_id"     UUID         NOT NULL,
  "completion_id" UUID         NOT NULL,
  "kind"          VARCHAR(16)  NOT NULL,
  "text"          TEXT,
  "file_key"      VARCHAR(300),
  "file_name"     VARCHAR(200),
  "mime"          VARCHAR(100),
  "size"          INTEGER,
  "sort_order"    SMALLINT     NOT NULL DEFAULT 0,
  "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "completion_proofs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_completion_proofs_completion_id" ON "completion_proofs" ("completion_id");
CREATE INDEX "idx_completion_proofs_family_id" ON "completion_proofs" ("family_id");
ALTER TABLE "completion_proofs" ADD CONSTRAINT "completion_proofs_completion_id_fkey"
  FOREIGN KEY ("completion_id") REFERENCES "task_completions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- NOTE: no foreign key on family_id (project baseline has no families table).
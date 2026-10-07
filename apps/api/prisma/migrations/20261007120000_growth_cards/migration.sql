-- Growth cards (daily reward card). One row per user per day (unique index enforces "once per day").
-- Content is generated once and then always read back from history; page refresh must not regenerate.
CREATE TABLE "growth_cards" (
  "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
  "family_id"     UUID         NOT NULL,
  "user_id"       UUID         NOT NULL,
  "card_date"     DATE         NOT NULL,
  "theme"         VARCHAR(32)  NOT NULL,
  "title"         VARCHAR(64)  NOT NULL,
  "message"       VARCHAR(200) NOT NULL,
  "image_prompt"  TEXT,
  "image_url"     VARCHAR(300),
  "status"        VARCHAR(32)  NOT NULL DEFAULT 'pending',
  "generated_at"  TIMESTAMPTZ,
  "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "growth_cards_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "uniq_growth_cards_user_date" ON "growth_cards" ("user_id", "card_date");
CREATE INDEX "idx_growth_cards_family_id" ON "growth_cards" ("family_id");
ALTER TABLE "growth_cards" ADD CONSTRAINT "growth_cards_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "growth_cards" ADD CONSTRAINT "growth_cards_family_id_fkey"
  FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Task 新增 4 个日程/展示字段（2026-10-05 用户确认，对齐 huahuastudy 产品感）
-- color：8 预设色值；estimated_minutes：预计用时（分钟，仅展示）；end_at：结束时间（时段块）；repeat_weekdays：周重复位掩码 bit0=周一…bit6=周日，0/空=不重复
-- 全部可空，向后兼容；不改现有字段/状态机/API 语义。

ALTER TABLE "tasks" ADD COLUMN "end_at" TIMESTAMPTZ(6);
ALTER TABLE "tasks" ADD COLUMN "estimated_minutes" SMALLINT;
ALTER TABLE "tasks" ADD COLUMN "color" VARCHAR(16);
ALTER TABLE "tasks" ADD COLUMN "repeat_weekdays" SMALLINT;

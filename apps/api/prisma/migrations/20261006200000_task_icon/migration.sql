-- Task 新增 icon 列（2026-10-06 用户要求：每个任务的图标从素材库自选，不要所有任务长成同一个默认图标）
-- 纯展示层字段：仅决定卡片/详情左上角那枚像素图标，不参与业务规则；可空，NULL = 用中性默认图标。
-- 取值白名单在契约层：packages/shared-types/src/task-icon.ts（由 visualasset/build_icon_library.py 生成）。
ALTER TABLE "tasks" ADD COLUMN "icon" VARCHAR(32);

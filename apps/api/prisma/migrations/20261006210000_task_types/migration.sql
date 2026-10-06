-- 任务类型（原「奖励档位」）：按用户 2026-10-06 指定的 5 类数值重建
-- 数值来源：用户给定（XP / 智识 / 逻辑 / 表达 / 探索 / 羁绊 / 体魄 / 金币）
--   日常任务       10, 5, 4, 0, 0, 0, 0, 100
--   科学人文素养   10, 3, 3, 0, 3, 0, 0, 100
--   人际交往       10, 0, 0, 10, 0, 0, 10, 100
--   悬赏任务       10, 0, 0, 0, 0, 0, 0, 200
--   体能锻炼       10, 0, 0, 0, 0, 0, 20, 100

INSERT INTO reward_profiles (code, label, category, xp, intelligence, logic, expression, exploration, connection, vitality, coins, is_active, updated_at) VALUES
  ('TYPE_DAILY',               '日常任务',     'daily',    10, 5, 4,  0, 0, 0,  0, 100, true, CURRENT_TIMESTAMP),
  ('TYPE_SCIENCE_HUMANITIES',  '科学人文素养', 'world',    10, 3, 3,  0, 3, 0,  0, 100, true, CURRENT_TIMESTAMP),
  ('TYPE_SOCIAL',              '人际交往',     'scenery',  10, 0, 0, 10, 0, 0, 10, 100, true, CURRENT_TIMESTAMP),
  ('TYPE_BOUNTY',              '悬赏任务',     'bounty',   10, 0, 0,  0, 0, 0,  0, 200, true, CURRENT_TIMESTAMP),
  ('TYPE_PHYSICAL',            '体能锻炼',     'physical', 10, 0, 0,  0, 0, 0, 20, 100, true, CURRENT_TIMESTAMP)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  xp = EXCLUDED.xp,
  intelligence = EXCLUDED.intelligence,
  logic = EXCLUDED.logic,
  expression = EXCLUDED.expression,
  exploration = EXCLUDED.exploration,
  connection = EXCLUDED.connection,
  vitality = EXCLUDED.vitality,
  coins = EXCLUDED.coins,
  is_active = true,
  updated_at = CURRENT_TIMESTAMP;

-- 旧细分档位停用（保留数据，便于以后细档玩法复用）
UPDATE reward_profiles SET is_active = false, updated_at = CURRENT_TIMESTAMP
WHERE code NOT LIKE 'TYPE\_%';

-- 既有任务迁移到新类型（避免老任务带着"已停用档位"导致编辑报错）
UPDATE tasks SET reward_profile = CASE
  WHEN reward_profile LIKE 'DAILY\_%'   THEN 'TYPE_DAILY'
  WHEN reward_profile LIKE 'WORLD\_%'   THEN 'TYPE_SCIENCE_HUMANITIES'
  WHEN reward_profile LIKE 'SCENERY\_%' THEN 'TYPE_SOCIAL'
  WHEN reward_profile = 'CUSTOM'        THEN 'TYPE_DAILY'
  ELSE 'TYPE_DAILY'
END
WHERE reward_profile IS NOT NULL;

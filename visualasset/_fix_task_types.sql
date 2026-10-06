-- 修正：用文件方式导入（避免 PowerShell 管道破坏 UTF-8）
-- 1) 重写 5 个类型的中文标签（编码安全）
UPDATE reward_profiles SET label = '日常任务' WHERE code = 'TYPE_DAILY';
UPDATE reward_profiles SET label = '科学人文素养' WHERE code = 'TYPE_SCIENCE_HUMANITIES';
UPDATE reward_profiles SET label = '人际交往' WHERE code = 'TYPE_SOCIAL';
UPDATE reward_profiles SET label = '悬赏任务' WHERE code = 'TYPE_BOUNTY';
UPDATE reward_profiles SET label = '体能锻炼' WHERE code = 'TYPE_PHYSICAL';
-- 2) 既有任务迁移到新类型（单行 CASE，避免多行被拆坏）
UPDATE tasks SET reward_profile = CASE WHEN reward_profile LIKE 'DAILY%' THEN 'TYPE_DAILY' WHEN reward_profile LIKE 'WORLD%' THEN 'TYPE_SCIENCE_HUMANITIES' WHEN reward_profile LIKE 'SCENERY%' THEN 'TYPE_SOCIAL' ELSE 'TYPE_DAILY' END WHERE reward_profile IS NOT NULL AND reward_profile NOT LIKE 'TYPE%';
-- 3) 自检：标签长度（日常任务=4、科学人文素养=6、人际交往=4、悬赏任务=4、体能锻炼=4）
SELECT code, label, length(label) AS label_len, is_active FROM reward_profiles WHERE is_active ORDER BY code;

// 任务类型图标：每行只一个、且按 category 各不相同；触发器也只画一个
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../apps/web/src/components/task-create/task-create-sheet.tsx', import.meta.url);
let t = readFileSync(file, 'utf8');

// 1) 重新引入 categoryIconUrl（之前清理掉了）
if (!t.includes('  categoryIconUrl,')) {
  t = t.replace(/(\n\s*rewardProfileIconUrl,)/, '\n  categoryIconUrl,$1');
}

// 2) 选中类型的 category（供触发器单图标使用）
if (!t.includes('const selectedCategory')) {
  t = t.replace(
    /const profiles = profilesQuery\.data\?\.profiles \?\? \[\];/,
    `const profiles = profilesQuery.data?.profiles ?? [];
  // 图标按「类型分类」取，保证每类各不相同且只画一个
  const selectedCategory =
    profiles.find((p) => p.code === (form.watch('rewardProfile') || 'TYPE_DAILY'))?.category ?? 'daily';`,
  );
}

// 3) 触发器：单图标 = 选中类型的 category 图标
t = t.replace(
  /<img\s+src=\{rewardProfileIconUrl\(form\.watch\('rewardProfile'\) \|\| 'TYPE_DAILY'\)\}[\s\S]*?\/>/,
  '<img\n                      src={categoryIconUrl(selectedCategory)}\n                      alt=""\n                      aria-hidden\n                      className="h-5 w-5 [image-rendering:pixelated]"\n                    />',
);

// 4) 下拉项：单图标 = 该类型自己的 category 图标
t = t.replace(
  /<img\s+src=\{rewardProfileIconUrl\(p\.code\)\}[\s\S]*?\/>/,
  '<img\n                          src={categoryIconUrl(p.category)}\n                          alt=""\n                          aria-hidden\n                          className="h-4 w-4 [image-rendering:pixelated]"\n                        />',
);

writeFileSync(file, t);
console.log('已改为按 category 取图标（每行一个、互不相同）');

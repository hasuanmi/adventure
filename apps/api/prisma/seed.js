// RewardProfile seed（幂等：upsert by code，重复执行不重复插入、不报唯一冲突）
// 数值唯一来源：本文件 ← 历史产品草案 §13.3（2026-10-05 用户确认），strict 16 条 = 15 标准 + CUSTOM。
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PROFILES = [
  { code: 'DAILY_CHINESE', label: '语文作业', category: 'daily', xp: 20, intelligence: 5, logic: 0, expression: 3, exploration: 0, connection: 0, vitality: 0, coins: 100 },
  { code: 'DAILY_MATH', label: '数学作业', category: 'daily', xp: 20, intelligence: 4, logic: 5, expression: 0, exploration: 0, connection: 0, vitality: 0, coins: 100 },
  { code: 'DAILY_ENGLISH', label: '英语作业', category: 'daily', xp: 20, intelligence: 4, logic: 0, expression: 4, exploration: 0, connection: 0, vitality: 0, coins: 100 },
  { code: 'DAILY_OLYMPIAD', label: '奥数课后作业', category: 'daily', xp: 30, intelligence: 5, logic: 12, expression: 0, exploration: 0, connection: 0, vitality: 0, coins: 100 },
  { code: 'DAILY_PET', label: 'PET复习/练习', category: 'daily', xp: 25, intelligence: 5, logic: 0, expression: 5, exploration: 0, connection: 0, vitality: 0, coins: 100 },
  { code: 'WORLD_SCIENCE_READING', label: '阅读科学书籍', category: 'world', xp: 30, intelligence: 8, logic: 2, expression: 0, exploration: 5, connection: 0, vitality: 0, coins: 100 },
  { code: 'WORLD_HUMANITIES_READING', label: '阅读人文书籍', category: 'world', xp: 30, intelligence: 6, logic: 0, expression: 4, exploration: 5, connection: 0, vitality: 0, coins: 100 },
  { code: 'WORLD_SCIENCE_QUESTION', label: '探索一个科学问题', category: 'world', xp: 35, intelligence: 5, logic: 5, expression: 0, exploration: 8, connection: 0, vitality: 0, coins: 100 },
  { code: 'WORLD_SCIENCE_EXPERIMENT', label: '完成一次科学小实验', category: 'world', xp: 40, intelligence: 6, logic: 6, expression: 0, exploration: 8, connection: 0, vitality: 0, coins: 100 },
  { code: 'WORLD_HISTORY_CULTURE', label: '了解一段历史或一种文化', category: 'world', xp: 30, intelligence: 5, logic: 0, expression: 4, exploration: 5, connection: 0, vitality: 0, coins: 100 },
  { code: 'SCENERY_NEW_FRIEND', label: '主动认识一位新朋友', category: 'scenery', xp: 30, intelligence: 0, logic: 0, expression: 5, exploration: 3, connection: 8, vitality: 0, coins: 100 },
  { code: 'SCENERY_FAMILY_TALK', label: '与家人进行一次深入交流', category: 'scenery', xp: 25, intelligence: 0, logic: 0, expression: 5, exploration: 0, connection: 8, vitality: 0, coins: 100 },
  { code: 'SCENERY_GROUP_ACTIVITY', label: '参加一次集体活动', category: 'scenery', xp: 35, intelligence: 0, logic: 0, expression: 5, exploration: 3, connection: 8, vitality: 0, coins: 100 },
  { code: 'SCENERY_COLLABORATION', label: '与他人合作完成一件事', category: 'scenery', xp: 40, intelligence: 0, logic: 3, expression: 5, exploration: 0, connection: 8, vitality: 0, coins: 100 },
  { code: 'SCENERY_CARE', label: '主动表达感谢或关心', category: 'scenery', xp: 15, intelligence: 0, logic: 0, expression: 3, exploration: 0, connection: 5, vitality: 0, coins: 100 },
  { code: 'CUSTOM', label: '自定义任务', category: 'custom', xp: 10, intelligence: 2, logic: 2, expression: 2, exploration: 2, connection: 2, vitality: 2, coins: 100 },
];

async function main() {
  let upserted = 0;
  for (const p of PROFILES) {
    await prisma.rewardProfile.upsert({
      where: { code: p.code },
      update: { ...p, isActive: true }, // 已存在：更新 label/category/奖励配置并还原 isActive
      create: { ...p },
    });
    upserted++;
  }
  console.log(`reward_profiles upserted: ${upserted}/${PROFILES.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

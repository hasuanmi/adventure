// RewardProfile e2e（vitest + supertest，对真实运行中的 API 做 HTTP 测试）
// 前置：本地 API 已在 http://localhost:3100 运行（RewardProfile 构建）；数据源：docker postgres（huahua）。
// 覆盖用户要求 1-15 项；beforeAll 重跑 seed 两次验证幂等并还原状态。
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

const API = 'http://localhost:3100';

// 15 个标准档期望值（历史草案 §13.3；coins 统一 100）
const STANDARD: Record<string, { xp: number; intelligence: number; logic: number; expression: number; exploration: number; connection: number; vitality: number }> = {
  DAILY_CHINESE: { xp: 20, intelligence: 5, logic: 0, expression: 3, exploration: 0, connection: 0, vitality: 0 },
  DAILY_MATH: { xp: 20, intelligence: 4, logic: 5, expression: 0, exploration: 0, connection: 0, vitality: 0 },
  DAILY_ENGLISH: { xp: 20, intelligence: 4, logic: 0, expression: 4, exploration: 0, connection: 0, vitality: 0 },
  DAILY_OLYMPIAD: { xp: 30, intelligence: 5, logic: 12, expression: 0, exploration: 0, connection: 0, vitality: 0 },
  DAILY_PET: { xp: 25, intelligence: 5, logic: 0, expression: 5, exploration: 0, connection: 0, vitality: 0 },
  WORLD_SCIENCE_READING: { xp: 30, intelligence: 8, logic: 2, expression: 0, exploration: 5, connection: 0, vitality: 0 },
  WORLD_HUMANITIES_READING: { xp: 30, intelligence: 6, logic: 0, expression: 4, exploration: 5, connection: 0, vitality: 0 },
  WORLD_SCIENCE_QUESTION: { xp: 35, intelligence: 5, logic: 5, expression: 0, exploration: 8, connection: 0, vitality: 0 },
  WORLD_SCIENCE_EXPERIMENT: { xp: 40, intelligence: 6, logic: 6, expression: 0, exploration: 8, connection: 0, vitality: 0 },
  WORLD_HISTORY_CULTURE: { xp: 30, intelligence: 5, logic: 0, expression: 4, exploration: 5, connection: 0, vitality: 0 },
  SCENERY_NEW_FRIEND: { xp: 30, intelligence: 0, logic: 0, expression: 5, exploration: 3, connection: 8, vitality: 0 },
  SCENERY_FAMILY_TALK: { xp: 25, intelligence: 0, logic: 0, expression: 5, exploration: 0, connection: 8, vitality: 0 },
  SCENERY_GROUP_ACTIVITY: { xp: 35, intelligence: 0, logic: 0, expression: 5, exploration: 3, connection: 8, vitality: 0 },
  SCENERY_COLLABORATION: { xp: 40, intelligence: 0, logic: 3, expression: 5, exploration: 0, connection: 8, vitality: 0 },
  SCENERY_CARE: { xp: 15, intelligence: 0, logic: 0, expression: 3, exploration: 0, connection: 5, vitality: 0 },
};
const CUSTOM = { xp: 10, intelligence: 2, logic: 2, expression: 2, exploration: 2, connection: 2, vitality: 2 };

let prisma: PrismaClient;
let parentToken = '';
let childToken = '';
let childId = '';

async function login(username: string, password: string): Promise<string> {
  const res = await request(API).post('/api/auth/login').send({ username, password });
  expect(res.status).toBeGreaterThanOrEqual(200);
  expect(res.status).toBeLessThan(300);
  return res.body.accessToken as string;
}

function createTask(token: string, body: Record<string, unknown>) {
  return request(API).post('/api/tasks').set('Authorization', `Bearer ${token}`).send(body);
}

/** 取指定任务当前 pending 完成记录对应的审批申请（避免其他遗留 pending 污染） */
async function pendingApprovalForTask(taskId: string) {
  const completion = await prisma.taskCompletion.findFirstOrThrow({
    where: { taskId, status: 'pending' },
  });
  return prisma.approvalRequest.findUniqueOrThrow({ where: { id: completion.approvalRequestId! } });
}

describe('RewardProfile e2e', () => {
  beforeAll(async () => {
    // 前置：API 健康检查
    const health = await request(API).get('/api/health');
    if (health.status !== 200 || health.body.db !== 'up') {
      throw new Error('API not reachable at http://localhost:3100 (RewardProfile build) — start it first');
    }
    // seed 两次：验证幂等（第二次不报错、不重复）
    execFileSync('node', ['prisma/seed.js'], { cwd: process.cwd() });
    execFileSync('node', ['prisma/seed.js'], { cwd: process.cwd() });

    prisma = new PrismaClient();
    await prisma.rewardProfile.count(); // 连接校验

    // 用户 + 家庭（幂等：先清理本次测试用户）
    await prisma.user.deleteMany({ where: { username: { in: ['rp_parent', 'rp_child'] } } });
    await request(API).post('/api/auth/register').send({ username: 'rp_parent', password: 'secret123', role: 'parent' });
    await request(API).post('/api/auth/register').send({ username: 'rp_child', password: 'secret123', role: 'child' });
    const parent = await prisma.user.findUniqueOrThrow({ where: { username: 'rp_parent' } });
    const child = await prisma.user.findUniqueOrThrow({ where: { username: 'rp_child' } });
    childId = child.id;
    await prisma.user.updateMany({ where: { username: { in: ['rp_parent', 'rp_child'] } }, data: { familyId: parent.id } });
    parentToken = await login('rp_parent', 'secret123');
    childToken = await login('rp_child', 'secret123');
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('1. seed 16 条成功且幂等', async () => {
    expect(await prisma.rewardProfile.count()).toBe(16);
  });

  it('2. code 唯一', async () => {
    const rows = await prisma.rewardProfile.findMany({ select: { code: true } });
    expect(new Set(rows.map((r) => r.code)).size).toBe(rows.length);
  });

  it('3. CUSTOM 配置正确', async () => {
    const c = await prisma.rewardProfile.findUniqueOrThrow({ where: { code: 'CUSTOM' } });
    expect({ xp: Number(c.xp), intelligence: Number(c.intelligence), logic: Number(c.logic), expression: Number(c.expression), exploration: Number(c.exploration), connection: Number(c.connection), vitality: Number(c.vitality), coins: Number(c.coins) }).toEqual({ ...CUSTOM, coins: 100 });
  });

  it('4. 15 个标准档配置正确', async () => {
    for (const [code, expectVal] of Object.entries(STANDARD)) {
      const r = await prisma.rewardProfile.findUniqueOrThrow({ where: { code } });
      const got = { xp: Number(r.xp), intelligence: Number(r.intelligence), logic: Number(r.logic), expression: Number(r.expression), exploration: Number(r.exploration), connection: Number(r.connection), vitality: Number(r.vitality) };
      expect(got).toEqual(expectVal);
      expect(Number(r.coins)).toBe(100);
    }
  });

  it('5. GET /api/reward-profiles 只返回 active', async () => {
    await prisma.rewardProfile.update({ where: { code: 'SCENERY_CARE' }, data: { isActive: false } });
    const res = await request(API).get('/api/reward-profiles').set('Authorization', `Bearer ${childToken}`);
    expect(res.status).toBe(200);
    const codes = res.body.profiles.map((p: { code: string }) => p.code);
    expect(codes).not.toContain('SCENERY_CARE');
    expect(codes).toContain('DAILY_CHINESE');
    await prisma.rewardProfile.update({ where: { code: 'SCENERY_CARE' }, data: { isActive: true } });
  });

  it('6. category 筛选正确', async () => {
    const res = await request(API).get('/api/reward-profiles?category=daily').set('Authorization', `Bearer ${childToken}`);
    expect(res.status).toBe(200);
    expect(res.body.profiles.length).toBe(5);
    expect(res.body.profiles.every((p: { category: string }) => p.category === 'daily')).toBe(true);
    expect(res.body.profiles[0]).not.toHaveProperty('xp');
  });

  it('7. Task 可以保存 rewardProfile', async () => {
    const res = await createTask(parentToken, { childId, title: 't7', rewardProfile: 'DAILY_CHINESE' });
    expect(res.status).toBe(201);
    expect(res.body.rewardProfile).toBe('DAILY_CHINESE');
  });

  it('8. Task.rewardProfile=NULL 可以正常创建', async () => {
    const res = await createTask(parentToken, { childId, title: 't8' });
    expect(res.status).toBe(201);
    expect(res.body.rewardProfile).toBeNull();
  });

  it('9. 不存在的 rewardProfile → 400', async () => {
    const res = await createTask(parentToken, { childId, title: 't9', rewardProfile: 'BOGUS_CODE' });
    expect(res.status).toBe(400);
  });

  it('10. inactive rewardProfile → 400', async () => {
    await prisma.rewardProfile.update({ where: { code: 'SCENERY_CARE' }, data: { isActive: false } });
    const res = await createTask(parentToken, { childId, title: 't10', rewardProfile: 'SCENERY_CARE' });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('reward_profile_inactive');
    await prisma.rewardProfile.update({ where: { code: 'SCENERY_CARE' }, data: { isActive: true } });
  });

  it('11. 完成任务按对应 RewardProfile 发放（DAILY_CHINESE）', async () => {
    const t = await createTask(parentToken, { childId, title: 't11', rewardProfile: 'DAILY_CHINESE' });
    await request(API).post(`/api/tasks/${t.body.id}/complete`).set('Authorization', `Bearer ${childToken}`).send({});
    const grant = await prisma.rewardGrant.findFirstOrThrow({ where: { taskId: t.body.id } });
    expect({ xp: Number(grant.xp), intelligence: Number(grant.intelligence), expression: Number(grant.expression), coins: Number(grant.coins) }).toEqual({ xp: 20, intelligence: 5, expression: 3, coins: 100 });
  });

  it('12. Task.rewardProfile=NULL 使用 CUSTOM', async () => {
    const t = await createTask(parentToken, { childId, title: 't12' });
    await request(API).post(`/api/tasks/${t.body.id}/complete`).set('Authorization', `Bearer ${childToken}`).send({});
    const grant = await prisma.rewardGrant.findFirstOrThrow({ where: { taskId: t.body.id } });
    expect({ xp: Number(grant.xp), intelligence: Number(grant.intelligence), coins: Number(grant.coins) }).toEqual({ xp: 10, intelligence: 2, coins: 100 });
  });

  it('13. RewardGrant 实际数值正确（审批通过路径）', async () => {
    const parent = await prisma.user.findUniqueOrThrow({ where: { username: 'rp_parent' } });
    const t = await createTask(parentToken, { childId, title: 't13', requiresApproval: true, reviewerId: parent.id, rewardProfile: 'SCENERY_COLLABORATION' });
    await request(API).post(`/api/tasks/${t.body.id}/complete`).set('Authorization', `Bearer ${childToken}`).send({});
    const pending = await pendingApprovalForTask(t.body.id);
    await request(API).post(`/api/approvals/${pending.id}/approve`).set('Authorization', `Bearer ${parentToken}`).send({});
    const grant = await prisma.rewardGrant.findFirstOrThrow({ where: { taskId: t.body.id } });
    expect({ xp: Number(grant.xp), logic: Number(grant.logic), expression: Number(grant.expression), connection: Number(grant.connection), coins: Number(grant.coins) }).toEqual({ xp: 40, logic: 3, expression: 5, connection: 8, coins: 100 });
  });

  it('14. 幂等性保持（重复完成/重复审批不重复发放）', async () => {
    const t = await createTask(parentToken, { childId, title: 't14a' });
    await request(API).post(`/api/tasks/${t.body.id}/complete`).set('Authorization', `Bearer ${childToken}`).send({});
    const again = await request(API).post(`/api/tasks/${t.body.id}/complete`).set('Authorization', `Bearer ${childToken}`).send({});
    expect(again.status).toBe(409);
    expect(await prisma.rewardGrant.count({ where: { taskId: t.body.id } })).toBe(1);
    const parent = await prisma.user.findUniqueOrThrow({ where: { username: 'rp_parent' } });
    const t2 = await createTask(parentToken, { childId, title: 't14b', requiresApproval: true, reviewerId: parent.id });
    await request(API).post(`/api/tasks/${t2.body.id}/complete`).set('Authorization', `Bearer ${childToken}`).send({});
    const pending = await pendingApprovalForTask(t2.body.id);
    await request(API).post(`/api/approvals/${pending.id}/approve`).set('Authorization', `Bearer ${parentToken}`).send({});
    const approveAgain = await request(API).post(`/api/approvals/${pending.id}/approve`).set('Authorization', `Bearer ${parentToken}`).send({});
    expect(approveAgain.status).toBe(409);
    expect(await prisma.rewardGrant.count({ where: { taskId: t2.body.id } })).toBe(1);
  });

  it('15. P1 回归：reject→returned→resume→重提→approve 仍正常', async () => {
    const parent = await prisma.user.findUniqueOrThrow({ where: { username: 'rp_parent' } });
    const t = await createTask(parentToken, { childId, title: 't15', requiresApproval: true, reviewerId: parent.id });
    await request(API).post(`/api/tasks/${t.body.id}/complete`).set('Authorization', `Bearer ${childToken}`).send({});
    const p1 = await pendingApprovalForTask(t.body.id);
    await request(API).post(`/api/approvals/${p1.id}/reject`).set('Authorization', `Bearer ${parentToken}`).send({ comment: 'redo' });
    let task = await prisma.task.findUniqueOrThrow({ where: { id: t.body.id } });
    expect(task.status).toBe('returned');
    await request(API).post(`/api/tasks/${t.body.id}/status`).set('Authorization', `Bearer ${childToken}`).send({ action: 'resume' });
    task = await prisma.task.findUniqueOrThrow({ where: { id: t.body.id } });
    expect(task.status).toBe('in_progress');
    await request(API).post(`/api/tasks/${t.body.id}/complete`).set('Authorization', `Bearer ${childToken}`).send({});
    const p2 = await pendingApprovalForTask(t.body.id);
    await request(API).post(`/api/approvals/${p2.id}/approve`).set('Authorization', `Bearer ${parentToken}`).send({});
    task = await prisma.task.findUniqueOrThrow({ where: { id: t.body.id } });
    expect(task.status).toBe('completed');
    const growth = await prisma.userGrowth.findUniqueOrThrow({ where: { userId: childId } });
    expect(Number(growth.xp)).toBeGreaterThan(0);
  });
});

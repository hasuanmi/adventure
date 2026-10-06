// P1 收尾：reject comment 必填（v1.2 产品规则）；approve comment 可选。
// 覆盖：reject+comment 成功 / reject+空 400 / reject+缺失 400 / approve+无 comment 成功。
// 前置：本地 API 已在 http://localhost:3100 运行（含本次修复构建）；数据源 docker postgres。
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

const API = 'http://localhost:3100';
let prisma: PrismaClient;
let parentToken = '';
let childToken = '';
let childId = '';
let parentId = '';

async function login(username: string, password: string): Promise<string> {
  const res = await request(API).post('/api/auth/login').send({ username, password });
  expect(res.status).toBeGreaterThanOrEqual(200);
  expect(res.status).toBeLessThan(300);
  return res.body.accessToken as string;
}

async function createApprovalTask(): Promise<string> {
  const res = await request(API)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${parentToken}`)
    .send({ childId, title: 'approval-comment-t', requiresApproval: true, reviewerId: parentId });
  expect(res.status).toBe(201);
  const taskId = res.body.id as string;
  await request(API).post(`/api/tasks/${taskId}/complete`).set('Authorization', `Bearer ${childToken}`).send({});
  const completion = await prisma.taskCompletion.findFirstOrThrow({ where: { taskId, status: 'pending' } });
  return completion.approvalRequestId!;
}

describe('Approval comment required on reject', () => {
  beforeAll(async () => {
    prisma = new PrismaClient();
    const health = await request(API).get('/api/health');
    if (health.status !== 200 || health.body.db !== 'up') {
      throw new Error('API not reachable at http://localhost:3100 — start it first');
    }
    await prisma.user.deleteMany({ where: { username: { in: ['rp2_parent', 'rp2_child'] } } });
    await request(API).post('/api/auth/register').send({ username: 'rp2_parent', password: 'secret123', role: 'parent' });
    await request(API).post('/api/auth/register').send({ username: 'rp2_child', password: 'secret123', role: 'child' });
    const parent = await prisma.user.findUniqueOrThrow({ where: { username: 'rp2_parent' } });
    const child = await prisma.user.findUniqueOrThrow({ where: { username: 'rp2_child' } });
    parentId = parent.id;
    childId = child.id;
    await prisma.user.updateMany({ where: { username: { in: ['rp2_parent', 'rp2_child'] } }, data: { familyId: parent.id } });
    parentToken = await login('rp2_parent', 'secret123');
    childToken = await login('rp2_child', 'secret123');
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('1. reject + comment → 成功', async () => {
    const id = await createApprovalTask();
    const res = await request(API).post(`/api/approvals/${id}/reject`).set('Authorization', `Bearer ${parentToken}`).send({ comment: 'redo please' });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(res.body.status).toBe('rejected');
    expect(res.body.comment).toBe('redo please');
  });

  it('2. reject + 空 comment("") → 400', async () => {
    const id = await createApprovalTask();
    const res = await request(API).post(`/api/approvals/${id}/reject`).set('Authorization', `Bearer ${parentToken}`).send({ comment: '' });
    expect(res.status).toBe(400);
  });

  it('3. reject + 缺少 comment → 400', async () => {
    const id = await createApprovalTask();
    const res = await request(API).post(`/api/approvals/${id}/reject`).set('Authorization', `Bearer ${parentToken}`).send({});
    expect(res.status).toBe(400);
  });

  it('4. approve + 无 comment → 成功', async () => {
    const id = await createApprovalTask();
    const res = await request(API).post(`/api/approvals/${id}/approve`).set('Authorization', `Bearer ${parentToken}`).send({});
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(res.body.status).toBe('approved');
  });

  it('5. 原有审批 e2e 场景仍通过（reject 带意见→returned→resume→重提→approve）', async () => {
    const id = await createApprovalTask();
    await request(API).post(`/api/approvals/${id}/reject`).set('Authorization', `Bearer ${parentToken}`).send({ comment: 'redo' });
    const completion = await prisma.taskCompletion.findFirstOrThrow({ where: { approvalRequestId: id } });
    let task = await prisma.task.findUniqueOrThrow({ where: { id: completion.taskId } });
    expect(task.status).toBe('returned');
    await request(API).post(`/api/tasks/${task.id}/status`).set('Authorization', `Bearer ${childToken}`).send({ action: 'resume' });
    await request(API).post(`/api/tasks/${task.id}/complete`).set('Authorization', `Bearer ${childToken}`).send({});
    // 按本任务定位新 pending 审批（避免其他遗留 pending 污染）
    const completion2 = await prisma.taskCompletion.findFirstOrThrow({ where: { taskId: task.id, status: 'pending' } });
    await request(API).post(`/api/approvals/${completion2.approvalRequestId}/approve`).set('Authorization', `Bearer ${parentToken}`).send({});
    task = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(task.status).toBe('completed');
  });
});

# 第三方声明（THIRD PARTY NOTICES）

> 更新于 2026-10-05（P1 开工前）。依据 P1 开发原则：**动手复用前先核验 LICENSE**；MIT 允许直接复用/适配，必须保留版权与许可证声明；无 LICENSE 项目（wrong-notebook）仅 clean-room 参考。
> 本文件与 `docs/opensource-mapping.md`（资产映射 + 未采用记录）配套使用。

## 一、参考项目许可证一览（已核验 LICENSE 文件）

| 项目 | 许可证 | 版权声明（源 LICENSE 文件） | P1 相关 |
|---|---|---|---|
| Quorum（lawale/quorum） | MIT | Copyright (c) 2025 Olawale Lawal | ✅ 审批状态机/并发 |
| StaffScheduler（lucaosti/StaffScheduler） | MIT | Copyright (c) 2025 Luca Ostinelli | ✅ 审批决策/同事务副作用 |
| TaskLabs | MIT | Copyright (c) 2026 Spookie Organization | ❌（P5 Event 领域） |
| WorkPulse | MIT | Copyright (c) 2026 Digant Vyahalkar | ❌（P4 打卡） |
| Kaneo | MIT | Copyright (c) 2024 Andrej Acevski | ❌（P5 日历布局） |
| wrong-notebook（wttwins） | **无 LICENSE 文件** | — | ❌ clean-room 红线 |

## 二、P1 直接复用来源（Task / Completion / Approval / Growth）—— 实际落点（2026-10-05 完成）

| 源文件 | 复用内容 | 本项目落点 | 状态 |
|---|---|---|---|
| StaffScheduler `ApprovalStateMachine.ts` | 状态转移表 TRANSITIONS、nextState（非法 409）、isTerminal/canTransition | `apps/api/src/approval/approval.state-machine.ts`（表常量在 shared-types `approval.ts`） | ✅ 已落地，文件头保留来源声明 |
| StaffScheduler `ApprovalDecisionService.ts` | decidePendingApproval：只推审批步 + isFinalStep + `WHERE status='pending'` 守卫 | `apps/api/src/approval/approval.service.ts` | ✅ 已落地 |
| StaffScheduler `TimeOffService.ts` / `ShiftSwapService.ts` | 先副作用、后决策写入、FOR UPDATE、双 pending 守卫 | `apps/api/src/completion/completion.service.ts`（Prisma $transaction） | ✅ 已落地 |
| Quorum `request_service.go` | evaluateWithCounts（单阶段化）、自审禁止、CanViewerAct、幂等键/指纹 | `apps/api/src/approval/approval.evaluate.ts` + `approval.service.ts`（部分唯一索引为 DB 层幂等） | ✅ 已落地 |
| —（无开源） | task/growth 状态机与成长数值（v1.2 产品规则） | `apps/api/src/task|growth` + shared-types | ✅ 自研 |

## 三、声明方式（复用落地时强制）

1. 被复用的每个源文件/算法，在其适配后的本项目文件头部加注释块：
   ```
   // 来源：<repo>（<path>），MIT License
   // Copyright (c) <year> <author>
   // 本项目内适配说明：<简述>
   ```
2. 本文件（THIRD_PARTY_NOTICES）随 P1 完成同步更新"实际落点"。
3. 禁止整项目搬运；只复用上表列出的、经判断有价值的部分。

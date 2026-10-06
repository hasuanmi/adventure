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

## 三、UI 原型阶段（2026-10-06）：8bitcn 技法移植 + 中文像素字体

> 背景：UI 技术选型结论为**方案 C**（只采用 8bitcn 技法，不全量引入）。相关评估见本轮记录。
> 原则不变：**只借"技法"，不复制它的组件源码**；唯一直接入库的第三方二进制是字体。

| 来源 | 许可证 | 版权声明（源 LICENSE 文件） | 本项目落点 | 状态 |
|---|---|---|---|---|
| **8bitcn（TheOrcDev/8bitcn-ui）** | MIT | Copyright (c) 2025 8bitcn | **未复制其源码**。仅按其公开技法在 `apps/web/src/components/ui-preview/` 自行重写为 Tailwind **v3** 版本（缺角框 / 12 块描边 / N 格分段进度）。各文件头已注明技法来源 | ✅ 已落地（技法，非代码） |
| **Fusion Pixel 缝合像素字体**（TakWolf/fusion-pixel-font，经 npm `@fontsource/fusion-pixel-12px-proportional-sc@5.3.0` 分发） | **SIL OFL-1.1**（**保留字体名 'Fusion Pixel'，不得改名**） | `Copyright (c) 2022, TakWolf (https://takwolf.com), with Reserved Font Name 'Fusion Pixel'.` | 字体文件 `apps/web/public/fonts/fusion-pixel-12px-proportional-sc.woff2`；完整许可证原文随字体存放于同目录 `LICENSE-fusion-pixel.txt`；`@font-face` 见 `apps/web/src/styles/pixel-font.css` | ✅ 已落地 |

> 注意（字体）：OFL-1.1 允许商用与嵌入，但 **① 不得改名出售；② 分发时必须随附许可证原文**（已随字体存放）；
> ③ 本项目**未使用** Zpix 最像素字体 —— 它**非开源**（商业单产品 USD $1000，禁止修改/再分发），不要引入。

## 四、声明方式（复用落地时强制）

1. 被复用的每个源文件/算法，在其适配后的本项目文件头部加注释块：
   ```
   // 来源：<repo>（<path>），MIT License
   // Copyright (c) <year> <author>
   // 本项目内适配说明：<简述>
   ```
2. 本文件（THIRD_PARTY_NOTICES）随 P1 完成同步更新"实际落点"。
3. 禁止整项目搬运；只复用上表列出的、经判断有价值的部分。

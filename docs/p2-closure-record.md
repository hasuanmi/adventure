# P2 收口实现记录（家庭入口 + 审批闭环 + 会话保活 + 今日范围）

> 版本：v1.0 · 2026-10-05 · 用户确认范围＝「P2 收口 + P1 硬缺口」
> 配套决策：奖励档**统一走默认档、不做精确映射**（见 `docs/opensource-mapping.md` §二点十）
> 前置基线：`docs/p2-ui-ux-review.md`、`docs/schedule-two-day-design.md`、`docs/task-create-and-schedule-review.md`（均已落地部分）

---

## 1. 本轮解决的问题（为什么要做）

P1 后端与 P2 页面各自"已完成"，但**产品闭环走不通**：

| # | 问题（接手时实测/核验） | 影响 |
|---|---|---|
| 1 | 无家庭入口：`register` 不写 `familyId`，`POST /tasks` 直接 400 `family_required` | 新用户无法建任务；验收只能 `UPDATE users SET family_id=...` 绕过 SQL |
| 2 | Web 无任何审批操作入口（全仓 web 代码搜不到 approve/reject） | 家长无法通过/驳回 → P2 阶段"Web 跑通完整闭环"不成立 |
| 3 | `GET /approvals`（默认家庭范围）在 `familyId=null` 时过滤条件被丢弃 | **多租户泄露**：无家庭用户可看到全库审批 |
| 4 | `POST /approvals` 可自填 `applicantId/reviewerId`；`familyId ?? ''` 空串入 UUID 列 | 越权创建 / 非干净 500 |
| 5 | `PATCH /tasks/:id` 不复校验审核人；只改一端时 `invalid_range` 被跳过 | 产生永不通过的 pending；区间校验可绕过 |
| 6 | Web access token 仅内存、无 bootstrap、无 401 续期 | 刷新页面即登出（Refresh Cookie 白设） |
| 7 | Today 页进度按**全量历史**任务计算；无状态筛选 | "今日 x/y"失真 |
| 8 | LoginPage 仍是 P0 脚手架（内联样式、文案写着"P0 脚手架"） | 产品第一屏未完成 |

---

## 2. 硬基线约束（本轮遵守，未突破）

- **不建 Family 表**：《新项目V1》§3.5 明确"仅 family_id 单列，无 Family 模块/邀请码/成员表"。
  故本轮家庭入口为**最小实现**：`familyId = 创建家庭的家长 user id`，**邀请码 = 该家长 username**。
  该口径与 `docs/P1-人工验收指南.md` §0.4 既有 SQL 口径完全一致 → **历史数据零迁移、零改动**。
- **无数据库迁移**：本轮**没有**新增表/列（`schema.prisma` 未改）。
- **API 只增不改**：仅新增 `/api/family/*`；既有端点签名与响应结构未变（仅审批 DTO 增加**可选**字段 `descriptor`）。
- **审批模块保持业务无关**：不引入 approval → task 的反向依赖。
- **不引入新的第三方依赖**（沿用既有 Radix/TanStack Query/RHF/zod）。

---

## 3. 后端改动

### 3.1 新增：家庭入口（`apps/api/src/family/`）

| 端点 | 行为 | 关键规则 |
|---|---|---|
| `POST /api/family/create` | 家长创建家庭（`familyId = 自己`） | 仅 `parent`（否则 400 `parent_required`）；已在家庭 → 409 `already_in_family` |
| `POST /api/family/join` | 凭邀请码加入 | `code` = 家长 username（trim + 忽略大小写）；不存在→400 `invalid_code`；非家长→400 `code_not_parent`；该家长未建家庭→400 `code_owner_no_family`；自己→400 `cannot_join_self`；已有家庭→409 |
| `GET /api/family/me` | 我的家庭 + 成员列表 | 未入家庭返回 `familyId: null` + 空成员（**不报错**，供前端引导）；成员仅同 `familyId` |

- 共享契约：`packages/shared-types/src/family.ts`（`FamilyDto` / `FamilyMemberDto` / `JoinFamilyRequest` / `FAMILY_REASON`）。
- `familyId` 在**每次请求**由 `JwtAuthGuard` 从 DB 读取（`jwt-auth.guard.ts`），故加入家庭后**无需重新登录**即生效。

### 3.2 修复：多租户与越权（`approval.service.ts` / `approval.controller.ts`）

- `list()` 默认家庭范围：`familyId` 为 null → **返回空数组**（不再退化为"全库"）。
- `createRequest()`（HTTP 通道）新增：必须有家庭（400 `family_required`）、`applicantId` 必须等于请求者（403）、`reviewerId` 必须存在且**同家庭**（400 `reviewer_not_found`）、禁止自审。

### 3.3 修复：Task 更新校验（`task.service.ts`）

- `PATCH` 复校验审核人：存在且同家庭、且非任务归属孩子（与 `create` 一致）。
- 区间校验改用**生效值**：只传 `endAt`（或只传 `startAt`）时也与另一端现值比较 → `invalid_range` 不再被绕过。
- 新增：任务存在 **pending 完成记录**时，禁止把 `requiresApproval` 从 true 改为 false（409 `pending_completion_exists`）。
  > 原因：否则孩子可再提交一次走"自动批准"路径，产生第二条 completion + 第二条发放（发放按 `completionId` 幂等，拦不住），原 pending 永久悬挂。

### 3.4 新增：审批列表可读性（通用描述解析器）

- `ApprovalService` 在既有"副作用处理器注册表"（StaffScheduler 模式）旁**扩展**只读注册表 `registerDescriptor(businessType, resolver)`；
  `completion` 模块注册 `task_completion` 解析器（`completionId → { label: 任务标题, taskId }`）。
- `ApprovalRequestDto.descriptor?: { label, taskId? }`（**可选字段，向后兼容**）。
- 这样审批页能显示"哪条任务的完成确认"并可跳转，同时 approval 模块仍不感知 task。

---

## 4. 前端改动（`apps/web/src`）

| 文件 | 改动 |
|---|---|
| `store/auth.ts`（重写） | 会话 store：`booting/authed/anon` + `token + user`，`subscribe/getSession`（配 `useSyncExternalStore`） |
| `lib/api/client.ts`（重写） | 401 → **单飞续期**（`/auth/refresh`）后重放原请求一次；续期失败清会话交由路由跳登录 |
| `hooks/use-session.ts`、`hooks/use-session-bootstrap.ts`（新增） | 订阅会话态；启动时用 Refresh Cookie 换 token + 拉 `/auth/me`（失败 → 匿名） |
| `hooks/use-user.ts`（重写） | 由会话 store 提供 `{userId, username, role, familyId}`（不再自行解 JWT） |
| `App.tsx` | 启动引导 + `RequireAuth` 区分"恢复中/未登录"（避免闪烁回登录页）；新增 `/approvals`、`/family` 路由 |
| `lib/api/family.ts`、`lib/api/approvals.ts`（新增） | 家庭与审批 API 客户端（`as=reviewer\|applicant`、approve/reject/cancel） |
| `pages/FamilyPage.tsx`（新增） | 未入家庭：家长「创建家庭」/ 所有人「用家长用户名加入」；已入家庭：邀请码（可复制）+ 成员列表；成功后刷新 `/auth/me` 同步会话 |
| `pages/ApprovalsPage.tsx`（新增） | 双 Tab（待我确认 / 我的申请）；`canAct` 时显示 同意/驳回；**驳回必填意见**（前端也拦一次）；显示任务标题并跳任务详情 |
| `pages/TodayPage.tsx` | 未加入家庭提示卡（→`/family`）；待审批卡改为**可点击进入审批页**；新增状态筛选 Tab（全部/待开始/进行中/已完成/已退回）；进度与列表改用"今日范围" |
| `lib/today.ts`（新增） | 今日范围纯函数：未安排（无 startAt/dueDate）与**逾期未完成**归入今日，其余按 startAt（含周重复命中）/dueDate 判断；与 `lib/schedule.ts` 同源 |
| `pages/LoginPage.tsx`（重写） | 像素主题（Panel/Button/Input/Label）；去掉"P0 脚手架"文案；已登录自动重定向；注册身份仅 孩子/家长（**教师端 UI 暂不开放**，后端角色不变）；注册后由首页引导建/加家庭 |
| `pages/TaskDetailPage.tsx` | 新增：**完成确认操作区**（`canAct` 时通过/驳回，驳回必填意见）；显示结束时间/预计用时/重复/颜色/归属孩子/确认人（姓名而非 uuid）；**补「编辑」入口**；提交中状态提示 |
| `components/task-create/task-create-sheet.tsx` | 完成确认分组：审核人/孩子由**手填 uuid 改为家庭成员下拉**（唯一候选自动预选）；无家庭时给出去家庭设置的提示；提交前校验"需确认必选确认人/家长必选孩子" |
| `components/layout/app-layout.tsx` | 登出改为**先调 `/auth/logout`（撤销 Refresh）再清会话**；HUD 增加「我的家庭」入口；底栏仍为 2 格（遵守 `p2-ui-ux-review.md` §3，未新增 Tab） |

---

## 5. 验证（本轮实测）

| 验证项 | 命令/方式 | 结果 |
|---|---|---|
| 三包类型检查 | 直接调 `tsc -p ... --noEmit`（shared-types / api / web） | ✅ 全部 exit 0 |
| Web 生产构建 | `node node_modules/vite/bin/vite.js build` | ✅ 2204 模块转换、`dist` 产出（仅 zod 注释与 chunk 体积告警，既有） |
| 端到端闭环 + 越权负例 | `scripts/p2-smoke.ps1`（新增，可重复执行） | ✅ **38/38 PASS**：注册/登录 → 建家庭 → 加成员 → 建需确认任务 → 开始 → 提交 → 家长看到待确认（`canAct=true`、`descriptor.label`=任务标题）→ 非确认人 403 → 驳回缺意见 400 → 通过 → `completed` → `reward_grants=1` → `xp>0`；另含无家庭 400、无家庭审批列表为空、PATCH 自审/外家庭/区间 400、**待审批时禁止取消人工确认 409 且未产生第二条 completion** |
| 数据清理 | 冒烟脚本末尾按用户名级联清理 | ✅ 测试用户与关联数据全部删除（`cleanup removed smoke users = 0`） |
| 数据库 | 未新增迁移 | ✅ `schema.prisma` 与迁移目录无改动 |

> 冒烟脚本运行前置：API 在 `$BASE`（默认 `http://localhost:3000/api`）运行 + 本机 psql 可连 `huahua` 库。
> 脚本刻意只写 ASCII（Windows PowerShell 5.1 以 GBK 读取 UTF-8 文件，中文注释会破坏语法），并用 `Invoke-WebRequest`（而非 curl）避免 PS 5.1 向原生程序传参剥引号。

---

## 6. 本机环境限制（影响后续接手者的操作方式）

| 限制 | 现象 | 规避方式 |
|---|---|---|
| `pnpm <script>` 不可用 | pnpm 用管道 spawn 子进程 → `spawn EPERM` | 直接调底层二进制（如 `node node_modules/typescript/bin/tsc ...`、`node node_modules/vite/bin/vite.js`） |
| Vite 构建需放宽沙箱 | esbuild 服务进程 `spawn EPERM`；放宽后仍需 `TEMP` 指向工作区（否则清理系统临时文件被拒） | 用 `$env:TEMP`/`$env:TMP` 指向工作区内目录后再构建 |
| 无 git | 未安装 git，仓库无版本历史 | 本轮开工前做了源码快照（117 文件）作回滚点；**建议尽快安装 git 并建立基线提交** |
| 无 CI / 无 lint | 文档 §13/§14 要求 CI + license 白名单校验，实际不存在 | 未在本轮引入（见 §8） |

---

## 7. 明确未做（禁止静默绕过）

| 项 | 原因 |
|---|---|
| 统一错误体 `{error, reason, fields}` 的全局 ExceptionFilter | 涉及全 API 响应契约，需单独立项评估向后兼容；本轮未改（class-validator 仍是 Nest 默认体） |
| `POST/GET /api/files` 上传（文档 §9.2 已描述） | 独立模块 + 存储策略，非本轮范围；完成凭证仍是文本描述 |
| 登录限流（429） | 需引入 Throttler 依赖，本轮不引入新依赖 |
| `GET /tasks` 的日期过滤/分页 | 本轮"今日范围"在展示层实现（与日程投影同层，符合既有约定）；后端仍返回全量（take 200） |
| TaskCard 可展开面板、本周打卡区、成长页 | P2 文档 §8/§9 的剩余项，未在本轮做 |
| 日程页"未安排 N"仍统计全量未安排任务（非仅今日） | 既有实现，未改动 |
| 移动端 P3 | 未开工（`apps/mobile` 仍是登录/探活脚手架） |
| 两个 e2e spec 打 `localhost:3100` | 既有实现，未改动（本轮新增的是 `scripts/p2-smoke.ps1`） |
| 教师角色 UI | 后端 `role` 枚举与契约不变，仅注册页不再暴露"教师"选项（无任何教师功能，避免引导到 403 死路） |

---

## 8. 后续建议（按价值排序）

1. **装 git + 建基线提交**，再把 CI（lint + typecheck + smoke）接上——目前没有任何自动化回归门。
2. **统一错误体**：加全局 ExceptionFilter，让 class-validator 的 400 也返回 `{error, reason, fields}`（前端 `toApiError` 已按此契约实现，现在是空转）。
3. **P2 剩余 UI**：TaskCard 可展开面板（进度/完成标准/行内操作）、本周打卡位、成长页（`/growth/me` 接口已具备）。
4. **P3 移动端**：`apps/mobile` 复用 `shared-types` 与后端，优先补齐 任务列表/详情/提交/审批 四屏。
5. 之后按阶段表推进 P4 打卡（WorkPulse 逻辑直迁）与 P5 Event + 日历（TaskLabs/Kaneo）。

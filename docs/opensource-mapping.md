# 开源资产映射表（OpenSource Mapping）

> 维护规则：**每完成一个模块即更新本表**。用途：核查"当初选定的开源项目，是否真正进入了代码实现"。
> 落地流程（开发期强制）：开源源码 → 定位具体实现（文件/函数/行号）→ 说明解决什么问题 → 映射到本项目模块 → 确定采用哪些能力 → 再写本项目代码。
> 禁止静默绕过：不采用某已确认能力时，必须在本表"未采用能力记录"中显式说明。

---

## 一、资产映射总表

| 开源项目 | 源码位置 | 能力 | 本项目模块 | 采用方式 | 最终代码位置 |
|---|---|---|---|---|---|
| TaskLabs | `C:\Users\48489\AppData\Local\Temp\osr\tasklabs-main\backend\convex\schema.ts`（calendarEvents @129-157）、`events\model.ts`、`events\service.ts`、`events.ts`、`frontend\lib\calendar\grid.ts` | Event 数据模型（字段/状态机 SCHEDULED⇄COMPLETED/时间语义/allDay/8 色调色板） | event | 重新实现 / 结构映射（epoch ms → PG timestamptz） | `apps/api/src/event` |
| TaskLabs | `osr\tasklabs-main\backend\convex\events\model.ts@156-232` | recurrence 单行 + 查询时展开（V1 不启用，留档 V2） | event | 设计留档（暂不实现） | — |
| TaskLabs | `osr\tasklabs-main\frontend\app\(app)\calendar\page.tsx@63-65` | Event 与 Task 零关联 + 日历并行聚合混合渲染 | event / web | 设计采用（模式） | `apps/api/src/event`、`apps/web/src/pages/calendar.tsx` |
| TaskLabs | `osr\tasklabs-preview\src\components\calendar\calendar-week.tsx`（header grid、HOUR_PX=56 时间刻度、事件 top/height 绝对定位算法）、`event-chip.tsx`（task 虚线 / event 实色语义） | 时间轴定位算法 + Task/Event 视觉区分 → Two-Day 日程（今天+明天、07:30–21:30） | schedule / web | 算法移植（7 列→今天\|明天 2 列、24h→07:30–21:30；Task 用 startAt 投影 24px 虚线块，不取时长；视觉改旧 Demo 像素） | `apps/web/src/lib/schedule.ts`、`apps/web/src/components/schedule/two-day-grid.tsx`、`schedule-chip.tsx` |
| TaskLabs | `osr\tasklabs-preview\src\components\tasks\task-side-panel.tsx`（Sheet 创建/编辑二合一 `task===null` 即创建、identity 渲染期重置、isDirty 保存态 Saved/Save changes） | 任务创建/编辑统一 Sheet 交互模式 → 统一 Task Create | task-create / web | 模式移植（Radix Dialog 像素 Sheet；identity key 重建 + 标题空禁用 + 保存中/已保存） | `apps/web/src/components/ui/sheet.tsx`、`apps/web/src/components/task-create/task-create-sheet.tsx` |
| Kaneo | `osr\kaneo-main\apps\web\src\components\calendar\month-grid-model.ts@50-168` | 月视图布局（buildMonthWeeks / packWeekLanes / 车道打包 / overflow） | event / web | 算法移植 | `apps/web/src/lib/calendar` |
| Kaneo | `osr\kaneo-main\apps\web\src\lib\task-schedule.ts@34-57` | 日期归一化（缺端补齐/反序 swap/归档排除） | event / web | 算法移植 | `apps/web/src/lib/calendar` |
| Kaneo | `osr\kaneo-main\apps\web\src\components\calendar\calendar-task-bar.tsx`、`day-overflow-popover.tsx` | 多日跨周连续表示、"+N more" overflow、点击弹层 | event / web | 交互借鉴 | `apps/web/src/components/calendar` |
| Quorum | `osr\quorum-master\internal\model\model.go`、`internal\service\request_service.go@538-575` | 审批数据模型（requests/approvals/audit_logs 三表）+ 状态机 evaluateWithCounts + 行锁 | approval | 设计翻译（单阶段简化） | `apps/api/src/approval` |
| Quorum | `osr\quorum-master\internal\service\request_service.go@285-352,764-800` | 守卫链（自审禁止/白名单/CanViewerAct 预判）+ 幂等键 | approval | 设计翻译 | `apps/api/src/approval` |
| StaffScheduler | `osr\StaffScheduler-main\backend\src\services\ApprovalDecisionService.ts@228-308` | 审批决策只推审批步、返回 isFinalStep、`WHERE status='pending'` 守卫 | approval / completion | 模式重写 | `apps/api/src/approval` |
| StaffScheduler | `osr\StaffScheduler-main\backend\src\services\TimeOffService.ts@245-336`、`ShiftSwapService.ts@431-539` | isFinalStep 同事务副作用（**先副作用、后决策写入** + FOR UPDATE + 双 pending 守卫） | completion | 模式重写（Prisma $transaction） | `apps/api/src/completion` |
| WorkPulse | `osr\workpulse-saas-main\backend\migrations\20250416120100-create-attendances.js@58-65` | attendance 模型 + UNIQUE(user_id, attendance_date) | attendance | 逻辑重写 | `apps/api/src/attendance` |
| WorkPulse | `osr\workpulse-saas-main\backend\services\attendance.service.js@98-198,204-278` | checkIn 预检 + 23505→409 / checkOut / today 三态 / history | attendance | 逻辑重写 | `apps/api/src/attendance` |
| WorkPulse | `osr\workpulse-saas-main\backend\config\env.js@60`、`attendance.service.js@14-26` | ATTENDANCE_TIMEZONE + Intl 日历日计算 | attendance | 逻辑重写 | `apps/api/src/attendance` |
| wrong-notebook | `huahuastudy\research\_artifacts\ref_repos\wrong-notebook\wrong-notebook-main\prisma\schema.prisma` | ErrorItem → WrongQuestion 模型映射、KnowledgeTag 邻接表课标树 | wrong-question | MIT 意向复用（个人自用，附版权声明；见 §二第 57 行决策） | `apps/api/prisma/schema.prisma`、`apps/api/src/wrong-question` |
| wrong-notebook | `wrong-notebook-main\src\app\api\error-items\route.ts@70-102` 等 | 2 秒去重算法、多维筛选查询构造、掌握状态流转 | wrong-question | MIT 意向复用（个人自用，附声明；算法级迁移） | `apps/api/src/wrong-question` |
| wrong-notebook | `wrong-notebook-main\src\app\...`（upload-zone/image-cropper/image-utils） | 图片前端管线（压缩 ≤1MB） | wrong-question / web | MIT 意向复用（个人自用，附声明；逻辑参考改写，存储仍用 URL+磁盘） | `apps/web/src/components/wrong-question` |

> 注：上表"源码位置"为调研基准快照（2026-10-05 只读）；开发阶段以实际读取为准，若实现时发现基准不符，更新本表并记录。

---

## 二、未采用能力记录（禁止静默绕过；新决策追加到此表）

| 原开源能力 | 本项目原计划用途 | 最终未采用 | 原因 | 替代方案 |
|---|---|---|---|---|
| TaskLabs rrule / recurrenceParentId（重复日程） | Event 重复日程 | ✅ 未采用（V1） | 展开逻辑重；用户指示不引入复杂 RRULE；V1 最小范围 | V2 按 TaskLabs"单行+查询时展开"模式引入 |
| TaskLabs reminder 用户级偏好 + 调度投递 | 事件提醒投递 | ✅ 未采用 | TaskLabs 自身投递未实现（crons.ts 空壳）；本项目不做复杂通知中心 | V1 仅存 `remindMinutes/remindAt` 字段；投递待通知中心立项 |
| TaskLabs isPrivate / location / workspace 归属 | Event 字段 | ✅ 未采用 | 家庭即隔离边界（familyId 单列）；儿童日程无地点需求 | — |
| TaskLabs Event↔Task 关联（实际为零关联） | 日程关联任务 | ✅ 未采用（改为零关联） | TaskLabs 模式即零关联，并行聚合更简洁、无耦合 | 日历并行查询 Event + Task(due 投影) 混合渲染 |
| Kaneo 全量拉取 + 客户端裁剪 | 日历数据获取 | ✅ 未采用 | 数据量增长后不可扩展 | 按 TaskLabs 区间查询（from/to + 内存展开） |
| Kaneo 独立 Event 实体（不存在） | Event 建模 | ✅ 不适用 | 源码证实 Kaneo 无 Event 实体，日历=task 日期投影 | Event 建模归 TaskLabs |
| Kaneo Project/Workspace/Kanban/Gantt/RBAC/协作/iCal | 项目管理 | ✅ 未采用 | 用户明确禁止；多余复杂度 | — |
| Quorum 多阶段/票数阈值/expired/outbox/SSE/webhook/多租户/Svelte 中台/MSSQL | 审批能力 | ✅ 未采用 | 单步人工确认即 V1 上限；企业级能力属多余复杂度；独立服务与本项目内嵌模式不符 | 单阶段两表 + evaluateWithCounts 简化翻译 + 幂等键 |
| Quorum payload JSONB 容器模式（业务数据外置） | 审批关联业务 | ✅ 未采用 | 业务数据应留在业务表，不做"数据外置+回调"范式 | business_type/business_id 引用 + 审计表 |
| StaffScheduler 多步审批 / escalate / 轮班本体 | 审批能力 | ✅ 未采用 | 同 Quorum；V1 单步 | — |
| WorkPulse timesheet 工时换算 / ABSENT/HALF_DAY / HR 域 | 打卡统计 | ✅ 未采用 | 儿童打卡无考勤语义；产品决策"不奖励单纯打卡" | V1 仅 present + total_minutes 直存（打卡即 present） |
| WorkPulse 排班/GPS/人脸/QR/薪资/补卡/streak | 打卡扩展 | ✅ 未采用 | 用户明确禁止 | — |
| wrong-notebook ReviewSchedule 间隔算法 | 错题复习调度 | ✅ 未采用 | 表存在但无实现；V1 用简单轮次 | WrongQuestionReview 简单轮次（round/status） |
| wrong-notebook AI 识题/解析/相似题（analyze / practice/generate） | 错题录入辅助与练习 | ✅ 未采用（V1） | 2026-10-05 用户确认：**V1 不做任何 AI**（OCR/自动识题/自动解析/自动批改/相似题生成），以后单独规划 | V1 手动录入闭环；提示词结构仅 V2 留档（clean-room） |
| wrong-notebook 自由命名科目（Subject=错题本） | 错题分类 | ✅ 未采用 | 违反固定学科枚举决策 | 学科枚举（chinese/math/english/olympiad/pet） |
| wrong-notebook base64 图片入 DB | 图片存储 | ✅ 未采用 | 违反存储规范（URL + 磁盘 + 鉴权下载） | imageUrls 数组 + 文件服务 |
| wrong-notebook GeoGebra / admin 后台 / i18n / PracticeRecord 统计 | 错题本扩展 | ✅ 未采用 | 与 V1 范围无关 | — |
| wrong-notebook 源码直接复制（无 LICENSE 文件） | 错题本实现 | **✅ 原"严禁"已解除（2026-10-05 用户决策）**：README 明确 MIT 意向 + **个人自用不商用**前提 → 可按 MIT 复用（复制+适配+附版权声明）；数据模型/去重算法/筛选逻辑可直迁。**剩余风险**：作者未在仓库放 LICENSE 文件，形式授权不完整；**商用/对外发布前必须联系作者补正式授权或替换** | MIT 意向复用 + 版权声明（P6 实施时建 `docs/THIRD_PARTY_NOTICES.md` 记录） |

---

## 二点五、P1 复用决策（2026-10-05，许可证核验后；配套 `docs/THIRD_PARTY_NOTICES.md`）

> P1 = Task / Completion / Approval / Growth（后端核心）。原则：MIT 允许直接复用 → 优先复用成熟源码并做适配，保留版权声明；无 LICENSE → 仅 clean-room。

| 本项目模块 | 来源项目（LICENSE） | 复用内容（源文件） | 采用方式 | 落点 | 状态 |
|---|---|---|---|---|---|
| approval | StaffScheduler（MIT） | 状态转移表/`nextState`(409)/`isTerminal`（ApprovalStateMachine.ts） | 直接复用+适配 | `apps/api/src/approval/approval.state-machine.ts`（TRANSITIONS 在 shared-types `approval.ts`） | ✅ 已落地（2026-10-05） |
| approval | StaffScheduler（MIT） | `decidePendingApproval`：只推审批步 + 返回 isFinalStep + `WHERE status='pending'` 守卫（ApprovalDecisionService.ts） | 直接复用+适配 | `apps/api/src/approval/approval.service.ts`（decide + updateMany 守卫） | ✅ 已落地 |
| completion | StaffScheduler（MIT） | isFinalStep 同事务副作用顺序（TimeOffService.ts / ShiftSwapService.ts） | 模式复用+适配 | `apps/api/src/completion/completion.service.ts`（$transaction + FOR UPDATE + 先副作用后决策） | ✅ 已落地 |
| approval | Quorum（MIT） | `evaluateWithCounts` 决策求值（Go→TS 翻译，单阶段化）；自审禁止/幂等/CanViewerAct 守卫链（request_service.go） | 逻辑适配（保留声明） | `apps/api/src/approval/approval.evaluate.ts` + `approval.service.ts`（canAct/自审/部分唯一） | ✅ 已落地 |
| task / growth | —（自有产品规则） | v1.2 状态机与成长数值（非开源来源） | 自研 | `apps/api/src/task|growth` + shared-types `task.ts|growth.ts` | ✅ 已落地 |

> 未采用（P1 范围外，理由见 §二）：wrong-notebook（无 LICENSE）、TaskLabs/WorkPulse/Kaneo（P5/P4 才用）、Quorum 多级/票数阈值/outbox/SSE（单步即上限）、StaffScheduler 多步/escalate/轮班本体。

---

## 二点六、P1 功能 × 参考来源核验表（2026-10-05，编码前硬核验）

> 每条核心功能必须能回答"这个实现是从哪里来的？"：A=有明确开源来源→复用/适配；B=有明确开源技术模式→按模式实现；C=无合适来源→明确标注自研。禁止无标注自研。

| P1 功能 | 参考项目 | 具体参考源码 | 可复用内容 | 复用方式 | 是否直接复用 | 如果无参考，原因 |
|---|---|---|---|---|---|---|
| **Task** | TaskLabs（已检查） | `backend/convex/schema.ts:66-90`（taskTable `status: v.union(TO_DO/IN_PROGRESS/IN_REVIEW/DONE)` + column kanban）、`backend/convex/tasks/service.ts`（listTasks 过滤） | "状态=枚举 + 受控转换"的模式；任务字段骨架（title/start/due/status） | B 模式借鉴（不搬 kanban 列/排序/工作流） | 否 | kanban 列模型与 v1.2 单任务生命周期不匹配、v1.2 明确不做 kanban；**状态转换矩阵本身是 v1.2 产品规则（§8.2）**，CRUD 薄层自研 |
| **Completion** | StaffScheduler | `backend/src/services/ApprovalDecisionService.ts:228-308`（`decidePendingApproval` 只推审批步、返回 `isFinalStep`）；`TimeOffService.ts:245-336` / `ShiftSwapService.ts:431-539`（提交→pending→决策→业务副作用完整流） | "提交→pending→reviewer 决策→最终业务副作用"流程形态；决策与副作用分离 | A 直接复用+适配（决策服务模式）；副作用事务按 TimeOffService 顺序重写为 Prisma | 是 | — |
| **Approval** | StaffScheduler + Quorum | StaffScheduler `ApprovalStateMachine.ts:35-68`（TRANSITIONS / `nextState` 非法 409 / `isTerminal`）、`ApprovalDecisionService.ts:228-308`；Quorum `request_service.go:538-575`（`evaluateWithCounts` 决策求值）、`:764-800`（`CanViewerAct`）、`:90-161`（自审禁止/幂等/指纹）、`:365-430`（FOR UPDATE） | 状态转移表+非法转移 409；决策求值纯函数；自审禁止；行锁；只读预判 | A（TS 直接适配）+ 逻辑翻译（Go→TS，保留声明） | 是 | — |
| **RewardGrant** | 无（已检查全部 6 个参考项目：均无奖励发放实现） | —（幂等机制可借鉴 Quorum `request_service.go:26/95` 幂等键思想 → 落地为 DB 唯一约束） | 发放逻辑无可复用；幂等机制=B（借鉴 Quorum 幂等思想 → UNIQUE 约束） | C 自研（发放逻辑）+ B（幂等机制） | 否 | 领域内无 reward grant 开源实现；发放金额待产品定档（基础奖励数值未在 6 项确认内） |
| **Growth** | 无 | —（已核验 TaskLabs 无 XP/等级；HabitSync 有 XP 但源码未留存且含漏打卡惩罚机制，与本产品"不惩罚"决策冲突） | 无 | C 自研（等级派生纯函数 + 曲线常量，**严格按 v1.2 §18#3 产品规则**） | 否 | v1.2 数值规则是产品定义（XP 100+20×(lv−1)、六维 50+15×(lv−1)、累计不扣、自动连续升级、Lv.100 封顶）；无合适的 P1 开源实现 |
| **State Machine** | StaffScheduler + Quorum | `ApprovalStateMachine.ts:35-68`；`request_service.go:538-575` | TRANSITIONS 表 + `nextState`（非法→409）；纯函数求值 | A 直接适配（shared-types 常量 + service 校验） | 是 | — |
| **Transaction** | StaffScheduler | `TimeOffService.ts:285-336`（beginTransaction → `SELECT FOR UPDATE` → 业务副作用 → `decidePendingApproval` → commit）；`ShiftSwapService.ts:473-539` | **"先副作用、后决策写入、最后 commit"** 的事务边界与顺序 | A 模式复用（Prisma `$transaction` + `$queryRaw FOR UPDATE`） | 是（模式） | — |
| **Concurrency** | StaffScheduler + Quorum | `ApprovalDecisionService.ts:247-257`（决策 UPDATE `WHERE id=? AND status='pending'` 守卫）；`request_service.go:365-430`（FOR UPDATE 串行化并发决策） | 行锁 + pending 守卫 + 受影响行数判定冲突（409） | A 直接适配 | 是 | — |
| **Idempotency** | Quorum（+本项目 DB 约束惯例） | `request_service.go:26/95`（幂等键）、`:115-117`（指纹防重） | 幂等思想 → 落地为 DB 部分唯一索引（`(business_type,business_id) WHERE status='pending'`、`completion_id` 唯一）+ 23505 兜底 | B 思想借鉴 → DB 约束实现（手写 SQL，v1.2 既定） | 否 | 机制不同：本项目走 DB 唯一约束（更简），不引入应用层幂等表 |

> **规则 10 备注**：未发现比现有指定项目更适合 P1 的开源实现；唯一候选为 Growth 的 HabitSync（MIT，有 XP/等级实现但源码未留存、含惩罚机制），**若需其模式参考，请用户确认后另行克隆**，不自行替换。

---

## 二点七、P2 前端复用核验（2026-10-05，UI 编码前硬核验）

> 规则：A=有明确 LICENSE 且成熟实现→优先直接复用；B=成熟设计模式但不宜直接搬→source-level 参考后适配；C=无合适开源来源→明确标注"自研"（不自行编造参考来源）。
> 已核验前端源码：TaskLabs（shadcn/ui new-york + Radix + sonner）、Kaneo（Base UI 自研 + Tailwind v4）、StaffScheduler（React18+TS+Bootstrap5+TanStack Query+RHF）、WorkPulse（React18 JSX+Tailwind3 零依赖）、Quorum（Svelte5，代码不可入 React，仅模式）。
> **P2 前端底座决策（供确认）**：引入 **shadcn/ui（MIT，Radix 原语）** 作为通用组件库——TaskLabs 的 `components/ui/` 即标准 shadcn 模板（components.json 证实），可直接生成；数据层用 TanStack Query（StaffScheduler/Kaneo 均为 React+TanStack 用法参照）。

| P2 功能 | 页面/组件 | 参考项目 | 具体源码文件/组件 | License | 可直接复用内容 | 采用方式 | 自研部分 |
|---|---|---|---|---|---|---|---|
| 1. 今日首页 | TodayPage | TaskLabs + WorkPulse | TaskLabs `components/dashboard/today-tasks.tsx`（TodayTasks 今日任务分桶）、`next-seven-days.tsx`；WorkPulse `pages/DashboardPage.jsx`（STATUS_META 状态映射 + StatCard 打卡卡） | MIT | 今日任务分桶列表模式；StatCard 统计卡；打卡按钮按状态显隐模式 | B 适配（模式移植；打卡卡 P4 落地） | 今日页组合、成长摘要区（数据来自 /growth/me） |
| 2. 任务列表 | TaskListPage | TaskLabs + Kaneo | TaskLabs `components/tasks/task-list.tsx`（TaskList 分桶）、`task-row.tsx`（TaskRow：完成勾选 @47-51、优先级圆点、label 徽章）、`task-toolbar.tsx`（筛选）；Kaneo `components/list-view/index.tsx`（ListView 分组）、`task-row.tsx`、`lib/due-date-status.ts`（dueDateStatusColors 到期着色） | MIT | 行式任务组件结构；完成勾选交互；优先级/到期/状态着色映射；筛选工具栏 | B 适配（Bootstrap/BaseUI class→Tailwind 适配） | 按 v1.2 状态机（pending/in_progress/completed/returned）的筛选与展示 |
| 3. 任务详情 | TaskDetailPage | Kaneo + TaskLabs | Kaneo `components/task/task-details-sheet.tsx`（TaskDetailsSheet Sheet 详情）、`task-details-content.tsx`（标题/描述/属性/活动时间线）、`task-properties-sidebar.tsx`；TaskLabs `components/tasks/task-side-panel.tsx`（创建/详情二合一 + 脏检查 @159-167 + "rendering-time state reset" @134-154） | MIT | 详情 Sheet 结构；属性区（状态/优先级/日期 Popover）模式；脏检查与表单重置模式 | B 适配 | 审批状态区（提交/待审/意见展示——无现成，自研）、奖励区 |
| 4. 创建/编辑任务 | TaskFormPage | Kaneo + TaskLabs | Kaneo `components/shared/modals/create-task-modal.tsx`（创建弹窗+RHF）；TaskLabs `components/ui/form.tsx`（Form/RHF+zodResolver 封装）、`lib/validations/task.schema.ts`（zod schema：createTaskSchema@15、updateTaskSchema@27 partial+至少一字段 refine@41）、`components/ui/select.tsx`/`datetime-picker.tsx` | MIT | RHF+zod 表单模式；Dialog/Sheet 弹窗骨架；创建/编辑二合一（TaskSidePanel 模式） | B（表单模式复用；zod schema 按 v1.2 字段自写） | 字段集（title/subject/priority/requiresApproval/reviewerId 选择）——字段按 v1.2 |
| 5. 提交完成 | SubmitComplete | TaskLabs（无直接实现）+ StaffScheduler | TaskLabs `task-row.tsx@47-51`（完成勾选交互——最接近的"完成动作"）；StaffScheduler `pages/Approvals/DecisionModal.tsx`（note 输入模式） | MIT | 完成动作的交互模式；意见/说明 textarea 表单模式 | B 模式借鉴 | **提交完成表单（note/evidence）自研**——无现成"提交成果"页面 |
| 6. 待审批列表 | ApprovalListPage | **StaffScheduler（主参考）** + Quorum | StaffScheduler `pages/Approvals/PendingApprovals.tsx`（pending/all 筛选+表格）、`ApprovalRow.tsx`（行内展开 + STATUS_BADGE 映射 @26-38 + ✓/✗ 按钮）；Quorum `widgets/frontend/src/components/RequestList.svelte`（Svelte，仅模式） | MIT | React+TS 审批列表结构（筛选/行内状态/操作按钮）——StaffScheduler 与我们是同类 React 技术栈 | A→B（结构直接对照移植；Bootstrap class→Tailwind 适配） | 数据源 /approvals?as=reviewer；canAct 按钮列 |
| 7. 审批详情 | ApprovalDetailPage | Quorum + StaffScheduler | Quorum `console/frontend/src/pages/RequestDetail.svelte`（Approval Breakdown @300-335 + **Audit Trail 时间线** @407-436）；StaffScheduler `ApprovalRow.tsx` 展开链 | MIT | 审计时间线结构（action 着色+actor+相对时间）；决策清单展示 | B 模式移植（Svelte 代码不可入 React） | 我们的审批详情组件（业务字段 + canAct + 意见） |
| 8. approve / reject 交互 | ApprovalActions | **Quorum（主参考）** + StaffScheduler + WorkPulse | Quorum `widgets/frontend/src/components/ApprovalPanel.svelte@294-314`（**`viewer_can_act` 布尔显隐** approve/reject 区 + comment textarea + 决策按钮 + 成功后事件）；StaffScheduler `DecisionModal.tsx`（approve/reject+note+ButtonSpinner）；WorkPulse 按钮状态显隐 | MIT | **canAct 显隐模式（后端下发布尔——P1 已实现 canAct 字段）**；决策弹窗结构；提交中 spinner | A→B（模式移植 React；复用 P1 canAct） | React 组件自写（结构小） |
| 9. 成长首页 | GrowthPage | **无合适参考** | —（已核验 TaskLabs/Kaneo/StaffScheduler/WorkPulse/Quorum 均无成长/等级页面；HabitSync 有 XP/宠物前端但源码未留存、含惩罚机制，不引入） | — | — | **C 自研** | 成长页布局（等级/六维/金币/流水卡） |
| 10. XP / 等级展示 | LevelCard | Kaneo（仅进度条原语） | Kaneo `components/ui/progress.tsx`、`circular-progress.tsx`（通用进度条）；数据计算来自本项目 shared-types `growth.ts` `levelProgressFromXp`（自研纯函数） | MIT | 进度条/环形进度 UI 原语 | B（进度条原语复用） | 等级卡组件自研（等级派生数据已在前端共享纯函数中） |
| 11. 六维属性展示 | DimensionCard | **无合适参考** | —（无属性雷达/六维展示开源参考；HabitSync 宠物属性未留存） | — | — | **C 自研** | 六维展示（雷达/六格卡自研；图表库引入待评估） |
| 12. Reward / 奖励记录 | RewardListPage | StaffScheduler + Kaneo | StaffScheduler `pages/Admin/AuditLogs.tsx`（记录表格+筛选+分页）；Kaneo `components/ui/timeline.tsx` | MIT | 记录表格/筛选模式；时间线条目 | B 适配 | 流水字段（xp/六维/coins/grantedAt）展示组件 |
| 13. Loading/Empty/Error/Success | 通用状态 | **TaskLabs + StaffScheduler** + Kaneo + WorkPulse | TaskLabs `components/empty-state.tsx`（EmptyState）、`components/ui/skeleton.tsx`、`components/error-fallback.tsx`（ErrorFallback+重试）、`components/skeletons/task-list-skeleton.tsx`、sonner Toaster；StaffScheduler `components/QueryState.tsx`（loading→error→empty→content 四态一体）；Kaneo `components/ui/empty.tsx`、`error-display.tsx`、`lib/toast.ts`；WorkPulse `LoadingSkeleton.jsx`/`EmptyState.jsx` | MIT | Skeleton/Empty/ErrorFallback/Toast 组件与四态结构 | A→B（shadcn/ui 组件直接生成 + QueryState 四态思想） | 业务空态文案/错误映射（复用错误体 reason） |
| 14. 通用 Card/List/Modal/Form | ui-kit | **TaskLabs（shadcn/ui 主参考）** + Kaneo + WorkPulse + Quorum | TaskLabs `components/ui/`（**标准 shadcn/ui new-york**：card/dialog/sheet/input/select/badge/form/checkbox/switch/tooltip 等，components.json 证实）；Kaneo `components/ui/`（Base UI 自研版）；WorkPulse `components/ui/`（纯 Tailwind 零依赖）；Quorum `STATUS_COLORS/ACTION_COLORS`（lib/utils.ts@22-37 集中状态色映射） | MIT | **shadcn/ui（MIT）整套底座直接引入**；StatusBadge 集中色映射模式（Quorum） | **A（shadcn/ui 引入）** + B（业务封装） | 业务 StatusBadge（状态→颜色集中表，借鉴 Quorum 模式） |

> **无合适参考的项（明确告知，未编造来源）**：9 成长首页、11 六维展示、5 提交完成表单（仅模式借鉴）、10 等级卡（仅进度条原语）——以上自研。
> **数据层说明**：TanStack Query 用法参照 StaffScheduler（`frontend/hooks/useAuditLogs.ts`、`services/*`）与 Kaneo（`hooks/mutations/task/*`），均为 MIT 实际代码用法，非"业界最佳实践"话术。

---

## 二点八、P2 前置决策记录（2026-10-05 用户确认）

1. **reject 意见必填**：P2 开工前给 `DecideApprovalDto.comment` 加必填校验（`@IsNotEmpty`），并同步 `P1-人工验收指南.md` 附三。
2. **奖励按历史草案**：已从 `huahuastudy/docs/product/task-growth-rules-v1.0.md §13.3` 提取初始配置表（该节标题为"✅ 初始配置已确认"）：

| 标准任务 | XP | 智识 | 逻辑 | 表达 | 探索 | 羁绊 | 体魄 |
|---|---|---|---|---|---|---|---|
| 语文作业 | 20 | 5 | 0 | 3 | 0 | 0 | 0 |
| 数学作业 | 20 | 4 | 5 | 0 | 0 | 0 | 0 |
| 英语作业 | 20 | 4 | 0 | 4 | 0 | 0 | 0 |
| 奥数课后作业 | 30 | 5 | 12 | 0 | 0 | 0 | 0 |
| PET 复习/练习 | 25 | 5 | 0 | 5 | 0 | 0 | 0 |
| 阅读科学书籍 | 30 | 8 | 2 | 0 | 5 | 0 | 0 |
| 阅读人文书籍 | 30 | 6 | 0 | 4 | 5 | 0 | 0 |
| 探索一个科学问题 | 35 | 5 | 5 | 0 | 8 | 0 | 0 |
| 完成一次科学小实验 | 40 | 6 | 6 | 0 | 8 | 0 | 0 |
| 了解一段历史或一种文化 | 30 | 5 | 0 | 4 | 5 | 0 | 0 |
| 主动认识一位新朋友 | 30 | 0 | 0 | 5 | 3 | 8 | 0 |
| 与家人进行一次深入交流 | 25 | 0 | 0 | 5 | 0 | 8 | 0 |
| 参加一次集体活动 | 35 | 0 | 0 | 5 | 3 | 8 | 0 |
| 与他人合作完成一件事 | 40 | 0 | 3 | 5 | 0 | 8 | 0 |
| 主动表达感谢或关心 | 15 | 0 | 0 | 3 | 0 | 5 | 0 |

> 金币：**最低档 100**（各任务具体金币数值历史草案未配置）；冒险/悬赏奖励历史草案未配置。
> **映射缺口（需确认）**：该表按"标准任务名"分档，而 v1.2 Task 无 taskType、只有 `subject` 学科枚举（chinese/math/english/olympiad/pet）。**日常 5 项可与 subject 一一映射**（语文→chinese、数学→math、英语→english、奥数→olympiad、PET→pet）；**世界/风物 15 项无 subject 对应**——建议二选一：① 给 Task 增加"标准任务名"字段（按上表定档，未匹配则默认档）；② 世界/风物奖励暂用统一默认档、仅日常按 subject 定档。请拍板后实施。

---

## 二点九、奖励配置映射方案（产品/数据模型，2026-10-05 用户确认）—— ✅ 已实施

### 1. 两种方案对比

| 比较维度 | A. Task.rewardProfile（受控枚举 → 标准奖励配置表） | B. 仅按 subject 匹配日常 |
|---|---|---|
| 是否破坏 v1.2 Task 模型 | **低影响**：Task 新增 1 个可空列（`reward_profile`），不改现有字段/状态机/API；可回滚 | 零改动（复用现有 subject） |
| 覆盖历史草案 15 项 | **15/15 全覆盖**（15 个 profile code + custom） | **仅 5/15**（日常 5 项）；世界/风物 10 项无法表达 |
| 未来扩展更多标准任务 | **加配置行 + 前端选项自动出现**，无需改 Task 结构 | 受限：subject 只有 5 个学科，无法表达非学科任务 |
| 前端创建任务如何选择 | 下拉**受控选项**（API 返回 code/label/category），无自由文本 | 日常任务选 subject 即得奖励；非日常任务无正确选项 → 全默认 |
| 数据库设计 | 新表 `reward_profiles`（code 主键 + xp/六维×6/coins）+ `tasks.reward_profile` 列（**FK→reward_profiles.code，可空**） | 无新表；奖励映射放代码常量（按 subject 键） |
| 避免自由输入导致失效 | 三层防护：① 前端受控下拉；② 服务端 DTO `@IsIn` 白名单；③ **DB FK 引用完整性**（code 不存在则插入失败） | subject 本身是受控枚举不会自由输入失效，但**语义错配风险高**（如把"阅读科学书籍"标为 math 会拿到错误奖励） |
| 语义耦合 | `subject`=学科（学习内容标签，与错题本共用）、`rewardProfile`=任务性质→奖励档，**两者正交** | **奖励语义耦合进 subject**：subject 同时被错题本使用，未来学科枚举变更会牵连奖励 |

### 2. 推荐：方案 A（rewardProfile 受控枚举）

理由（对应上表）：① 覆盖 15/15，B 只能覆盖日常 5 项；② `subject`（学科）与"任务性质/奖励档"语义正交——B 把奖励配置绑到学科枚举会污染 subject 的原有含义（错题本也用它）；③ 未来新增标准任务 = 配置表加一行，前端下拉自动出现；④ 防失效由前端下拉 + 服务端白名单 + DB FK 三重保证，B 仅靠"用户别选错学科"。**你的倾向（rewardProfile 而非自由文本"标准任务名"）即方案 A 的受控枚举形态。**

### 3. 数据模型（实施稿）

```prisma
// 标准奖励配置（种子：15 项历史草案 + 'custom' 默认档）
model RewardProfile {
  code        String   @id @db.VarChar(32)   // 'chinese_homework' | 'math_homework' | ... | 'custom'
  label       String   @db.VarChar(64)       // 显示名：语文作业 / 数学作业 / ... / 自定义
  category    String   @db.VarChar(16)       // daily / world / scenery / custom（仅前端分组，不参与计算）
  xp          Decimal  @default(0) @db.Decimal(12, 4)
  intelligence Decimal @default(0) @db.Decimal(12, 4)
  logic       Decimal  @default(0) @db.Decimal(12, 4)
  expression  Decimal  @default(0) @db.Decimal(12, 4)
  exploration Decimal  @default(0) @db.Decimal(12, 4)
  connection  Decimal  @default(0) @db.Decimal(12, 4)
  vitality    Decimal  @default(0) @db.Decimal(12, 4)
  coins       Decimal  @default(100) @db.Decimal(12, 4)  // 金币：统一最低档 100，15 类不猜分档
  isActive    Boolean  @default(true) @map("is_active")
  createdAt / updatedAt
  tasks Task[]
  @@map("reward_profiles")
}

// Task 增加一列（可空；NULL/custom → 默认档）
model Task {
  // ...现有字段不变...
  rewardProfile String? @map("reward_profile") @db.VarChar(32)
  rewardProfileRef RewardProfile? @relation(fields: [rewardProfile], references: [code], onDelete: Restrict)
  // ...
}
```

- **金币**：`coins` 统一默认 **100**（历史草案只确认"最低档 100"）；15 类不再猜测各自金币值。若未来某类要提高，改配置行即可。
- **冒险/悬赏**：历史草案未配置奖励 → 走 `rewardProfile='custom'` 默认档（custom 档的 xp/六维默认数值**待确认**：沿用 P1 占位 xp10/六维各2，或全部 0；金币 100）。
- **发放取值**：发放时按 `task.reward_profile` 读取配置表当前数值（不存快照，简单一致；若需历史一致性，后续可演进为任务创建时快照到 `reward_config` JSON）。
- **种子**：`reward_profiles` 预置 16 行（15 项按 §二点八表格数值 + `custom`）。
- **shared-types**：`REWARD_PROFILE_CODES` 常量（15+1）；DTO `@IsOptional @IsIn(REWARD_PROFILE_CODES)`；前端选项建议**动态取 GET /reward-profiles**（避免枚举与种子双份漂移）。

### 4. 前端创建任务交互（实施后）

- 表单新增"奖励档位"下拉：选项来自 `GET /api/reward-profiles`（code/label/category 分组：日常/世界/风物/自定义）。
- 不提供自由文本；未选 = `custom` 默认档。
- 前端只显示 label，不显示数值（数值属配置，不鼓励用户挑高分档；如需展示可后续评估）。

### 5. 待确认清单（已结案，2026-10-05 P2 收口）

1. 采纳**方案 A（rewardProfile 受控枚举）**？→ **已采纳并实施**（`reward_profiles` 表 + `tasks.reward_profile` 列 + DTO `@IsIn` + 前端下拉）。
2. `custom` 默认档数值：沿用 P1 占位（xp10/六维各2/coins100）还是 0/0/0/0/0/0/0 + coins100？→ **沿用 P1 占位**（`apps/api/prisma/seed.js`：CUSTOM = xp10 / 六维各 2 / coins100）。
3. 冒险/悬赏是否也需要"创建时自定义奖励"（`reward_override JSONB`）？→ **暂不引入**（保持 v1.2 模型"够用即止"，后续需要再加列）。

---

## 二点十、P2 收口决策记录（2026-10-05，用户确认）—— ✅ 已实施

**用户拍板的两项决策**（本轮据此实施，不再保留"待确认"）：

1. **奖励档映射缺口 → 统一走默认档，不做精确映射**：Task 不新增"标准任务名"字段，15 个世界/风物档不做"按任务名精确挑档"的映射；未选档位时走 `custom` 默认档（`Task.reward_profile = NULL` 业务上等同 CUSTOM）。§二点八「映射缺口（需确认）」据此关闭。
2. **P2 收口范围 = 闭环 + P1 硬缺口**：家庭入口、审批决策 UI、会话保活、今日范围、登录页像素化。

**本轮复用的开源模式（无新增外部资产）**：

| 能力 | 参考来源（已在 §一/§二点五登记） | 本轮用法 |
|---|---|---|
| 审批"仅指定审核人可操作"的只读预判 | Quorum `CanViewerAct` 思想（§二点五已登记） | `ApprovalRequestDto.canAct` 驱动 Web 审批按钮显隐（前后端同源，不在前端重复实现规则） |
| 业务无关的处理器注册表 | StaffScheduler `PendingApprovalDispatch` 思想（§二点五已登记） | 在同一 `ApprovalService` 注册表模式上**扩展**只读的 `registerDescriptor`（业务模块提供"这条审批是关于什么"的标题/任务 id），避免审批模块反向依赖 task |

**未采用记录（禁止静默绕过）**：

| 原能力 | 原用途 | 未采用原因 | 替代方案 |
|---|---|---|---|
| 完整 Family 模块（families/family_members 表 + 邀请码列 + 成员关系） | 家庭成员管理 | 与《新项目V1》§3.5 硬基线冲突（"仅 family_id 单列，无 Family 模块/邀请码/成员表"） | 最小家庭入口：`familyId = 创建家庭的家长 user id`，邀请码 = 该家长 username（与 `docs/P1-人工验收指南.md` §0.4 的 SQL 口径一致，历史数据零迁移） |
| 审批列表额外 join task 的业务耦合写法 | 显示"审批对应哪个任务" | 破坏"审批模块业务无关"边界 | 通用描述解析器注册表（`registerDescriptor`，见上表） |
| 第三方日历库（react-calendar 等） | 时间格/日历原语 | P2 已用 TaskLabs 算法自研 `lib/schedule.ts`（§一 schedule 行已登记），本轮不引入新依赖 | 沿用现有纯函数实现 |

---

## 三、落地流程（每个模块开发时的执行清单）

1. 定位源码：按本表"源码位置"读取对应文件，核对能力实现。
2. 记录映射：确认"该能力 → 本项目哪个模块 → 采用方式 → 代码落点"。
3. 实现：按本项目数据模型/API/模块边界重新实现（禁止整搬、禁止照抄 README）。
4. 更新本表：标注该行能力"已落地（文件路径）"或"未采用（补记原因）"。
5. 复查：模块完成后，对照 §一 检查是否有选定的能力未进入代码。

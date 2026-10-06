# Task Create + Schedule 重新设计（调研与方案）

> 版本：v1.0 · 2026-10-05
> 性质：**调研 + 方案文档**（本轮不改任何代码；确认后进入实现）
> 触发：上一轮 Calendar 实现存在核心理解偏差——任务创建不是 Today 专属，Today 与 Schedule **都是入口**，共用**同一个** Task Create 组件；并需按 huahuastudy TwoDayView 增加**日期条**。
> 参考：huahuastudy（proto-kid-v2 / task-page / task-form / TwoDayView / week-date-nav / schedule-page / kid-calendar）+ TaskLabs（Calendar 已实测 + TaskSidePanel/TaskList/quick-add/date picker）+ Kaneo（create-task-modal，1613 行已定位结构）。
> 原则：TaskLabs = 结构/实现参考；huahuastudy = 像素视觉参考；不照搬任何一个项目。

---

## 1. Today / Schedule 两个创建入口

**结论：任务创建是系统级能力，Today 与 Schedule 是两个入口，共用同一个 Task Create 组件（Pixel Task Create Sheet）。**

| 入口 | 位置 | 触发方式 | 预填 |
|---|---|---|---|
| Today | 页面顶部【新建任务】按钮（accent 像素按钮） | 点击 | 无 |
| Today | 今日任务列表底部【+ 添加任务】快速行 | 点击 | 无 |
| Schedule | 日期条区域【新建任务】按钮 | 点击 | 无 |
| Schedule | **时间格点击**（可选增强，见 §7） | 点击具体时刻 | `startAt = 选中日期 + 点击时刻` |

- 不开发两套表单；所有入口打开同一个 `TaskCreateSheet`。
- 现有 `/tasks/new`、`/tasks/:id/edit` 路由保留兼容（渲染同一 Sheet 容器）。
- 现状核对：`TodayPage.tsx` 目前无任何新建入口（要加）；`SchedulePage.tsx` 无新建入口（要加）；`TaskFormPage.tsx` 是独立整页（改造为 Sheet 承载，不丢弃其 RHF+zod 表单逻辑）。

## 2. huahuastudy TwoDayView 日期条

**源码定位**：`huahuastudy/apps/web/src/components/week-date-nav.tsx`（173 行，二版修正版）+ `pages/schedule-page.tsx@241`（用法）+ `components/two-day-view.tsx`（下方两日视图）。

### 2.1 结构（WeekDateNav）

- **7 日格**：显示「选中日所在周」的 7 天（`daysOfWeek(selectedDay)`）；每格两行：**第一行星期（一~日）、第二行日期数字**。
- **今天**：橙色数字 + 橙色小圆点（轻量强调，不用大面积橙块）。
- **选中日**：浅底（`bg-panelLight`）+ 底部橙色短线（`border-b-2 border-accent`），非整块橙。
- 容器：`border-2 border-ink bg-panel p-1 shadow-pixel`（本身就是像素风）。
- 月份标签可选（儿童端移出导航区，由页面标题行承担）。

### 2.2 交互（WeekDateNav 三套）

1. **指针/触摸拖动**：`pointerdown/move/up` + `setPointerCapture`；整格步进实时高亮跟随（`Math.round(dx/cellW)`）；松手提交 `onSelect`；带**速度惯性甩动**（平滑速度采样 ≥2 才启用，甩动 ±0~2 天）；拖动后抑制误点。
2. **滚轮/触控板横向**：`deltaX` 主导（纵向不劫持）；整格步进 + **160ms 防抖提交**。
3. **点击格子**：`onSelect(d)`（拖动后 `suppressClickRef` 抑制）。

### 2.3 与两日视图的关系（核心逻辑）

- 唯一状态 `viewDate`（基准日）；下方 TwoDayView 显示 **viewDate + viewDate+1**（`days={2} anchorToWeek={false}`）。
- 日期条 = **导航**（选基准日）；两日时间轴 = **展示**（基准日 + 下一天）。
- 选 10/5 → 下方 10/5+10/6；选 10/6 → 10/6+10/7。

### 2.4 我们的改造（像素、不引入库）

- **自研 `WeekDateNav` 像素版**：结构/交互参考上述（7 日条、星期+数字、今天橙点、选中浅底+橙短线、拖动/滚轮/点击三套交互），视觉 = 现有 Pixel token（panel/ink/accent/shadow-pixel）。
- 状态：`selectedDate`（默认今天）→ 传给 TwoDayGrid 作 `baseDate`。
- **不写死「今天/明天」**：列标签 = `baseDate` 是今天才标「今天」；`baseDate+1` 是明天才标「明天」；否则显示「M月D日 周X」。
- 日期条首列与时间轴 gutter 对齐（`grid-cols-[3.5rem_1fr_1fr]` 上层再加日期条，首列留空）。

## 3. TaskLabs Calendar（已实测；本方案相关点）

上次已深度源码定位（`docs/schedule-two-day-design.md`）：calendar-week 时间轴算法、event-chip 虚线/实色、palette、grid、useNow。本方案仅补充相关点：

- **「Today」快捷按钮**：TaskLabs calendar-header 有 Today 按钮（跳回今天）——我们日期条加「今天」快捷（回到今天，选中今天）。
- **从时间位置创建**：TaskLabs 日历点格 → event-modal 预填时间——对应我们的「时间格点击 → TaskCreateSheet 预填 startAt」。
- **修正记录保留**：TaskLabs **没有**当前时间竖线/全天条/车道算法（已在 `p2-ui-ux-review.md` 顶部修正记录 + `schedule-two-day-design.md §3` 登记，本方案不再把这三项作为 TaskLabs 能力）。

## 4. Task Create 字段对比

**以我们真实 Task DTO/Prisma 为准（不凭空新增字段）。**

| 字段 | 我们现状（DTO/Prisma） | huahuastudy task-form | TaskLabs Sheet | Kaneo Dialog | 建议 |
|---|---|---|---|---|---|
| title | 必填，≤128 | 标题 + **标准模板 Combobox**（选模板带奖励快照） | Title | 大标题输入（2xl） | 保留必填输入；**不引入模板**（模板=huahuastudy 独有的 template 表，我们无此模型，奖励由 rewardProfile 承担） |
| description | 可选，≤2000 | 标题下紧跟描述 textarea | Description textarea | 描述编辑器 | 归入「任务信息」，标题下紧跟（huahuastudy 位置） |
| subject | 枚举 chinese/math/english/olympiad/pet | 家长自由文本 | —（labels 承担） | — | 保留受控 Select（我们是有枚举的）；归入「任务信息」 |
| priority | Int 0-10（0 普通） | 高/普通/低 select | Priority select（dot 色） | Priority popover | 归入「任务设置」，保持三档（PRIORITY_OPTIONS） |
| startAt | datetime-local 可空 | datetime-local（+结束时间成组） | —（Task 无 startAt） | — | 归入「时间安排」；**Schedule 时间格预填** |
| dueDate | date 可空 | date（+预计用时成组） | **Date Popover + Clear** | Date Popover（Calendar single） | 归入「时间安排」；保留 `type="date"`（原生即可，不引新库；Popover 升级列为可选） |
| rewardProfile | 受控下拉（GET /reward-profiles 16 档分组） | 模板带奖励快照 | — | — | 归入「任务设置」，保留现有分组下拉（我们独有，最有产品感） |
| requiresApproval | bool | needs_parent_confirm checkbox | — | — | 归入「完成确认」 |
| reviewerId | 勾选后必填（现为 uuid 文本输入） | —（后端默认） | — | — | 归入「完成确认」；**无成员列表 API（Family 管理不在本期）→ 保留文本输入**，不改模型 |
| childId | 家长创建时填孩子 uuid | 家长按孩子维度 | assignees 选择 | assignee popover | 保持现状（无孩子列表 API；孩子账号自动归属自己） |

**分组方向（用户建议，采纳）**：

```
任务信息   标题 * / 描述 / 学科
时间安排   开始时间 / 截止日期
任务设置   优先级 / 奖励档位
完成确认   需要人工确认（勾选后出现审核人）
```

**明确不新增**：标签、重复任务、提醒、预计时长、endAt、附件、AI、OCR、子任务（严格限制清单）。

## 5. Task Create 交互对比

| 维度 | TaskLabs | Kaneo | huahuastudy | 我们采用 |
|---|---|---|---|---|
| 形态 | **Sheet 侧滑**（创建/编辑二合一，`task===null` 即创建） | 大 Dialog + 属性区折叠（Accordion） | 独立整页/页内嵌表单 | **Pixel Task Create Sheet**（移动端全屏 Sheet、桌面 Dialog；二合一） |
| 创建/编辑复用 | identity keyed **渲染期重置** + `isDirty` 保存态（Saved/Save changes） | 创建弹窗 + 详情编辑 | 同一 TaskForm（initial 区分） | 复用 TaskLabs：identity 重置 + isDirty（儿童文案：创建中…/已保存/保存更改） |
| 字段组织 | 纵向堆叠无分组 | 属性 Accordion 折叠 + 每属性独立 Popover | 自然分组（任务要求/日程安排） | **4 分组**（任务信息/时间安排/任务设置/完成确认） |
| 日期选择 | Popover + Calendar + Clear | Popover + Calendar | datetime-local / date | 保留原生 datetime-local / date（不引新库；**可选**后续做像素 Popover） |
| 快速添加 | TaskQuickAdd（自然语言） | 列表行内快速创建 | — | 任务列表【+ 添加任务】行 → 打开同一 Sheet（**不做自然语言解析**） |
| 保存反馈 | Saving…/Saved/Save changes + dirty 高亮 | 提交中 spinner | 提交中 | 标题为空禁用 + 提交中/已保存（儿童友好） |
| 编辑来源 | Sheet 打开即编辑 | 详情页属性行内编辑 | 详情页表单 | 从 TaskDetail「编辑」打开同一 Sheet |

## 6. 最终 Task Create 方案

**组件**：`components/task-create/task-create-sheet.tsx`（统一 Pixel Sheet/Dialog，创建/编辑二合一）。

- **底座**：新建 `components/ui/sheet.tsx`（Radix Dialog 像素化；`@radix-ui/react-dialog` 已是依赖，不新增库）。移动端全屏、桌面居中弹窗（宽 ≤480px 像素面板）。
- **打开方式**（全部走同一组件）：
  - Today【新建任务】/【+ 添加任务】→ `open`，`task=null`
  - Schedule【新建任务】→ `open`，`task=null`
  - Schedule 时间格点击 → `open`，`task=null`，**预填 startAt = selectedDate + 点击时刻**（如 10/6 19:00）
  - TaskDetail【编辑】→ `open`，`task=task`（编辑模式）
  - 路由 `/tasks/new`、`/tasks/:id/edit` → 渲染同一 Sheet（兼容直达）
- **表单**：复用现有 `TaskFormPage` 的 RHF + zod `formSchema`（抽到共享模块 `lib/task-form-schema.ts`），按 4 分组重排 DOM。
- **默认值**：开始时间空（或预填）；截止日期默认今天（huahuastudy 惯例：新建默认今天，可改）；优先级普通；奖励空=自定义档；需确认=false。
- **保存**：标题必填（空禁用）；提交后刷新任务列表/今日/日程（invalidate `['tasks']`）；成功后关闭 Sheet；编辑模式 isDirty（Saved/Save changes）。
- **严格边界**：不新增字段、不加 endAt、不猜结束时间、不引入模板/标签/提醒。

## 7. 最终 Schedule 方案

```
日程页
├── 日期条（WeekDateNav 像素版：7 日格 · 星期+数字 · 今天橙点 · 选中浅底+橙短线
│        · 拖动/滚轮/点击三套交互 · 「今天」快捷）
│        → 状态 selectedDate（默认今天）
├── 【新建任务】按钮（日期条右侧，accent 像素按钮）
├── 两日时间轴（TwoDayGrid 改造）
│   ├── day1 = selectedDate（selectedDate==今天 → 标「今天」；否则标「M月D日 周X」）
│   ├── day2 = selectedDate+1（==明天 → 标「明天」；否则标日期）
│   ├── 左 gutter 时间刻度 07:30–21:30（不变）
│   ├── Task：startAt 落在 day1/day2 → 24px 虚线 Chip（规则不变：不推测时长、dueDate 不定位、无 endAt）
│   ├── Event：P4 预留插槽（不变，无数据不渲染）
│   └── 当前时间线：仅当 day1==真实今天才显示（改造为基于 selectedDate 判断）
├── 时间格点击（可选增强）：点 day1/day2 某时刻 → 打开 TaskCreateSheet 预填 startAt
└── 未安排提示行（不变：「今日还有 N 个任务未安排时间 · 去「今日」查看」）
```

- **核心变更**：TwoDayGrid 由「写死今天/明天」改为 **`baseDate` 驱动**（`props.baseDate`，替代 `props.today`）；列标题与当前时间线按 `baseDate`/真实今天 判断。
- 数据过滤：`startAt` 落在 `selectedDate` / `selectedDate+1` 的任务（含 completed，完成态划线）。
- 日期条与时间轴首列对齐（日期条左侧留 3.5rem 空位）。

## 8. 需要修改的文件

**新增（5）**

| 文件 | 内容 |
|---|---|
| `apps/web/src/components/ui/sheet.tsx` | Radix Dialog 像素 Sheet/Dialog 底座（移动端全屏/桌面弹窗） |
| `apps/web/src/components/schedule/week-date-nav.tsx` | 像素日期条（结构/交互参考 huahuastudy WeekDateNav，自研） |
| `apps/web/src/components/task-create/task-create-sheet.tsx` | **统一 Task Create Sheet**（创建/编辑二合一；4 分组；identity 重置 + isDirty） |
| `apps/web/src/lib/task-form-schema.ts` | 从 TaskFormPage 抽取共享 zod schema + 类型 |
| `apps/web/src/components/task-create/quick-add-row.tsx`（或并入 Sheet 调用） | 任务列表「+ 添加任务」快速行 |

**修改（5）**

| 文件 | 改动 |
|---|---|
| `apps/web/src/pages/SchedulePage.tsx` | 加日期条（selectedDate 状态）+【新建任务】按钮 + 时间格点击 → Sheet + TwoDayGrid 改 baseDate 驱动 |
| `apps/web/src/components/schedule/two-day-grid.tsx` | `today` prop → `baseDate`；列标签「今天/明天/日期」逻辑；新增 `onSlotClick(date, minute)` prop；当前时间线仅 day1==今天 |
| `apps/web/src/pages/TodayPage.tsx` | 顶部【新建任务】按钮 + 任务列表【+ 添加任务】行（打开同一 Sheet） |
| `apps/web/src/pages/TaskFormPage.tsx` | 独立整页 → 薄容器（渲染 TaskCreateSheet；保留 /tasks/new、/tasks/:id/edit 路由兼容） |
| `apps/web/src/App.tsx` | `/tasks/new`、`/tasks/:id/edit` 指向 Sheet 容器（其余路由不变） |

**不动**：Task 模型/Prisma/API、TaskDetailPage、SubmitCompletePage、底部导航（保持 今日｜日程）、第三方日历库、任何后端。

---

> 待确认点（写码前）：① 时间格点击创建是否本轮实现（还是仅保留【新建任务】按钮）？② 截止日期默认今天是否采纳（huahuastudy 惯例）？③ 「+ 添加任务」快速行放任务列表底部还是顶部？④ 日期条默认今天、支持左右滑动到任意周（无边界），确认无日期范围限制。

---

## 9. 实现确认与落地记录（2026-10-05，4 项确认后已实现）

**确认**：
1. 时间格点击创建 ✅ 本轮实现（点空白时间格 → TaskCreateSheet 预填 startAt=日期+时刻；点已有 Task → 进详情，不触发创建；不推测 endAt）
2. 新建任务 dueDate 统一默认今天 ✅（不随 Schedule 选中日期变化）
3. 「＋ 添加任务」✅ Today 顶部【＋ 新建任务】+ 列表底部【＋ 添加任务】，同一 Sheet；不给每个 TaskCard 加按钮
4. 日期条无边界左右滑动 ✅（唯一 selectedDate；下方 selectedDate + nextDate）

**落地文件**：
- 新增：`ui/sheet.tsx`、`schedule/week-date-nav.tsx`、`task-create/task-create-sheet.tsx`、`task-create/quick-add-row.tsx`、`lib/task-form-schema.ts`
- 修改：`pages/SchedulePage.tsx`（日期条+新建+时间格）、`components/schedule/two-day-grid.tsx`（标签=今天/明天/日期、onSlotClick、时间线仅真实今天列）、`schedule-chip.tsx`（data-schedule-chip）、`pages/TodayPage.tsx`（双入口）、`pages/TaskFormPage.tsx`（整页→Sheet 容器；/tasks/new、/tasks/:id/edit 路由不变）
- 不改：Task 模型/Prisma/API、Event 模型、第三方日历库、底部导航

**顺带修正**：编辑模式开始时间预填改用本地时间（原 `toISOString().slice(0,16)` 会把 UTC 时刻当本地显示，东八区差 8 小时）。

**验证**：`pnpm typecheck` ✓ · `pnpm build` ✓ · dev server 各模块 transform 200 ✓

---

## 10. Task 字段扩展记录（2026-10-05，用户拍板：对齐 huahuastudy 产品感）

用户指出「新建任务字段与 huahuastudy 不同（颜色/完成时间/是否重复）」后，经确认（AskUserQuestion）**全部实现 4 个新字段**。此决定**推翻**了 §4/§6 中"不新增 endAt/预计时长/重复"及此前"不因 Calendar 加 endAt"的结论——以本节为准。

**模型（迁移 `20261005150000_task_schedule_fields`，已应用）**：

| 字段 | 类型 | 语义 |
|---|---|---|
| `color` | VARCHAR(16) 可空 | 8 预设色（huahuastudy 同源色板：`#e38628/#4a9e6b/#3b82f6/#8b5cf6/#e05c5c/#f5c542/#2aa79e/#7a6752`） |
| `estimated_minutes` | SMALLINT 可空 | 预计用时（分钟，仅展示，不参与日程定位） |
| `end_at` | TIMESTAMPTZ(6) 可空 | 结束时间；有 startAt+endAt → 时段虚线块 |
| `repeat_weekdays` | SMALLINT 可空 | 周重复位掩码 bit0=周一…bit6=周日；0/空=不重复（仅日程展示层展开） |

**API/DTO**：TaskDto + Create/Update 请求加 4 字段；`endAt<=startAt` → 400（`invalid_range`）；DTO 校验 estimatedMinutes∈[1,1440]、repeatWeekdays∈[0,127]、color≤16。

**表单（TaskCreateSheet 4 分组内）**：
- 时间安排：开始时间 + **结束时间** + **预计用时（分钟）** + 截止日期
- 任务设置：优先级 + 奖励档位 + **颜色（8 色块，点击选中/取消）** + **重复（默认不重复；勾选周一~日，位掩码切换）**

**日程渲染（two-day-grid）**：
- 有 startAt+endAt → **时段虚线块**（top=startAt、height=时长×HOUR_PX，clamp 窗口内）；仅 startAt → 24px 点块
- 周重复：`taskAppliesToDay`（startAt 当天 或 repeatWeekdays 命中星期且 ≥ startAt 日期）→ 投影；重复不复制任务实例，完成/审批状态机不变
- 色点：Task 虚线块 + TaskCard 显示 color 小方块

**验证**：typecheck（api/web）✓ · web build ✓ · 冒烟测试（create 4 字段回读 ✓ / update 清空 ✓ / endAt≤startAt→400 ✓，测试用户已清理）· Prisma client 重新生成 + 迁移已应用（PG 列已验证 21 列）。

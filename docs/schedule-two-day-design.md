# 日程页（今天+明天）设计 —— 以 TaskLabs Calendar 为主参考

> 版本：v1.2 · 2026-10-05（**5 个待确认点全部确认，已实现**）
> 性质：已实测运行参考页 + 源码定位 + Two-Day 改造方案 → **已落地**（见 §8 实现记录；本轮严格遵守严格限制清单，未改任何数据模型）
> 前置：用户确认「提供的 Calendar 截图 = TaskLabs 自己的 Calendar 周视图」，TaskLabs Calendar 作为日程页面**主结构参考**；视觉仍用旧 Demo 像素风（huahuastudy 像素视觉参考）。

---

## 1. 预览实测：TaskLabs Calendar 真实页面已运行

- 预览地址：`http://localhost:5175`（Vite dev，mock 数据，TaskLabs 真实组件代码）
- **第 4 区块 = Calendar（周视图）**：24h 时间轴 + 7 日列 + 左侧时间刻度。mock 数据已修正（原全天事件用了 `new Date(now.getDate()+1)` → 1970 年日期，已改为正确的「明天 00:00–23:59」），当前展示：
  - 今天列：19:00–20:00 数学学习（teal 实色块）、20:30–21:00 英语朗读（amber 实色块）、18:00 数学口算练习（虚线 chip）
  - 明天列：00:00–23:59 家庭日全天（violet 实色块）、09:00 英语课文朗读（虚线 chip）
- 已逐一确认所有区块用到的组件模块经 Vite 编译无错（App/calendar-week/calendar-month/task-list 均 200），每区块外有 BlockBoundary，单区块出错不影响整页。

## 2. 源码定位（TaskLabs 文件 → 组件 → 作用 → 我们如何复用/改造）

源码来自 `Temp\osr\tasklabs-preview\src\`（TaskLabs MIT 前端拷贝，next 前缀/convex 已 stub）。

| # | 源码文件 | 组件/导出 | 作用 | 我们如何复用/改造 |
|---|---|---|---|---|
| 1 | `components/calendar/calendar-week.tsx` | `CalendarWeek` | **周视图核心**：`grid-cols-[3.5rem_repeat(7,1fr)]` 表头（EEE+日圆点，今日=primary 实心圆）；左 sticky 时间 gutter（`w-14`，每小时一行 `height:HOUR_PX=56`，标 HH:mm）；`grid-cols-7` 日列各 24 小时格线；事件按 `startAt` 绝对定位 `top=(diffMinutes(start,dayStart)/60)*HOUR_PX`、`height=max(20,(diff/60)*HOUR_PX)`，渲染为 `EventChip variant="event"`；任务按 `dueDate` 定位 `height:24` 渲染 `variant="task"`；今日列 `bg-primary/5` 高亮 | **算法整段移植**：7 列→今天\|明天 2 列；24h→07:30–21:30（见 §5）；表头改自绘像素日期行；其余定位/布局逻辑照搬 |
| 2 | `components/calendar/event-chip.tsx` | `EventChip`（variant: event/task） | **Task/Event 视觉区分核心**：`event`=实色底+白字；`task`=`border-dashed` 透明底+色点（`hueToHex(colorId)`）；`isCompleted`→opacity-60+删除线+✓；`timeLabel`；hover 菜单（编辑/删除/完成切换） | 像素化改造为 `schedule-chip`：硬 2px 边框+硬阴影+无圆角；task=虚线 inkSoft、event=实色 accent/主题色；完成态同语义 |
| 3 | `components/calendar/calendar-day.tsx` | `CalendarDay` | 单日版：HOUR_PX=64；顶部日期头（EEEE/MMMM yyyy+大日圆）；事件 timeLabel 显示 `HH:mm–HH:mm` | Two-Day 每列本质是"日"：表头样式与 `HH:mm–HH:mm` 时间标签可参考；07:30–21:30 下用 56 或更小行高 |
| 4 | `components/calendar/calendar-month.tsx` | `CalendarMonth` | 月视图：事件按 `startAt` 日、任务按 `dueDate` 日分组；EventChip 堆叠（事件最多 3+任务 2 条）+「+N more」；今日圆点 | 本轮不用月格；「按日分组+堆叠上限+more」思路用于 §5「未安排任务区/全天条」溢出处理 |
| 5 | `components/calendar/calendar-header.tsx` | `CalendarHeader` | Month/Week/Day 切换 + ‹› 导航 + Today + 范围标签 | Two-Day 固定两列，无视图切换；可保留日期标签行+前后切换（切「昨天/今天」或本周内滚动，简化） |
| 6 | `lib/calendar/grid.ts` | `utcStartOfWeek/weekDays/monthGridDays/rangeForView` | 周一为起点的 UTC 周区间/月 42 格计算 | 只需"今天/明天"两个 Date：自写 `[startOfDay(today), startOfDay(today)+1]`；不需要 UTC 周逻辑 |
| 7 | `lib/calendar/palette.ts` | `EVENT_HUES`（8 色）+`hueToHex` | 事件颜色 id→hex | 映射到像素主题（accent/ok/theme 色）或保留 8 色表（Event P4 才用，先占位） |
| 8 | `lib/calendar/schedule-constraints.ts` | `applyScheduleConstraints` | 事件起止约束：新事件不得从过去开始；end 必须 > start 否则推后默认 60min | 我们 Task 无 endAt，本轮不适用；**Event P4 建模型时采纳** |
| 9 | `hooks/useNow.ts` + `hooks/useIsHydrated.ts` | `useNow(intervalMs)` | 当前时间，hydration-safe（首帧 null，避免 SSR/CSR 不一致） | 我们是纯 CSR（Vite），无需 hydration 保护：直接 `new Date()`+`setInterval`；用途=今日高亮+可选当前时间线 |
| 10 | `hooks/useEvents.ts` | `CalendarEventDTO`（startAt/endAt/allDay/color/status…） | 事件查询契约 | **Event 模型 P4 再建**；DTO 形状先按此预留，本轮不建 |
| 11 | `hooks/useTasks.ts` / `useTasksInRange` | `TaskDTO` + `useTasksInRange(from,to)` | 任务查询 + 按 dueDate 区间过滤 | 我们改按 `startAt` 过滤「今天/明天」；`dueDate` 是纯日期（见 §4 差异） |
| 12 | （未复制进预览）Next.js `app/calendar/page.tsx` | 页面组合 | 组合 header + 视图组件 + `useEvents/useTasksInRange` 并行查询 + 渲染 | 不需要 Next 层：Vite 路由 `/schedule` 直接组合 `TwoDayGrid` + TanStack Query |

## 3. 关键实证发现（修正此前结论）

1. **TaskLabs CalendarWeek 没有"当前时间竖线"**——只有今日列高亮（`bg-primary/5`）+ 表头实心圆。此前 `docs/p2-ui-ux-review.md §6` 写「TaskLabs CalendarWeek 有当前时间指示」**不准确**，予以修正。
2. **没有全天事件栏**：`allDay` 事件在周/日视图无特殊处理，按 `startAt` 定位渲染成普通块（00:00 起即整列大块）。
3. **没有重叠车道打包**：重叠事件绝对定位直接互相覆盖（DOM 顺序后者在上）；月视图仅切片堆叠+「+N more」。车道算法只有 Kaneo `packWeekLanes`（P5 月视图再考虑）。
4. **TaskLabs 周视图任务=时间点 chip**：任务仅有 dueDate（带时刻），渲染 24px 高虚线 chip，无"任务时段块"概念。
5. **Task/Event 零关联**：tasks 与 calendarEvents 无外键，日历页并行查询混合渲染（实色 vs 虚线）——与本项目 v1.2 决策一致。

## 4. 数据现实对照（我们的模型 ≠ TaskLabs）

| 维度 | TaskLabs | 我们（time 项目） | 影响 |
|---|---|---|---|
| Task 时间字段 | `dueDate`（datetime，带时刻） | `startAt`（timestamptz，可空）+ `dueDate`（`@db.Date` **纯日期，无时刻**）；**无 endAt** | 虚线块锚点只能用 `startAt`；`dueDate` 不能当时间点（会全堆 00:00） |
| Event 实体 | `calendarEvents`（startAt/endAt/allDay/color/status） | **尚无 Event 模型**（schema 注释：P4+ 加入） | 实色块本轮只做布局预留 |
| Task/Event 关联 | 无 | 无 | 一致，无需处理 |

## 5. Two-Day 改造方案（今天 + 明天，07:30–21:30）

### 5.1 布局结构

```
/schedule 日程页（底栏「今日｜日程」）
├── 表头：日期标题行（像素 HUD 风，双层 textShadow）
│     「今天 10月5日 周一」 ｜  「明天 10月6日 周二」（自绘，参考 calendar-day 表头+旧 Demo 像素）
├── 主体：两列时间轴
│     ├── 左 gutter（自定 3rem）：07:30–21:30 每小时刻度（HH:mm，每格 = HOUR_PX 高，像素网格线）
│     ├── 今天列：Task 虚线块（startAt 锚点）＋ Event 实色块（P4 预留）
│     └── 明天列：同上
├── 顶部全天条（P4 预留）：Event.allDay 横向条（跨两列），本阶段仅布局占位
├── 当前时间线（建议做，见 5.4 / §7 #3）
└── 未安排任务提示（待确认，见 §7 #2）
```

- 行高：07:30–21:30 = 14h。`HOUR_PX=56` → 时间轴高 784px（可滚动）；若嫌高用 40 → 560px。开发时按屏幕实测定。
- 两列用 `grid-cols-[3rem_1fr_1fr]`（gutter + 今天 + 明天），列内绝对定位与 TaskLabs 相同。

### 5.2 Task 投影规则（纯展示层，不改模型）

- **虚线块锚点 = `startAt`**（存在时）：`top = ((startAt当日时刻 − 07:30) / 60) × HOUR_PX`；高度**固定 24px**（模型无 endAt，不猜时长）→ 语义=「该任务这个点要做」（TaskLabs 时间点 chip 语义），点击进任务详情。
- **仅 dueDate 或两者皆空** → 不进时间轴（落点待确认：§7 #2，默认轻提示方案）。
- 完成态：`completed` → 虚线块 opacity-60 + 删除线 + ✓（EventChip isCompleted 语义）。
- 今天列 = `startAt` 落在今天；明天列 = `startAt` 落在明天。
- **关于"仅当 startAt+endAt 都存在才投影"**：✅ **已确认（2026-10-05）**——Task 无 endAt 是既定事实：**不因 Calendar 加 endAt、不改 Task 模型**。投影规则定为：有 startAt → 投影为 24px 虚线块（不推测、不生成时长）；无 startAt → 不进时间轴（仍在今日任务列表，不人为分配时间）；dueDate 仅表截止语义，不作为时间轴定位。

### 5.3 Event 预留（P4，见 §7 #5）

- 实色块（按 color）原样移植定位算法：`top`/`height` 用 startAt/endAt；`allDay` → 顶部全天条。
- 本轮 API 无 Event → 仅布局预留，不渲染假数据（沿用 p2-ui-ux-review §6 决定）。

### 5.4 当前时间线（建议做，见 §7 #3）

- TaskLabs 没有；但「现在该干嘛」是儿童日程核心价值。
- **形态（2026-10-06 用户实测反馈后修正）**：由"2px 竖线"改为**横线**——横穿今天列的一条 2px 红线，
  `top = ((now − 07:30)/60) × HOUR_PX`，左端一枚像素小方块作"现在"标记、右端一枚 `HH:mm` 小标签；
  `setInterval` 每分钟刷新，今天列外（或 now 落在 07:30–21:30 之外）隐藏。
  （原设计写的是"竖线"，实现后用户看截图指出"应该是横线"，经确认改为横线。）
- 修正 §3.1 后此线是我们自己的增强，不算抄 TaskLabs。

### 5.5 视觉（旧 Demo 像素，huahuastudy 参考）

| 元素 | 像素化 |
|---|---|
| 背景/面板 | 米黄 `#f2e5c9`、panel 2px 深棕描边、`4px 4px 0 #3a2a1e` 硬阴影 |
| Task 虚线块 | 虚线 `inkSoft` + 色点 + 标题 textShadow；无圆角 |
| Event 实色块 | accent/主题色底 + 白字 + 硬阴影 |
| 表头 | 像素 HUD 风：`textShadow: 2px 2px 0 #2c2015`、tracking-widest |
| 时间刻度 | 小号像素字体，右对齐 |

## 6. 实现清单（**确认后**才开发；本轮 zero 代码改动）

1. 新组件 `apps/web/src/components/schedule/two-day-grid.tsx`（自研，不装库；算法移植自 calendar-week.tsx）
2. 新组件 `apps/web/src/components/schedule/schedule-chip.tsx`（像素化 EventChip：variant task/event）
3. 新页面 `apps/web/src/pages/SchedulePage.tsx` + 路由 `/schedule` 注册
4. 底栏改「今日｜日程」2 格（`AppLayout` nav 调整；删除"任务"tab；`/tasks` 重定向到 `/` 保留兼容）——待确认 §7 #4
5. `lib/api/tasks.ts` 增加今天/明天过滤（前端按 startAt 过滤即可，或加查询参数）
6. **无**后端模型/API/迁移变更（Task 字段、Prisma、Nest 全不动）

## 7. 5 个待确认点（每点：①数据模型事实 ②TaskLabs 实际做法 ③我们约束 ④建议 ⑤是否改模型）

### #1 虚线块锚点 —— ✅ 已确认（2026-10-05）

1. **数据模型事实**：`Task.startAt DateTime?`（timestamptz 可空；TaskForm 用 datetime-local 收集）；`Task.dueDate DateTime? @db.Date`（**纯日期、无时刻**）；**无 endAt**。
2. **TaskLabs 实际做法**：周视图任务用 dueDate（带时刻）定位为 24px 虚线 chip；时段块只属于事件（startAt/endAt）。
3. **我们约束**：dueDate 纯日期无法定位；唯一可定位字段 = startAt；用户明确「不因 Calendar 加 endAt、不改 Task 模型」。
4. **建议（=已确认决策）**：有 startAt → 按 startAt 投影 24px 虚线块（不推测时长）；无 startAt → 不进时间轴、仍在今日任务列表；dueDate 仅表截止语义。
5. **是否改模型**：否。

### #2 未安排任务区 —— 待确认

1. **数据模型事实**：startAt 可空（TaskForm 开始时间为可选）；`GET /tasks` 全量返回；Today 已展示全部非 completed 任务（含无 startAt 的）。
2. **TaskLabs 实际做法**：周视图只渲染 dueDate 在本周的任务；无时间任务在日历**不可见**，由任务列表/看板承载——不把无时间任务硬塞进日历。
3. **我们约束**：review 已定职责分离（日程 = 时间轴安排、今日 = 任务中枢）；日程页若再列无时间任务 → 与 Today 重复展示（正是 review 批评过的"今日/任务重复"问题重演）；但儿童场景下任务"消失"感需要缓解。
4. **建议**：不做独立列表区。日程页底部放一行轻提示：「今日还有 N 个任务未安排时间 · 去「今日」查看」（N = 今日无 startAt 的非 completed 任务数），点击跳转今日。既有缓解作用，又不产生重复列表。
5. **是否改模型**：否。

### #3 当前时间线 —— 待确认

1. **数据模型事实**：无相关字段（纯前端展示）；两列中仅"今天"列有意义（明天列无"现在"）。
2. **TaskLabs 实际做法**：**没有**当前时间竖线（实证修正；仅今日列高亮 `bg-primary/5` + 表头实心圆）。
3. **我们约束**：无技术约束（setInterval 1min + 一次 setState）；产品价值判断——"现在该干嘛"是儿童日程核心价值；07:30–21:30 正好覆盖儿童清醒时段。
4. **建议（已实施，形态经修正）**：做，但为**横线**而非竖线——横穿今天列的一条 2px 红线（左端像素方块 + 右端 `HH:mm` 标签），`top=(now−07:30)/60×HOUR_PX`，每分钟刷新；now 在区间外不显示。作为我们自己的增强，不归功于 TaskLabs。
5. **是否改模型**：否。

### #4 底栏改 2 格（今日｜日程）—— 待确认

1. **数据模型事实**：无（纯路由/导航）；当前 AppLayout nav = 今日\|任务\|成长(disabled)；路由 `/tasks` 存在；无 `/schedule`。
2. **TaskLabs 实际做法**：左侧 sidebar 导航（非底栏），参考其结构/实现而非导航；旧 Demo（huahuastudy）底栏 = 今日\|日程\|记录（**无任务 tab**）——我们无"记录"，故 2 格。
3. **我们约束**：review §2/§9 已定「今日｜日程」2 格、删任务 tab、`/tasks` 重定向兼容；完整落地牵涉 Today 重构（新建任务入口收拢），范围大于日程页本身。
4. **建议**：日程页开发**同一轮**改（否则日程页无入口）。范围控制：本轮只改 nav 2 格 + `/tasks → /` 重定向 + 新建任务入口保持在 Today（Task Create 重构另轮）。
5. **是否改模型**：否。

### #5 全天条 / Event 实色块（P4 前如何预留）—— 待确认

1. **数据模型事实**：**无 Event 模型**（schema 注释：Event 业务模块 P4+ 加入）；Task 无 endAt；API 无事件数据。
2. **TaskLabs 实际做法**：allDay 事件**无特殊渲染**（按 startAt 定位的普通块，00:00 起整列块）；周视图无"全天条"概念（实证修正）。
3. **我们约束**：review 已定"Event 预留、不渲染假数据"；本轮焦点是 Task 虚线块落地。
4. **建议**：本轮**不做全天条、不渲染 Event 块**。但 TwoDayGrid 预留 `events?: ScheduleEvent[]` prop + 实色块渲染路径（schedule-chip `variant="event"` 像素样式先实现），无数据即不渲染；P4 Event 建模后仅接数据、组件不重构。全天条不做（TaskLabs 没有；我们暂无 allDay 概念，Event 建模时再定）。
5. **是否改模型**：否（P4 建 Event 模型时再定）。

---

## 8. 实现记录（2026-10-05，5 项确认后落地）

**新增（5 文件）**
- `apps/web/src/lib/schedule.ts` — 时间轴常量与纯函数（07:30–21:30、HOUR_PX=56、top 定位、日期判断；只用原生 Date）
- `apps/web/src/components/schedule/schedule-chip.tsx` — 像素 ScheduleChip（task 虚线 / event 实色，P4 预留 variant）
- `apps/web/src/components/schedule/current-time-line.tsx` — 独立可复用 CurrentTimeLine（每分钟刷新、区间外隐藏、仅今天列）
- `apps/web/src/components/schedule/two-day-grid.tsx` — 主体网格（日期 Header + 左时间刻度 + 今天\|明天两列 + Task 虚线块 + `events?: ScheduleEvent[]` 预留插槽）
- `apps/web/src/pages/SchedulePage.tsx` — 真实 API 数据（`tasksApi.list()`）；未安排 N = `startAt=null && status≠completed`；底部一行提示

**修改（2 文件）**
- `apps/web/src/components/layout/app-layout.tsx` — 底栏改「今日｜日程」2 格（删除任务 tab；不新增其他 tab）
- `apps/web/src/App.tsx` — 新增 `/schedule` 路由；`/tasks` → `/` 重定向（子路由 `/tasks/new|:id|:id/edit|:id/submit` 保留兼容）

**行为说明**
- 有 startAt 的任务按 startAt 投影 24px 虚线块（不推测时长）；completed 半透明+删除线+✓
- startAt 在当天但时刻超出 07:30–21:30 的任务 clamp 到可视区边缘（保证不消失，时间标签仍显示真实时刻）
- 无 startAt 任务不进时间轴，仅计 N 显示提示行（不渲染第二套任务列表）
- Event 实色块渲染路径已实现但 events 为空（当前无 Event 模型/API）→ 不渲染；P4 接入数据即用
- 未引入任何第三方时间/日历库

**验证**：`pnpm typecheck` ✓ · `pnpm build`（tsc+vite）✓ · dev server 各新模块 transform 200 ✓
**开源登记**：TaskLabs calendar-week 算法移植已登记 `docs/opensource-mapping.md §一`

---

> 源码归属：TaskLabs（MIT）算法移植已登记进 `docs/opensource-mapping.md`（§一 新增 schedule 行）；样式沿用旧 Demo 像素主题（huahuastudy 仅视觉参考）。

---

## 9. 字段扩展修订（2026-10-05）

用户拍板对齐 huahuastudy 产品感，Task 新增 4 字段（迁移 `20261005150000_task_schedule_fields` 已应用）：`color`（8 预设色）、`estimated_minutes`（预计用时，仅展示）、`end_at`、`repeat_weekdays`（周重复位掩码）。**本修订推翻 §5.2「无 endAt、固定 24px」规则**：

- Task 有 `startAt+endAt` → **时段虚线块**（top=startAt、height=时长）；仅 startAt → 仍 24px 点块
- Task 周重复（repeatWeekdays 命中星期且 ≥ startAt 日期）→ 该天投影；不复制实例、状态机不变
- 色点：虚线块与 TaskCard 显示 color 小方块
- 未安排提示（§7 #2）等其余规则不变

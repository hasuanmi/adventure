# P2 UI/UX Review

> 版本：v1.0 · 2026-10-05
> 性质：**调研 + 对照 + 设计调整建议**（本轮不写代码、不改模型/API/路由，不装新库）
> 参考：原 Demo（`huahuastudy/apps/web/src/pages/proto-kid-v2.tsx`，截图 `huahuastudy/.screenshots/proto-kid-v2-demo.png`——本模型无法直接读图，已按 Demo 源码等价分析）+ 本地源码级开源参考（TaskLabs/Kaneo/StaffScheduler/WorkPulse/react-calendar）+ 旧项目 TwoDayView。

> **修正记录（2026-10-05）**：本文档此前对 TaskLabs Calendar 的三处能力描述不准确，现已全部纠正，**不再作为 TaskLabs 能力描述**（详证见 `docs/schedule-two-day-design.md §3`，已实测 TaskLabs 前端源码）：
> 1. ❌ "有当前时间竖线" → ✅ 无（源码仅有今日列高亮 `bg-primary/5` + 表头实心圆）
> 2. ❌ "有全天事件栏" → ✅ 无（allDay 事件按 startAt 渲染为普通块，00:00 起整列块）
> 3. ❌ "有重叠事件车道算法" → ✅ 无（重叠事件绝对定位直接覆盖；车道打包 `packWeekLanes` 是 **Kaneo** 的能力，P5 月视图参考）

---

## 1. 当前问题

| # | 问题 | 证据 |
|---|---|---|
| 1 | **"今日"与"任务"重复**：登录后 Today 与 Task List 展示内容基本一致（都是任务列表），信息架构冗余 | `pages/TodayPage.tsx` 与 `pages/TaskListPage.tsx` 均查 `GET /tasks`；底栏「今日｜任务」 |
| 2 | **与产品 Demo 信息架构不符**：Demo 底部导航为「今日｜日程｜记录」，**没有"任务"tab**；当前是「今日｜任务｜成长(占位)」 | `proto-kid-v2.tsx` 底部 `['今日','日程','记录']` |
| 3 | **Today 任务形态单薄**：当前 Today 用不可展开 TaskCard（emoji 图标+状态+截止）；Demo 是**可展开任务面板**（像素 tile 图标、每任务 PixelBar 进度、完成标准、行内"开始/暂停/完成✓/待家长检查"按钮、展开态 accent 底+角饰） | `proto-kid-v2.tsx` TASKS.map 展开块 |
| 4 | **新建任务页面单薄**：独立整页、字段线性堆叠；缺少成熟产品常见的入口/组织/属性编辑方式 | `pages/TaskFormPage.tsx` |
| 5 | **无日程/时间轴呈现**：产品方向（Demo 底栏"日程"）未落地；Task 有 startAt/endAt 但 Today/详情未以时间轴表达 | `pages/*` 无时间轴组件 |
| 6 | HUD 缺失 Demo 元素：无像素 tile 角饰、无"今日完成 x/y"摘要行 | 对比 `proto-kid-v2.tsx` HUD |

## 2. 原 Demo 对照（为什么当前页面不像）

| 维度 | 原 Demo（proto-kid-v2） | 当前实现 | 差异 | 建议恢复 |
|---|---|---|---|---|
| 信息架构 | 底栏「今日｜日程｜记录」，无任务 tab；今日=任务中枢 | 底栏「今日｜任务｜成长(占位)」 | 任务 tab 造成 Today/Task 重复 | **底栏改「今日｜日程」**；任务并入今日 |
| Layout | 单栏 max-w-md 连续面板流：HUD→今日任务→本周打卡→底栏 | HUD→内容→底栏；TaskList 独立页 | 多一层导航层级 | Today 恢复"面板流" |
| Component | 任务=可展开 Panel（3px 描边+硬阴影+角饰 tile；展开：进度 PixelBar+完成标准+行内按钮） | 任务=不可展开 TaskCard（跳详情页） | 交互与信息密度差异大 | **TaskCard→可展开任务面板**（含进度/完成标准/行内操作） |
| Typography | 标题双层 textShadow、tracking-widest、状态标签 color mark（●/▶/✓/★） | HUD 有 textShadow，卡片标题无 | 标题质感弱 | 标题/状态标签加像素 textShadow 与 mark |
| Spacing | 面板 p-3、space-y-3、周打卡 7 列网格 | 卡片 p-3、space-y-3 | 接近 | 补齐周打卡像素格 |
| Navigation | 激活项 accent 底色+底阴影；3 格 | 激活项 accent；3 格（含禁用） | 接近 | 改 2 格「今日｜日程」 |
| Interaction | 任务展开/收起（默认首个展开）、"查看空状态"切换、空态文案"去日历看看明天的计划吧" | 卡片仅链接详情 | 缺展开/空态引导 | 恢复展开交互 + 空态引导 |

## 3. 信息架构调整

**当前：**

```
今日（任务列表）  任务（任务列表）  成长（占位禁用）
```

**调整为：**

```
底部导航：今日 ｜ 日程

今日
├── HUD（标题 + 日期 + 今日完成 x/y）
├── 今日任务（核心）
│   ├── 状态筛选 tab（全部/待开始/进行中/已完成/已退回）
│   ├── 可展开任务面板（进度/完成标准/行内操作）
│   ├── 新建任务（顶部按钮 + 快速添加入口）
│   └── 点击展开面板头部 → 任务详情
├── 待审批提示（仅审核人：GET /approvals?as=reviewer&status=pending）
└── 本周打卡（像素格，若本周有记录）

日程（新增）
├── 今天 + 明天 时间轴（07:30–21:30）
├── Task 投影（虚线块，点击进任务详情）
└── Event（实色块，模型已定义；API 未建，本阶段仅布局预留）
```

- **Task 如何进入 Today**：任务列表/新建/详情入口全部收拢到 Today；「任务」不再作为独立导航。Task Detail、Submit Complete 保持独立路由（由 Today 进入）。
- 成长/记录等后续阶段再考虑是否增加导航（不在本期）。

## 4. Task Create 调研（源码级）

| 项目 | 创建方式 | 源码/组件 | 可借鉴 | 不能照搬 |
|---|---|---|---|---|
| **TaskLabs**（MIT） | **Sheet 侧滑创建/编辑二合一** + 列表页快捷添加 | `components/tasks/task-side-panel.tsx`（@104，task===null 即创建）、`task-quick-add.tsx`（自然语言快速添加）、`components/ui/form.tsx`（RHF+zodResolver） | ①创建/编辑同组件（二合一）；②RHF+zod 校验；③"rendering-time state reset + 脏检查"（@134-167）；④保存三态（saving/Saved/Save changes） | Next/Convex 数据层；kanban/workspace 概念 |
| **Kaneo**（MIT） | 大 Dialog 创建 + **属性行内 Popover 单独编辑** | `components/shared/modals/create-task-modal.tsx`、`components/task/task-properties-sidebar.tsx`、`task-status-popover.tsx` 等 | ①每次只改一个属性（降低认知负担）；②创建 Dialog 集中表单+提交后关闭；③删除用 AlertDialog | Base UI 自研组件体系；workflow 列概念 |
| **StaffScheduler**（MIT） | 非任务管理产品；决策/意见表单可借鉴 | `frontend/src/pages/Approvals/DecisionModal.tsx` | 表单必填校验 + 提交中 spinner | 轮班业务 |
| **huahuastudy task-form**（视觉参考） | 独立页/页内内联 + 标题模板 Combobox + 8 色选择 + 时间 datetime-local | `components/task-form.tsx`（@155 模板 Combobox、@359 颜色圆点、@285 日程时长提示） | ①模板 Combobox（选模板带奖励）；②颜色选择器；③日程时长提示 | 旧状态/RRULE/拆分等超范围字段 |

**结论（Task Create 怎么改）**：
1. **入口**：Today 顶部「新建任务」按钮 + 列表内"快速添加"行（标题即建，Kaneo/TaskLabs 模式）。
2. **形态**：移动端**全屏 Sheet（二合一创建/编辑）**，替代独立整页（TaskLabs TaskSidePanel 模式）；桌面可保持弹窗。
3. **字段组织**：分组（基础信息 / 时间 / 奖励档 / 人工确认），一次一屏；日期时间用 Popover 选择（Kaneo）；奖励档保留 API 下拉分组。
4. **减负**：默认值（优先级普通、奖励空=自定义），"需要人工确认"勾选后才出现审核人字段。

## 5. Calendar / Schedule 开源项目调研（源码级优先）

| 项目 | GitHub/License | 技术栈 | 相关页面/组件（已读源码） | 可借鉴 | 不能照搬 | 复用判定 |
|---|---|---|---|---|---|---|
| **TaskLabs** | usekaneo? 否：`tasklabs`（MIT，本地 osr） | Next.js+Convex+React+shadcn | `frontend/components/calendar/calendar-month.tsx`（按天分组+EventChip 实色块+任务虚线 chip+"+N more"）、`calendar-week.tsx`（24h 时间轴 HOUR_PX=56，按 startAt 定位 top/height）、`event-chip.tsx`（完成划线/右键菜单）、`event-modal.tsx`（创建/编辑）、`frontend/lib/calendar/grid.ts`（rangeForView 月 42 格/周/日区间） | ①周视图时间轴定位算法（top=startAt/小时*HOUR_PX）；②**Task+Event 并行渲染+视觉区分（实色 vs 虚线）**；③日期区间前端计算；④事件创建 modal | Convex 数据层；workspace 模型 | **参考（算法可移植）** |
| **huahuastudy TwoDayView**（自有，视觉参考） | — | React+react-calendar(`@ascentsparksoftware/react-calendar`，MIT) | `components/two-day-view.tsx`：**固定 2 列（viewDate+1）、07:30–21:30、左侧 3.5rem 时间轴、自绘日期表头（星期+月+日）、像素 token 桥接**；`pages/schedule-page.tsx`、`pages/kid-calendar.tsx`（周视图） | ①**今天+明天两列时间轴**（正是产品方向）；②像素主题桥接写法；③自绘表头 | 库依赖需重新确认 | **参考（布局可直接复刻为自研组件）** |
| **react-calendar**（`ascentsparksoftware`） | GitHub（MIT，本地已有副本） | React+TS+date-fns 适配 | `CalTimeGridView`（时间格，days/columns/anchorToWeek）、`CalMonthGridView`、DayList 等——旧项目已生产使用并做了像素桥接 | 成熟的时间格/月格原语，已验证 | 引入需本轮外确认（用户要求不装新库） | **待确认（可考虑直接复用）** |
| **Kaneo**（MIT，本地 osr） | usekaneo/kaneo | React+Base UI+TanStack | `apps/web/src/components/calendar/month-grid-model.ts`（buildMonthWeeks/packWeekLanes 车道打包）、`calendar-task-bar.tsx`（跨周连续、overflow "+N more"） | 月视图车道布局算法（P5 月视图用） | 无 Event 实体；仅月视图 | **参考（算法移植，P5）** |
| **WorkPulse**（MIT，本地 osr） | digantv/workpulse-saas | React+Tailwind | `frontend/src/pages/DashboardPage.jsx`（今日状态+StatCard）、`TimesheetPage.jsx`（月/区间列表+统计卡） | 打卡今日状态卡、历史列表模式 | 非日程产品 | 局部参考 |
| react-timeline-scheduler | JonasKenke（**待确认 License**） | React | 未读源码（web 检索） | 时间轴/日历双视图（仅方向） | 未验证 | 待确认 |
| ilamy-calendar | GitHub（README 称 MIT，**待确认**） | React | 未读源码（web 检索） | 可定制日历（仅方向） | 未验证 | 待确认 |
| FullCalendar | fullcalendar（标准包 MIT） | React/vanilla | 已知（未新读） | 成熟月/周/日视图；Premium AGPL 禁用 | D-R1 曾定但旧项目已弃用 | 不引入（react-calendar 已占位） |

> 说明：web 补充项均标注"待确认"，未虚构源码；真正源码级参考 = TaskLabs / huahuastudy TwoDayView / react-calendar / Kaneo / WorkPulse。

## 6. 日程页面建议（今天 + 明天）

- **布局**：顶部日期标题行（「今天 10月5日 周一」/「明天 10月6日 周二」，参考 TwoDayView 自绘表头）；下方**固定 07:30–21:30 两列时间轴**（左 gutter 时间刻度）。
- **Task 投影**：有 `startAt/endAt` 的任务以**虚线块**显示在时间轴（TaskLabs dashed chip 语义），点击进任务详情；`dueDate` 任务可显示为当日"截止"标签（仅展示层投影，不改模型）。
- **Event 预留**：`allDay` 区（顶部全天条）+ 时间段**实色块**（按 color），本阶段 API 未建 → 仅布局预留，不渲染假数据。
- **当前时间线**：红/高亮**横线**标"现在"（左端像素方块 + 右端 `HH:mm` 标签；2026-10-06 由竖线改为横线，用户实测反馈）。**修正（2026-10-05）：TaskLabs CalendarWeek 实际没有当前时间指示**（源码仅今日列高亮 + 表头实心圆），此线是我们自己的增强——详见 `docs/schedule-two-day-design.md §3`。
- **视觉**：像素桥接（Panel/ink 描边/硬阴影）；Task 虚线=inkSoft、Event 实色=color。
- **实现建议**：优先考虑"直接复用 react-calendar CalTimeGridView + 旧项目像素桥接"（MIT、已验证）或按 TaskLabs 算法自研；**本轮不安装，待确认**。

## 7. Task + Event 关系（为什么是两个概念，UI 如何表达）

**概念区分**：
- Task = "我要完成什么"（有状态机：pending→in_progress→completed/returned；可审批、可奖励）
- Event = "我什么时候要做什么"（时间块，无完成状态机，独立实体）

**开源实证**：
- **TaskLabs**：`tasks` 与 `calendarEvents` **零关联**（无外键），日历页**并行查询 + 混合渲染**：事件=实色块（EventChip）、任务=虚线 chip（calendar-month.tsx）——这是 B 模式的成熟实现。
- v1.2 已确认采用 TaskLabs 模式（Event 零关联）。

**结论（A/B/C/D 选择）**：
- **A 完全分开**：否（产品希望一个日程视图看全天安排）。
- **B 日程页同时展示 Task + Event（视觉区分）**：**是**——TaskLabs 模式，虚线 vs 实色。
- **C Task 可以进入日程**：**部分允许**——仅**展示层投影**（有 startAt/endAt 的任务出现在时间轴），点击进任务详情；不改模型、不建关联。
- **D Task 与 Event 关联**：**否**（v1.2 零关联；TaskLabs 实证无需关联即可并行呈现）。

## 8. 最终 P2 页面结构（建议）

```
底部导航：今日 ｜ 日程（2 格）

今日 /
├── HUD：标题 + 日期 + 今日完成 x/y（+待审批角标）
├── 今日任务
│   ├── 状态筛选 tab（全部/待开始/进行中/已完成/已退回）
│   ├── 任务面板列表（可展开：进度 PixelBar + 完成标准 + 行内 开始/暂停/完成）
│   ├── 「新建任务」按钮 + 快速添加行
│   └── 空态：像素 tile + "今天没有安排，去日程看看明天的计划"
├── 待审批提示（审核人可见，链接到对应任务详情）
└── 本周打卡（像素格，可选）

任务详情 /tasks/:id（保持）
任务创建-编辑 /tasks/new（改为 Today 内 Sheet；路由可保留）
提交完成 /tasks/:id/submit（保持）
日程 /schedule（新增：今天+明天时间轴）
登录 /login（保持）
```

## 9. 当前 P2 开发调整建议

| 页面/模块 | 处理 | 说明 |
|---|---|---|
| 底部导航 | **改** | 「今日｜任务｜成长(占位)」→「今日｜日程」；成长等后续阶段再加入 |
| Today | **重新设计（Demo 对齐）** | 可展开任务面板、每任务进度/完成标准/行内操作、HUD 完成摘要、新建入口、待审批提示 |
| Task List | **删除独立页** | 语义并入 Today（状态筛选 tab）；`/tasks` 路由可重定向到 `/` 或保留为兼容别名 |
| Task Detail / Submit | **保留** | 由 Today 展开面板进入 |
| Task Create/Edit | **重构入口与形态** | 独立整页→移动端 Sheet（二合一）；字段分组；日期 Popover；快速添加 |
| 日程 | **新增（下一阶段）** | 今天+明天时间轴；Task 投影+Event 预留 |
| TaskCard | **升级为可展开面板** | 对齐 Demo：tile/进度/完成标准/行内操作/角饰 |
| 成长 | 暂缓 | 本阶段不做导航与页面 |

---

## 附：10 项结论（先行回答）

1. **"任务"底部导航应删除**：是——Demo 底栏本无任务 tab，今日即任务中枢。
2. **今日应直接支持新建任务**：是——顶部按钮 + 快速添加行。
3. **当前新建任务为什么不好**：独立整页、字段线性堆叠、无分组/无 Popover 日期/无快速入口、视觉单薄（对比 Kaneo/TaskLabs 弹窗+属性分组+快速添加）。
4. **Task Create 真正值得参考**：TaskLabs（Sheet 二合一+RHF+zod+快速添加）、Kaneo（弹窗+属性 Popover）、huahuastudy task-form（模板/颜色选择，视觉参考）。
5. **Calendar/Schedule 真正值得参考**：TaskLabs（周视图时间轴+Task/Event 并行+区间计算）、huahuastudy TwoDayView（今天+明天两列时间轴+像素桥接，直接复刻布局）、react-calendar（MIT 时间格原语，可考虑直接复用，待确认）、Kaneo（月视图车道，P5）。
6. **日程底部导航应加入**：是——产品方向与 Demo 底栏一致。
7. **日程页如何展示今天+明天**：两列固定时间轴 07:30–21:30 + 顶部日期标题行 + 当前时间线 + 全天条。
8. **Task/Event 在日程如何共存**：并行渲染+视觉区分（Task 虚线/Event 实色，TaskLabs 模式）；Task 仅展示层投影；不做关联。
9. **原 Demo 应恢复什么**：可展开任务面板+每任务进度/完成标准/行内操作、HUD 今日完成 x/y、周打卡、底栏 今日|日程、空态"去日程看明天"文案、像素 tile 角饰。
10. **P2 下一阶段开发顺序**：①底栏改 2 格 + 删除任务 tab；②Today 重构（Demo 对齐，含新建入口）；③TaskCard→可展开面板；④新建任务改 Sheet+字段分组；⑤日程页（今天+明天时间轴，Task 投影）；⑥Task 详情/提交微调。

> 说明：原 Demo 截图因当前模型无法读图，已用 Demo 源码（proto-kid-v2.tsx）等价分析；如需我逐像素对照截图，请在后续对话中提供描述或换支持读图的模型。

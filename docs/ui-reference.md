# UI 参考规范（UI Reference）

> 版本：v1.0 · 2026-10-05
> 性质：旧项目 `C:\Users\48489\Desktop\huahuastudy` 仅作 **UI/UX 视觉与交互参考**（非代码基线）。本文件只描述"外观长什么样、怎么交互"，**不复制代码**；当前产品规则一律以 time 项目 v1.2 / P1 / RewardProfile 为准。
> 原则：旧项目中的角色/Family/Teacher/Parent/状态/奖励数值/API 等均**不因 UI 参考而自动继承**。

---

## 1. Design Tokens（旧项目已收敛的像素复古主题，S0 定稿）

> 来源：`huahuastudy/apps/web/src/theme/themes.css:9-18` + `tailwind.config.cjs:7-18`（S0 起 child/warm 两套已统一为单套像素语言；色值经 `--panel/--ink/...` CSS 变量 + Tailwind 扩展类消费）。

| Token | 值 | 用途 |
|---|---|---|
| 主色 accent | `#e38628`（橙） | 按钮/进度条/高亮/激活态 |
| 完成 ok | `#4a9e6b`（绿） | 完成、通过、成功 |
| 警示 warning | `#f59e0b` | 待审批/待生效/已逾期 |
| 经验 xp | `#444e69`（深藏蓝） | **等级经验条进度填充**（按用户参考图采样定色） |
| 经验条斜角 xpLight / xpDark | `#66799e` / `#2e3957` | 经验条填充的**上高光 / 下阴影**（bevel，立体感来源） |
| 面板 panel | `#f2e5c9`（米黄） | 卡片/面板底 |
| 浅面板 panelLight | `#f7edd9` | 展开区/浅底 |
| 文字 ink | `#4a3326`（深棕） | 主文字/描边 |
| 次级文字 inkSoft | `#7a5c38` | 次要信息 |
| 页面底色 brandBg | `#e8d5ae` | 页面背景 |
| 边框 | `2px solid var(--ink)`（硬描边） | 全部像素块边框 |
| 阴影 shadow-pixel | `4px 4px 0 #3a2a1e`（硬阴影，无模糊） | 卡片/按钮"像素立体感" |
| 圆角 | 面板 `0`（直角像素块）；Card 变体 `rounded-xl` | 以直角为主 |
| 字体 | 正文默认 sans；HUD 用 `font-extrabold tracking-widest` + `textShadow: 2px 2px 0` | 标题像素感 |
| 间距 | `p-4`（面板）、`space-y-3`（列表）、`gap-1`（网格） | 紧凑像素排布 |
| 图标 | lucide + Kenney Tiny Factory 像素 tile（CC0） | 任务/装饰图标 |

> 辅助旧色板（`packages/ui-kit/tailwind-preset.cjs`，仍被部分组件用）：primary `#2563eb`、danger `#dc2626`、success `#10b981`、surface `#f9fafb`——仅个别状态沿用（如计时器 running 蓝）。

### 1.1 实现约定（**踩过坑，务必遵守**）

Token 在 `apps/web/src/index.css` 里**同时**提供两份：

| 形式 | 例子 | 用途 |
|---|---|---|
| hex | `--ink: #4a3326` | 直接 CSS / 内联样式（`var(--ink)`） |
| RGB 通道 | `--ink-rgb: 74 51 38` | Tailwind 颜色（`rgb(var(--ink-rgb) / <alpha-value>)`） |

Tailwind 侧必须写成 `rgb(var(--x-rgb) / <alpha-value>)`。**若写成 `var(--ink)`，`border-ink/30`、`bg-panel/10`、`text-panelLight/80` 这类透明度修饰类不会生成**，元素会静默退回 Tailwind 默认边框灰 `#e5e7eb` —— 2026-10-06 用户实测反馈"日程格线是灰色、很浅、看不清"即此原因（当时**全站所有 `/透明度` 类都失效**，不止日程页）。

> 新增主题色时：`index.css` 里加 `--x` 与 `--x-rgb` 两份，`tailwind.config.ts` 里用 `rgb(var(--x-rgb) / <alpha-value>)`。

### 1.2 HUD 像素边框统一用 `PixelFrame`（2026-10-06）

顶部游戏状态栏（头像 / 等级经验条）的双层像素边框 = `apps/web/src/components/ui/pixel-frame.tsx`：

```
外层 2px 深棕描边(--ink) → 2px 暖棕层(--inkSoft) → 内层 2px 深棕描边 + 米白底(--panelLight) → 内容
```

- **头像框与经验条框必须共用该组件**（用户明确要求"厚度、配色、明暗层次一致，避免看起来来自两套 UI"）；
- 经验条：填充 `--xp` + 上下斜角 `--xp-light`/`--xp-dark`，未填充为浅米色 `panel`，**XP 数字自带 `bg-xp` 深色底**（任何进度下都压在深色上，保证可读）；
- 布局：头像框与经验条框同处一行且 `items-stretch` → **顶/底自动对齐**；日期与累计 XP 放在整行下方；
- 窄屏（360px）实测：角色文字隐藏（`hidden sm:inline-block`）以给经验条让出宽度，无横向溢出。

## 2. Layout

| 层 | 旧项目实现（参考） | 说明 |
|---|---|---|
| Desktop | `AppNav` 顶栏（`max-w-6xl px-6`）+ 内容区；儿童 `max-w-md`、家长/教师 `max-w-6xl`、Shell `max-w-5xl` | 儿童窄栏（手机式）、成人宽栏 |
| Mobile | `BottomNav`（sticky bottom，`max-w-md grid-cols-3 border-2 border-ink bg-ink p-1.5 shadow-pixel`）；内容 `max-w-md px-3 py-4` | 底部三格导航 |
| Header/HUD | 儿童端顶部游戏 HUD：深棕底 `bg-ink text-panelLight border-b-4 border-ink`，"学习冒险岛"标题 + `textShadow`，副行"今日专注目标 X 分钟 · 已专注 Y 分钟"，第三行"连续专注 N 天" | 参考"游戏面板式"顶部 |
| Navigation | 一级导航定稿：**我的任务 ｜ 日程 ｜ 学习**（`nav-config.ts`，不再增加）；AppNav 激活态 `border-ink bg-accent text-white shadow-pixel` | P2 导航按当前产品调整（见 §5） |
| Content | `Panel` 容器承载内容；列表 `space-y-3` | 面板化内容 |

## 3. Components（值得复刻，参考实现方式见"当前项目建议"）

| Component | 用途 | 外观 | 交互 | 当前项目建议实现方式 |
|---|---|---|---|---|
| PixelBar | 进度条（专注/冒险进度） | `h-4 border-2 border-ink` + 条纹渐变填充（`repeating-linear-gradient` + `color-mix`），底 `#e7d6b0` | `percent` 宽度过渡；`null` 时 100% 条纹态 | 复用同款 CSS（自研小组件）；等级/成长进度可用 |
| Button（pixel） | 主操作 | `border-2 border-ink px-4 py-2.5 font-bold text-white shadow-pixel`；变体 accent/ok/ghost | `active:translate-y-1` 按压下沉（阴影消失感）；`disabled:opacity-50` | 接入 shadcn Button 变体定制 pixel 风格 |
| Panel/Card | 内容容器 | Panel：`border-2 border-ink bg-panel p-4 shadow-pixel`（直角）；Card：`rounded-xl border-ink/30` | — | shadcn Card 样式定制 |
| Tag/Badge | 状态徽标 | `inline-flex border-2 border-ink px-2 py-0.5 text-xs font-bold`；tone accent/ok/primary/warning | — | shadcn Badge 定制 + 状态→色集中映射（Quorum STATUS_COLORS 模式） |
| TaskCard | 任务行卡片 | 图标块 `h-12 w-12 border-2 border-ink bg-panelLight`（像素 tile 32px）+ 标题 + 学科 emoji + 状态 Tag + 时长/日期行；展开区 `border-t-2 border-dashed` | 标题点击展开/收起（默认展开首任务）；完成/状态操作在展开区 | P2 TaskCard 复用此结构（状态按 v1.2 四态着色） |
| Empty | 空状态 | `flex flex-col items-center gap-2 px-6 py-10 text-center`，icon+标题+描述 | — | 引入 shadcn 风格 Empty（§二点七 TaskLabs EmptyState 参考） |
| 操作按钮组 | start/pause/resume/complete/cancel | 动作色：start/resume=accent、pause=灰蓝、complete=ok、cancel=danger | 按状态矩阵显隐；`window.prompt` 填驳回意见；`window.confirm` 二次确认删除 | P2 用自定义 Modal 替代 window.prompt/confirm（shadcn Dialog/AlertDialog） |
| TaskForm | 创建/编辑 | Panel 表单；标题 Combobox（模板选择分组）；颜色 8 圆点选择；提交按钮 pixel 样式，`submitting → "提交中…"` | 成功 invalidate + 跳转/收起；冲突提示面板（仅提示不阻止） | P2 用 RHF+zod（§二点七）重做字段，模板奖励提示改为 RewardProfile 摘要（不显示 50-150% 调整文案） |

> 旧项目**没有**：Modal/Drawer/Sheet/Dialog、Toast、Spinner（加载态=纯文本"加载中…"）、六维/等级/奖励记录页面。→ 这些由当前 P2 基础决策补齐：shadcn/ui（Modal/Dialog/Sheet/Toast/Skeleton）+ 自研成长页（§二点七）。

## 4. Page Patterns

| 旧项目页面（视觉参考） | 页面目的 | 核心布局 | 核心组件 | 交互 | 当前项目对应页面 |
|---|---|---|---|---|---|
| `task-page.tsx`（高） | 三端统一任务页 | HUD 顶部 → 今日冒险 Panel → 本周打卡像素格 → 待接收/待审批 → 任务卡片列表 | PixelBar、TaskCard、Empty、Tag | 卡片展开、接受/退回委托、通过/驳回（prompt 意见）、重提 | **Task List / Today** |
| `task-detail-page.tsx`（高） | 统一任务详情 | 任务头 → 专注目标 PixelBar → 信息 dl → 执行区 → 记录 | TaskTimer（只读）、TaskCardOperations、Empty | 状态操作、家长管理区（删除/拆分/复制——P2 无拆分） | **Task Detail** |
| `proto-kid-v2.tsx`（高） | 儿童端视觉原型 | 像素 HUD + 今日任务展开 + 周打卡 + 底部菜单 | 像素 tile、Panel、PixelBar | mock 交互 | **儿童端视觉基准（Today/TaskList）** |
| `proto-parent-warm.tsx`（高） | 家长端原型（已废弃温暖风，S0 统一像素） | 家庭空间 + 任务/日程/登录 | Panel、统计卡 | mock | 家长侧布局方向（像素语言统一后） |
| `family-home.tsx`（高） | 家庭空间 | 每孩子卡片 + 今日统计三格 + 功能入口 | Card、StatCard 式三格 | 入口跳转 | P2 无家庭页（可作未来参考） |
| `schedule-page.tsx`（高） | 日程（P5 参考） | 两日视图 + 新建内联 + 冲突提示 | NewTaskForm、冲突面板 | 内联新建、冲突仅提示 | P5 Calendar（非 P2） |
| `kid-tasks-new.tsx`（中） | 儿童新建任务整页 | PageHeader + TaskForm pixel | TaskForm | 成功跳回列表 | **Task Create** |
| `learning.tsx`（中） | 模块入口网格 | 6 卡片网格 + 空态 | Card、Empty | 占位 | P2 无（模块入口后续） |
| `child-goals.tsx` / `parent-records.tsx` / `kid-records.tsx`（中） | 目标/记录列表 | 列表 + 内联编辑 | FormField、Empty | 内联编辑 | P2 无对应（记录页后续） |
| `login.tsx`（中） | 登录 | 角色 tab + 表单 | FormField、Button | 登录跳转 | **Login（P0 已有，视觉可对齐）** |

## 5. 当前 P2 映射

| 旧 UI 参考 | 当前 P2 页面 | 参考程度 |
|---|---|---|
| 旧项目 Today（task-page 今日冒险 HUD + 本周打卡） | **Today**（今日任务 + 成长摘要 + 打卡入口 P4） | 高（HUD/PixelBar/今日任务布局） |
| 旧项目 Task List（task-page 列表 + TaskCard） | **Task List** | 高（TaskCard 结构 + 空态 + 筛选） |
| 旧项目 Task Detail（task-detail-page） | **Task Detail** | 高（头/信息/执行区/记录区） |
| 旧项目 Task Create/Edit（kid-tasks-new + TaskForm） | **Task Create/Edit** | 中（表单字段按 v1.2 精简；奖励档改为 RewardProfile 下拉） |
| 旧项目完成交互（task-status-actions / task-timer） | **Submit Complete** | 中（按钮矩阵按 v1.2 四态；提交表单自研——旧项目无"提交成果"UI） |
| 旧项目审批（task-page 待审批区 / task-card-operations 通过驳回） | **Approval List / Approval Detail / approve-reject** | 中（通过/驳回按钮样式与 prompt 意见→改用 Modal；审计时间线无旧参考→Quorum AuditTimeline 模式） |
| **无直接参考** | **Growth（等级/六维/金币/奖励记录）** | 旧项目无成长页（仅"+20 成长值"占位文案与 PixelBar 概念）→ **当前项目自行设计**，数值以 RewardProfile/等级派生为准 |

## 6. 与当前产品规则的冲突提醒（不继承）

1. 旧项目占位文案 `⭐ 今日成长值 +20/任务（后续开放）`、`获得：+20 成长值`、`六维属性 · 等级 · 金币（后续开放）` —— **均为占位**，与已确认 RewardProfile 数值（语文 XP20/智识5/表达3 … coins100 等）无关；P2 成长展示以 `/growth/me` + RewardProfile 数据为准，不沿用 "+20"。
2. 旧项目状态含 `uncompleted/cancelled/archived` —— 当前 v1.2 为 `pending/in_progress/completed/returned`；P2 状态徽章/筛选按 v1.2，不继承旧状态。
3. 旧项目模板奖励提示含"家长/教师可调整 50%–150%" —— 当前 RewardProfile 为系统配置（不可调、无 CRUD），P2 不展示该调整文案。
4. 旧项目角色化布局/导航（我的教师/家庭空间/教师端）—— 当前产品不做三端拆分；仅取视觉语言，不取角色信息架构。
5. 旧项目 `window.prompt/confirm` 反馈 —— P2 改用 Modal/AlertDialog（shadcn），保留"驳回必填意见"的交互语义（reject comment 必填已由后端强制）。

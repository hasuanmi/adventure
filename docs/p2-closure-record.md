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
| 端到端闭环 + 越权负例 | `scripts/p2-smoke.ps1`（新增，可重复执行） | ✅ **42/42 PASS**：CORS 预检放行 → 注册/登录 → 建家庭 → 加成员 → 建需确认任务 → 开始 → 提交 → 家长看到待确认（`canAct=true`、`descriptor.label`=任务标题）→ 非确认人 403 → 驳回缺意见 400 → 通过 → `completed` → `reward_grants=1` → `xp>0`；另含无家庭 400 与**任务列表 200 空**、无家庭审批列表为空、PATCH 自审/外家庭/区间 400、**待审批时禁止取消人工确认 409 且未产生第二条 completion** |
| 数据清理 | 冒烟脚本末尾按用户名级联清理 | ✅ 测试用户与关联数据全部删除（`cleanup removed smoke users = 0`） |
| 数据库 | 未新增迁移 | ✅ `schema.prisma` 与迁移目录无改动 |

> 冒烟脚本运行前置：API 在 `$BASE`（默认 `http://localhost:3000/api`，可用 `SMOKE_BASE` 覆盖）运行；DB 检查用 psql（可用 `PSQL`/`PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` 覆盖，psql 不可用时自动 SKIP 并提示）。
> 脚本刻意只写 ASCII，并用 `Invoke-WebRequest`（而非 curl）避免 PS 5.1 向原生程序传参剥引号；该设计同时使其可在 CI（Linux + pwsh）直接运行。
> **两道自检守卫**（2026-10-06 补）：① 启动时检测文件自身是否非 ASCII（PS 5.1 会把 UTF-8 当 GBK 读，乱码字节会**吞掉下一行**从而静默丢掉一条断言——本脚本真实踩过一次）；② 结尾校验"实际执行断言数 == `$EXPECTED_CHECKS`"，少一条即失败。

### 5.1 Docker 复验（2026-10-05，本轮交付形态）

| 项 | 结果 |
|---|---|
| 镜像重建 | `docker compose up -d --build` → `time-api` / `time-web` 重建成功（旧镜像为 6-7 小时前代码） |
| 端口 | `WEB_PORT=8500` **失败**（Windows 保留段已变为 `8451-8550`）→ 改 `WEB_PORT=18080`；`.env`/`.env.example`/`docs/deployment.md §7` 已同步 |
| 容器 | postgres(healthy, 5432) / api(3000) / web=nginx(18080) 全部 Up |
| 健康检查 | `http://localhost:3000/api/health` 与 `http://localhost:18080/api/health` 均 200 且 `db=up`；`/` 200 |
| 端到端 | 经 nginx 路径跑 `p2-smoke.ps1` → **42/42 PASS**（等价 P1 验收项 O 的 Docker 全链路） |
| 主机进程 | 已停掉本项目的 `pnpm dev` + `nest start --watch`（避免与 api 容器争 :3000）；旧项目 huahuastudy 与 tasklabs 预览不受影响 |

---

## 6. 本机环境限制（影响后续接手者的操作方式）

| 限制 | 现象 | 规避方式 |
|---|---|---|
| `pnpm <script>` 在沙箱内不可用 | pnpm 用管道 spawn 子进程 → `spawn EPERM` | 直接调底层二进制（如 `node node_modules/typescript/bin/tsc ...`、`node node_modules/vite/bin/vite.js`）；在普通终端里 `pnpm` 正常 |
| Vite 构建需放宽沙箱 | esbuild 服务进程 `spawn EPERM`；放宽后仍需 `TEMP` 指向工作区（否则清理系统临时文件被拒） | 用 `$env:TEMP`/`$env:TMP` 指向工作区内目录后再构建 |
| Docker / 进程操作需放宽沙箱 | Docker CLI 访问命名管道、进程枚举与终止均被默认拦截 | 对**精确命令**申请一次更宽权限（仅限必要操作） |
| ~~无 git~~ | **已解决**：winget 用户级安装 Git 2.55.0.5（`C:\Program Files\Git\cmd\git.exe`），已建仓库与基线提交 `99e0fb7` | — |
| ~~无 CI~~ | **已解决**：新增 `.github/workflows/ci.yml`（typecheck + build + postgres 冒烟） | 仍需推送到远端仓库后才会实际运行 |
| 无 lint | 文档 §13 要求的 lint 未落地（无 ESLint/Prettier 配置） | 未在本轮引入（CI 注释中已标注） |
| 行尾 | 原仓库 CRLF/LF 混杂（Windows 开发 + Linux 容器构建） | 首次提交时统一为 **LF**（135 文件转换）并加 `.gitattributes`（`* text=auto eol=lf`），此后不再产生 EOL 噪声 |

---

## 7. 明确未做（禁止静默绕过）

| 项 | 原因 |
|---|---|
| ~~统一错误体 ExceptionFilter~~ | **已完成（2026-10-06，见 §10）**：`apps/api/src/common/filters/api-exception.filter.ts` 已全局注册，class-validator 的默认体也归一为 `{error, reason, fields}` |
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

1. ~~装 git + 建基线提交 + CI~~ **已完成**，仓库已推送到 `github.com/hasuanmi/adventure` 且 **CI 全绿**。下一步：为 `main` 开分支保护（要求 CI 通过才可合并）。
2. **补 lint**：加 ESLint + Prettier 并接入 CI（文档 §13 的 lint 门禁目前仍缺）。
3. ~~统一错误体~~ **已完成（2026-10-06，见 §10）**。
4. **P2 剩余 UI**：TaskCard 可展开面板（进度/完成标准/行内操作）、本周打卡位、成长页（`/growth/me` 接口已具备）。
5. **P3 移动端**：`apps/mobile` 复用 `shared-types` 与后端，优先补齐 任务列表/详情/提交/审批 四屏。
6. 之后按阶段表推进 P4 打卡（WorkPulse 逻辑直迁）与 P5 Event + 日历（TaskLabs/Kaneo）。

---

## 9. 工程基建（2026-10-05 本轮补齐）

| 项 | 结果 |
|---|---|
| 版本控制 | 首次建立 Git 仓库（此前无 git，无历史、无回滚、无 diff）；`git init -b main` + 基线提交 `99e0fb7`（163 文件）；`core.autocrlf=false` |
| Git 安装 | winget 安装 Git **2.55.0.5**（`C:\Program Files\Git\cmd\git.exe`，已在机器 PATH） |
| 行尾 | 统一 LF（135 文件 CRLF→LF）+ `.gitattributes`（`* text=auto eol=lf`，二进制显式排除） |
| 提交身份 | 仓库级 `hasuanmi` / `hasuanmi@users.noreply.github.com`（作者身份在**首次推送前**改写完成，避免日后 force-push） |
| 忽略项 | 复用既有 `.gitignore`：`node_modules/`、`dist/`、`.env`、`uploads/` 等；`git check-ignore` 已复核，暂存区 0 个 node_modules/dist 文件 |
| CI | 新增 `.github/workflows/ci.yml`：① `verify`（install → shared-build → prisma generate → `pnpm typecheck` → api build → web build）② `smoke`（postgres:16 service → migrate → seed → api build → 起 API 等 health → 装 psql → 跑 `scripts/p2-smoke.ps1`，失败打印 API 日志） |
| 冒烟脚本可移植 | `scripts/p2-smoke.ps1` 支持 `SMOKE_BASE` / `PSQL` / `PG*` 覆盖；无 psql 时 DB 断言 SKIP 并提示；兼容 Windows PowerShell 5.1 与 PowerShell 7 |
| 验收脚本端口 | `scripts/p1-acceptance.ps1` 的 `$BASE` 改为默认 `http://localhost:18080/api`，并支持 `$env:ACCEPT_BASE` 覆盖 |
| 远端仓库 | `https://github.com/hasuanmi/adventure`（`origin`，HTTPS；如需改 SSH：`git remote set-url origin git@github.com:hasuanmi/adventure.git`） |
| CI 结果 | 推送后 **run #2 两个 job 全绿**（`typecheck + build`、`API smoke`）；CI 日志内冒烟为 `pass=38 fail=0 skip=0 db=True`（DB 断言真实执行，非跳过）；后续 run #3（docs）同样全绿 |

### 9.1 CI 首轮（run #1）抓到的两个真问题（记录为证）

首轮 CI **两个 job 都红**，暴露出本地环境掩盖的问题——这正是引入 CI 的价值：

| # | 现象 | 根因 | 修复 |
|---|---|---|---|
| 1 | `verify` 的 api typecheck 27 条报错（`PrismaClientKnownRequestError does not exist on type 'typeof Prisma'`、`tx` 隐式 any 等） | CI 全新安装**没有生成 Prisma Client**；本机开发机早就生成过，所以本地 `tsc` 全绿掩盖了它 | `verify` job 在 typecheck 前加 `prisma:generate` |
| 2 | `smoke` 中所有 `Code(...)` 断言拿到的状态码为空（`got=`） | 错误分支用了 `Exception.Response.GetResponseStream()`——那是 Windows PowerShell 5.1 / .NET Framework 的 API；CI 的 `pwsh` 7 上 `HttpResponseMessage` 没有该方法 | 改为双版本兼容：优先 `ErrorDetails.Message`，`GetResponseStream` 仅在方法存在时兜底 |

> 教训：**"本地能跑"不等于"能移植"**。脚本/构建的可移植性只能由异环境执行证明（本地 PS 5.1 全绿 ≠ PS 7 可用）。

---

## 10. 用户首次实际使用暴露的缺陷与修复（2026-10-06）

用户首次在浏览器（`http://localhost:18080`）试用时报"注册并登录不了"。**服务端日志证明请求全部到达**（`POST /api/auth/register` 400 两次、随后 201；`POST /api/auth/login` 201），因此不是网络/CORS/Docker 问题，而是三类产品缺陷：

| # | 现象（用户视角） | 根因 | 修复 |
|---|---|---|---|
| 1 | 注册被拒只显示 `Bad Request`，完全不知道哪里错 | class-validator 的 400 是 Nest 默认体 `{statusCode, message[], error}`，**没有 `reason`**；客户端 `ApiError` 退化成 `body.error` = "Bad Request"。规则本身是"用户名 3–32 字符、密码 ≥6 位"，用户输入了 2 个汉字的用户名 | ① 新增全局 `ApiExceptionFilter`（`apps/api/src/common/filters/api-exception.filter.ts`），把校验失败归一为 `{error:'bad_request', reason:'validation_failed', fields:{字段: 原文}}`，并统一未预期异常为 500 `{error:'internal_error'}`；② 登录/注册页前端预校验 + 中文提示（用户名/密码规则直接显示在输入框下）；③ 顺带把 `Failed to fetch` 这类底层报错翻译成"连不上服务器…" |
| 2 | **注册成功后首页显示"读取任务失败"，看不到"去创建家庭"引导**（实际卡住） | 新注册家长 `familyId=NULL`，而 `GET /tasks` 对"parent 但无家庭"抛 **403**；今日页先渲染任务错误卡，把家庭引导顶掉 | ① 后端改为**无家庭 = 返回空列表**（`task.service.ts`；与审批列表同一原则："无家庭不是权限错误，而是空范围"）；② 前端把"未加入家庭"的引导**前置**于任务错误分支，并给出「创建家庭（1 步）」按钮与日程入口；③ 冒烟新增 2 条回归断言（无家庭家长 `GET /tasks` → 200 且 `[]`） |
| 3 | 若用 `http://127.0.0.1:18080` 打开，会完全无法调 API（静默失败） | `CORS_ORIGINS` 只列了 `http://localhost:18080`；`localhost` 与 `127.0.0.1` 是**两个不同 Origin** | `.env`/`.env.example` 同时列出两者，并在模板里注明原因 |

### 10.1 为什么原有验证没能提前发现

| 缺口 | 说明 | 补强 |
|---|---|---|
| 冒烟不带 `Origin` | `Invoke-WebRequest` 不发 Origin、不触发预检，所以 **CORS 配错也全绿** | 冒烟新增 2 条预检断言（`OPTIONS` + `Origin` → 204 且 `Access-Control-Allow-Origin` 等于应用 Origin），总计 42 条 |
| 冒烟只断言状态码，不看错误体 | 缺陷 #1 的错误体正是"状态码对、内容无用"，状态码断言抓不到 | 新增错误体契约（`{error,reason,fields}`）后，后续可按 `reason` 断言；本轮已人工核验两类错误体 |
| "能用"阈值定得偏低 | 之前把"typecheck + build + API 冒烟全绿"当作可用，但**没有任何一步模拟真实浏览器入口与首次使用路径**（新用户 → 注册 → 空家庭 → 首页） | 冒烟新增"无家庭家长"路径；首次使用路径纳入回归 |

### 10.2 本轮踩到的两个自身工具问题（已修）

1. **冒烟脚本混入中文注释 → 静默丢断言**：脚本必须 ASCII-only（PS 5.1 把 UTF-8 当 GBK 读，乱码字节会**吞掉下一行**）。这次因此在本地少了 1 条断言且无任何报错。已加**两道守卫**：启动时检测文件是否非 ASCII（非 ASCII 直接 exit 2）；结尾校验实际执行断言数 == `$EXPECTED_CHECKS`（少一条即失败）。
2. **全局异常过滤器的判断顺序写错**：Nest 默认校验体同样含 `error: 'Bad Request'` 字段，我最初"含 `error` 即原样透传"的分支先命中，导致归一化从未执行（已用真实请求验证并修正为"先识别 `message` 数组"）。

> 结论：**接口能通 ≠ 产品能用**。这三条都只在"真人从浏览器第一次用"时暴露；已在冒烟里补上能在无浏览器环境复现的两条（CORS 预检、空家庭路径），并把错误体纳入契约。

---

## 11. 第二轮用户实测（2026-10-06）：默认时间 / 日期点击 / 浏览器回归工具

用户提出两点："开始时间和结束时间应该默认是今天，用户可以修改"、"日程表里的具体日期无法点击、跳转到对应日程"。

### 11.1 问题 1：开始/结束时间默认为空

| 项 | 内容 |
|---|---|
| 现象 | 新建任务时开始/结束时间为空（只有截止日期默认今天），任务不落在日程上，用户必须手填时间 |
| 根因 | `TaskCreateSheet` 创建态默认值 `startAt: defaultStartAt ?? ''`、`endAt: ''` |
| 修复 | 新增 `lib/schedule.ts#defaultTaskSlot()`：日期固定**今天**，开始 = **下一个整点**（不早于现在，不早于 07:30，不跨天），结束 = 开始 + **60 分钟**（遵循 TaskLabs `schedule-constraints.ts` 的"新事件不得从过去开始 + 默认 60min"）。点日程时间格创建时：沿用所点时刻 + 1 小时。两个时间仍完全可编辑，并新增「清除时间（不排入日程）」按钮（保留"刻意不排程"的用法） |

### 11.2 问题 2：日期条点了没反应

| 项 | 内容 |
|---|---|
| 现象 | 日程页顶部 7 日日期条，点具体日期没有任何反应（换不了日程）；两日网格的"今天/明天"表头也点不动 |
| 根因 | `week-date-nav.tsx` 在 `pointerdown` 就对**容器**调用 `setPointerCapture`。指针捕获会把后续 `click` **重定向到捕获元素（容器）**，于是每个日期按钮自己的 `onClick` 永不触发；容器又没有 onClick → 表现为"点了没反应" |
| 修复 | ① 改为**移动超过 8px 才捕获**（普通点击不再被劫持），并在未跨格但已捕获时按指针最终坐标兜底选中；② 日期按钮加 `cursor-pointer` 与 `aria-label`；③ 两日网格表头改为可点按钮（`data-day-header`），点击即把该日切到左列（`onSelectDay`） |

### 11.3 新增工具：真实浏览器 UI 检查（`scripts/browser-check.mjs`）

背景：本轮两个问题都是**纯前端交互**，而 typecheck / build / API 冒烟**全都覆盖不到**（此前两次同类教训：CORS 配错冒烟全绿、脚本静默丢断言）。因此新增：

- **零依赖**：无头 Edge/Chrome + CDP（Node 内置 `WebSocket`，不需要 puppeteer/playwright）。
- **真实鼠标事件**（`Input.dispatchMouseEvent`）点击 UI，能复现 pointer capture 这类只有真实事件链才暴露的问题。
- 自带造数据 + 清理（注册家长/孩子、建家庭、建当天任务；结束时删库）。
- **14 条断言** + 每个关键页面截图到 `ui-shots/`（供人工复核）。
- 用法：`node scripts/browser-check.mjs --out ./ui-shots`（Docker 栈需在跑）。

**该工具当场又抓到两个此前未发现的缺陷**：

| # | 缺陷 | 根因 | 修复 |
|---|---|---|---|
| 1 | **整页刷新仍然会登出**（我上一轮声称已修好、但从未在浏览器里验证过） | `useSessionBootstrap` 用 `authApi.refresh()` 拿到新 token 后**没有写进 store**，紧接着的 `/auth/me` 不带 Authorization → 401 → 被自己的 catch 当成"未登录"清掉会话。服务端日志证据：`POST /auth/refresh 201` 紧跟 `GET /auth/me 401` | 改用 `ensureRefreshed()`（内部会 `setAccessToken`）再拉 `/auth/me`；并新增断言"刷新页面后仍在首页" |
| 2 | 底部导航（sticky）遮挡日程页 62vh 网格的下半部分 | `main` 只有 `py-4`，没有给浮层导航留空间 | `main` 改 `pb-28`；新增断言"滚到底后 网格底 <= 导航顶"（修复后 gap 348px） |

### 11.4 教训（第三次同类）

**UI 交互只能由真实浏览器证明**。三次教训依次是：CORS 配错（无 Origin 的冒烟全绿）→ 脚本静默丢断言（环境编码）→ 声称修好的会话恢复其实没生效。因此：

- 冒烟脚本已补 CORS 预检与空家庭路径；错误体已纳入契约；
- UI 交互改用 `scripts/browser-check.mjs` 验证；
- **待办**：把 browser-check 接进 CI（ubuntu runner 自带 Chrome；需要额外起 web 静态服务），目前仅本地手动跑。

### 11.5 待用户确认（未擅自改动）

- 当前时间线（`current-time-line.tsx`）按 `schedule-two-day-design.md §5.4` 实现为**从"现在"到底部的竖向红线**（视觉上偏特殊）。业界常见做法是**横线 + 左侧圆点**。是否改为横线，等确认后再动（涉及文档 §5.4 的既定设计）。

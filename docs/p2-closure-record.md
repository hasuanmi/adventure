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
- **已接入 CI**：`ci.yml` 的 `smoke` job 在 API 冒烟之后追加 `Build Web → vite preview(4173) → browser-check → 上传截图 artifact`（ubuntu runner 自带 Chrome；preview 已配 `/api` 代理；脚本在 Linux 下加 `--no-sandbox`）。本地已用同一路径验证通过（14/14）。

### 11.5 待用户确认（未擅自改动）

- 当前时间线（`current-time-line.tsx`）按 `schedule-two-day-design.md §5.4` 实现为**从"现在"到底部的竖向红线**（视觉上偏特殊）。业界常见做法是**横线 + 左侧圆点**。是否改为横线，等确认后再动（涉及文档 §5.4 的既定设计）。

---

## 12. P2 剩余 UI 实施（2026-10-06）：可展开任务面板 + 本周打卡

依据 [docs/p2-ui-ux-review.md](p2-ui-ux-review.md) §8 页面结构、§9 调整项、附录第 9/10 条。用户确认的本次范围：**先做「可展开任务面板」与「本周打卡」**；成长页入口按用户新要求改为**左上角头像 + 等级经验栏**（见 §13）。

三处「展示层派生」记录（**均不新增字段/表**，符合本项目"投影不改模型"惯例）：

| 派生项 | 数据来源 | 说明 |
|---|---|---|
| 任务进度 | `task.status` 映射：pending 0% / returned 20% / in_progress 50% / completed 100% | Task 无 progress 字段；面板内标题写明"进度（按状态）"，避免误认为精细进度 |
| 完成标准 | `task.description` | 创建/编辑弹窗字段标签同步由「描述」改为「完成标准 / 说明」 |
| 本周打卡 | `GET /growth/grants` 的 `grantedAt`：某天有 ≥1 次发放即点亮 | P4 打卡模块未开始，不做假数据；用真实发放流水投影（当天完成定稿 = 打卡） |

实现清单：

| 文件 | 变更 |
|---|---|
| `apps/web/src/components/task-card.tsx` | **重写**为可展开面板：收起态＝像素 tile（含像素角饰）+ 标题 + 状态 + 元信息；展开态＝进度 PixelBar + 完成标准 + 元信息（时间/预计用时/截止/需确认）+ 行内操作 + 详情/编辑入口。头部为 `button[aria-expanded]` + `data-task-card-toggle`（可无障碍、可测） |
| `apps/web/src/components/week-checkin.tsx` | **新增**：本周一~周日 7 格像素格（`data-checkin-cell`），点亮＝当天有发放；今天 accent 描边、未来日降透明度；仅孩子侧渲染（数据是本人流水） |
| `apps/web/src/lib/api/growth.ts` | **新增**：`/growth/me`、`/growth/grants` 客户端 |
| `packages/shared-types/src/growth.ts` | 新增 `dimensionProgressFromPoints`（六维等级内进度，与 XP 同构）；抽出内部 `progressWith` 复用，`levelProgressFromXp` 行为不变（已用 0–20000 步进 7 遍历自检：与旧实现 0 处不一致） |
| `apps/web/src/pages/TodayPage.tsx` | 孩子侧追加「本周打卡」区块 |
| `apps/web/src/components/task-create/task-create-sheet.tsx` | 「描述」→「完成标准 / 说明」+ 示例占位文案 |

**行内操作**走 `POST /tasks/:id/status`（`start` / `complete` / `resume`，v1.2 §8.2），仅"任务所属孩子"可执行（服务端同样限制）。`complete` 复用统一完成模型：无需审批＝自动定稿并发放奖励；需审批＝生成待确认申请、任务状态保持 `in_progress`。

**已知未做（有意）**：
- 行内「暂停」：后端状态矩阵无 `pause`（只有 start/complete/resume），本轮不新增状态，故不做暂停按钮（review 文档 Demo 里的"暂停"与当前状态机不符）。
- 成长页数值展示：见 §13。

**验证**：`scripts/browser-check.mjs` 断言由 14 条扩到 **31 条，全绿（19 秒）**，新增覆盖：
1. 任务卡默认收起 → 点击展开（`aria-expanded`）、面板含「进度（按状态）」「完成标准」且完成标准取到 `description`、含「查看详情」「编辑」；
2. 切换为孩子账号后行内操作**真实改状态**：点「▶ 开始」→ 状态徽章变"进行中"、进度变 50%、出现「✓ 完成」；点「✓ 完成」（该任务需审批）→ 提示"已提交，等待家长确认"且状态仍为进行中；再点一次 → 给出友好提示而非崩溃；
3. 孩子侧「本周打卡」渲染 7 格、初始 0/7（新账号无流水）。

---

## 13. P2 剩余 UI 实施（2026-10-06）：表头头像 + 等级经验栏 → 成长页

用户决策（明确否决了原方案）：**成长页不占底部导航**，改为「点击左上角」进入；同时把表头标题
「话话成长 · 学习冒险岛」替换为**小女孩头像 + 等级经验栏**。底部导航保持 2 格（今日｜日程）。

| 文件 | 变更 |
|---|---|
| `apps/web/src/components/layout/app-layout.tsx` | 表头左半部 = `Link[data-growth-entry]`（头像 + `Lv.N` 徽章 + 等级内 XP 进度条 + `当前/所需 XP` + 日期与累计 XP）；数据来自 `GET /growth/me`（`levelProgressFromXp` 派生等级，与成长页共用 queryKey 缓存）。右侧角色徽章/家庭/退出不变 |
| `apps/web/src/pages/GrowthPage.tsx` | **新增**：等级卡（大头像 + Lv + XP 进度 + 累计 XP + 金币）、六维成长（6 条：标签 + Lv + 点数 + 距下一级 + PixelBar，用新增纯函数 `dimensionProgressFromPoints`）、本周打卡（复用组件）、奖励记录（`GET /growth/grants` 最近 20 条：时间 + XP + 金币；空态） |
| `apps/web/src/App.tsx` | 新增路由 `/growth`（`withLayout` → 需登录） |
| `apps/web/public/avatar-girl.png`、`avatar-girl-16.png` | **自研像素头像**：16×16 手写像素图 → `×8` NEAREST 输出 128×128（外加原生 16×16）；生成脚本 `visualasset/build_avatar.py`（与既有 `build_icons.py` 同一套路，可复现/可改色） |

### 13.1 头像素材来源（如实记录）

| 项 | 结论 |
|---|---|
| `visualasset/kenney_tiny-farm`（Kenney，CC0） | 包内 **无小女孩角色**：12×11 tile 网格中角色只有 r9c0 男孩与 r9c1 宽檐帽农夫（已逐格切片核对） |
| 内部生图模型 | 调用失败：`402 Upstream image account has insufficient balance`（余额不足），本轮**不可用** |
| 最终方案 | **脚本化自研**（`visualasset/build_avatar.py`）：16×16 像素图（棕发 + 红蝴蝶结 + 蓝背带裤 + 白领口），`×8` NEAREST 放大。无第三方素材依赖，无需额外许可；已在 `docs/opensource-mapping.md` §二点十一 登记 |

**验证**：`browser-check` 断言 **40 条全绿（20 秒）**，本轮新增 9 条：
表头含等级徽章 / 含 XP 进度 / **头像文件真能加载（`naturalWidth > 0`，可捕获 public 资源缺失）** /
底部导航仍为 2 格 / 点击表头进入 `/growth` / 成长页含六维全部标签 / 含金币 / 含奖励记录区 / 含本周打卡。

---

## 14. P2 剩余 UI 第三批：任务类型图标接入 + 详情/提交页微调（2026-10-06）

### 14.1 A：把 `quest_icons` 五枚图标接进 UI

素材：`visualasset/quest_icons/native32/*.png`（自研 32×32 像素图）→ 复制到 `apps/web/public/quest/`。
映射依据 = 图标 README 的五类语义 ↔ 本项目**奖励档分类**（`daily/world/scenery/custom`）：

| 图标 | 语义 | 映射到 | 理由 |
|---|---|---|---|
| `01_daily` | 日常任务：每天要完成的学习与日常 | 奖励档 `daily` | 一一对应 |
| `03_world` | 世界任务：阶段性重要目标与世界事件 | 奖励档 `world` | 一一对应 |
| `04_nature` | 风物任务：户外活动、生活体验、观察自然 | 奖励档 `scenery`（风物） | 一一对应 |
| `05_bounty` | 悬赏任务：临时发布、限时完成的特别任务 | 奖励档 `custom`（含 `rewardProfile=NULL`，业务上视为 CUSTOM） | 自定义/特别任务的最近语义 |
| `02_adventure` | 冒险任务：长期成长、旅程与目标 | **无对应档位** → 用作「今日冒险」HUD 图标 | 与 HUD 同名，语义贴合（背包+地图+指南针） |

落点：`apps/web/src/lib/quest-icons.ts`（映射常量，**改一处即可整体调整**）、任务卡 tile、任务详情页 tile、
创建页「奖励档位」下拉（触发器 + 分组标签）、今日页「今日冒险」HUD。
图标以 32px 原生尺寸展示（整数倍、`image-rendering: pixelated`，不插值）。

### 14.2 B：任务详情页 / 提交页微调（review §9 第 6 条）

| 页面 | 改动 |
|---|---|
| 任务详情 | ① tile 改为**类型图标 + 像素角饰**（与任务卡一致）；② 新增**进度（按状态）** PixelBar；③ 新增**完成标准**区块（= `description`，空时显式提示"（未填写完成标准）"，原来是静默不显示）；④ 时间统一为 `M/D HH:mm`（原为完整 `toLocaleString`，噪声大）；⑤ **`alert()` 改为页面内错误提示**——`alert` 打断操作且无法被自动化断言；⑥ 学科徽章保留 emoji |
| 提交完成 | ① 新增**完成标准**区块（孩子提交前能看到要求）；② **提交成功后隐藏表单**——原来表单仍在，重复提交只会拿到 409；③ 标题行加类型图标；④ "任务列表"按钮（实际跳 `/tasks` → 重定向 `/`）改为明确的「返回今日」 |
| 新增 `lib/task-progress.ts` | 进度映射 + 进度条颜色 + `formatDateTime` 三处共用（任务卡/详情页原先各写一份，现已消除重复） |

### 14.3 验证

`browser-check` 断言 40 → **53 条全绿（25 秒）**，本批新增 13 条，其中包含**完整奖励闭环的真实浏览器验证**：

1. 今日页使用任务类型图标（≥2 处）且**全部加载成功**（`naturalWidth > 0`，可捕获 public 资源缺失）；
2. 详情页含「完成标准」（取到 description）/「进度（按状态）」/ 类型图标已加载；
3. 提交页显示完成标准；**无需审批任务**提交后 → 提示"成长奖励已发放" + **表单已隐藏**（防重复提交）；
4. **本周打卡由 0/7 点亮为 1/7**、成长页**累计 XP 由 0 增加**、奖励记录非空 —— 即"创建任务 → 孩子提交 → 定稿发奖 → 打卡/成长页可见"整条链路，全部由真实鼠标点击验证。

---

## 15. P2 剩余 UI 第四批：对齐旧项目 Demo（图标自选 / 卡片尺寸 / 打卡栏）（2026-10-06）

用户提供了此前一直缺失的**原型截图** `C:\Users\48489\Desktop\huahuastudy\.screenshots\proto-kid-v2-demo.png`
（另有同目录 `rules-taskv2-kid-mobile.png` 等旧项目实拍），并指出三处需调整：
① 本周打卡栏；② 每个任务的图标应从素材库**自选**，不要所有任务一个默认图标；③ 今日任务卡尺寸。

### 15.1 任务图标：从"派生默认图标"升级为"**每任务自选**"

| 层 | 变更 |
|---|---|
| 数据模型 | `tasks` 新增 `icon VARCHAR(32)` 可空（迁移 `20261006200000_task_icon`）；**纯展示层字段**，不参与任何业务规则；`NULL` = 中性默认图标 |
| 契约 | `shared-types`：`TaskDto.icon` / `CreateTaskRequest.icon` / `UpdateTaskRequest.icon`；**新增 `task-icon.ts`（key 白名单，由脚本生成）** |
| API | DTO `@IsIn(TASK_ICON_KEYS)` 白名单校验（update 额外放行 `''` 表示清空）；service create/update/toDto 透传 |
| 前端 | 创建/编辑弹窗新增**图标选择器**（33 枚，`data-icon-option` 可测）+「自动」项；卡片/详情/提交页渲染 `自选图标 > 类型图标 > 中性图标` |

**图标库（33 枚，统一 32×32）**：`visualasset/build_icon_library.py` 生成
`apps/web/public/icons/*.png` + `apps/web/src/lib/task-icons.ts`（UI 清单）+ `packages/shared-types/src/task-icon.ts`（契约白名单）
—— 同一脚本产出，**避免两处漂移**。素材来源：quest_icons（自研 5 枚：日常/长期/世界/自然/特别）+ Kenney Tiny Farm（CC0，植物/动物/工具/家具等 22 枚）+ Kenney Tiny Factory（CC0，机械/机器人/箱子/屏幕等 6 枚）。

> **踩坑记录**：Kenney 的 `Tiles/tile_XXXX.png` 编号与 `tilemap_packed.png` 的**行列顺序不一致**，
> 第一版按编号取图导致图标与标签错位（stone/berry 互换等）。已改为**按打包图行列坐标裁切**，
> 并生成带中文标签的库预览 `visualasset/_lib_preview.png` 人工复核后才接入。

### 15.2 今日任务卡尺寸（对齐 Demo）

| 项 | 旧 | 现（Demo 一致） |
|---|---|---|
| 图标 tile | 40px | **64px**（+ 像素角饰 + 硬阴影） |
| 标题 | `font-bold` 16px | **`text-base font-extrabold`** |
| 徽章 | 状态 + 学科 | **状态 chip + 任务类型 chip**（日常任务/世界任务/风物任务/悬赏任务/**未分类**）+ 需确认 |
| 元信息 | 三行小字 | **一行**：`预计 25 分钟 · 计划 10/6 · 14:00–15:00` |
| 展开区 | 普通按钮 | 虚线分隔 + 进度 + 完成标准 + **大按钮**（开始=橙 / 完成=绿）|

任务类型文案由奖励档分类派生（`未设置奖励档 → 未分类`，与 Demo 一致；此前把 `NULL` 当"悬赏"是错的，已改）。

### 15.3 本周打卡栏（对齐 Demo）

| 项 | 旧 | 现 |
|---|---|---|
| 标题 | 「🔥 本周打卡」小字 | **「本周打卡」主标题** + 右侧 `已点亮 x/7 天` |
| 周几标签 | 格子**下方**、小字 | 格子**上方**、`周一…周日` |
| 格子 | 32px 高、`✓`/日期数字 | **40px 高**，`✓` 绿（已打卡）/ `★` 琥珀（今天未打卡）/ `·` 米色（未打卡）|
| 装饰 | — | 像素描边 + 硬阴影；今天额外 accent 圈（`data-checkin-state` 可测）|

### 15.4 有意未采纳的 Demo 元素（避免误以为遗漏）

| Demo 元素 | 未采纳原因 |
|---|---|
| 底栏 3 格「我的任务 \| 日程 \| 记录」 | 用户已明确：成长入口放**左上角头像+等级栏**，底栏保持 2 格（§13） |
| 卡片行内「暂停」按钮 | 后端状态矩阵无 `pause`（只有 start/complete/resume，v1.2 §8.2）；不做假按钮（§12 已记录） |
| HUD「今日累计专注 0 分钟 / 连续专注 0 天 / 今日成长值」 | 依赖 P4 打卡与专注计时模块（未开始）；本周打卡已用真实发放流水投影，其余不编假数据 |
| 卡片「专注挑战 25 分钟」文案 | 我们字段语义是 `estimatedMinutes`（预计用时），文案保持「预计 25 分钟」 |

**验证**：`browser-check` 53 → **63 条全绿（31 秒）**，本批新增：创建弹窗图标选择器（≥30 枚）且**图标图片全部可加载**；
**孩子经界面新建任务并选定图标 → 卡片显示该图标**；卡片图标渲染尺寸 ≥40px（尺寸回归）；
打卡栏 7 个周几标签 / 恰有一格是今天 / 今天格已点亮；详情页类型图标可加载。
> 同时修掉检查脚本自身的两个问题：**点击前不滚动进视口**（新卡片变高后按钮落到视口外，点击落空，
> 甚至被 Radix 当成"点外部"关掉弹窗——这正是"需审批任务点完成"与"图标选择器"两条断言假失败的根因）、
> 以及打卡栏"今天=★"的断言写错（今天同时是已打卡时状态应为 `done`）。

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

- ~~当前时间线……是否改为横线~~ **已由用户确认并修改（2026-10-06，见 §16）**：改为**横线**（左端像素方块 + 右端 `HH:mm` 标签）。

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

### 15.2 今日任务卡尺寸（对齐 Demo 比例）

> **一次修正记录**：第一版我按"旧项目截图看起来更大"误判为**要放大**，做成 tile 64px、大标题。
> 用户指出"太大了，你看下那张截图的比例"。于是把 Demo 截图**裁剪放大实测比例**（截图 824 宽 ≈ 412 CSS px @2x）：
> 卡片 tile ≈ **45 CSS px**、折叠卡高 ≈ **85 CSS px**、标题 ≈ 16px、状态 chip 与用时同一行。
> 据此修正为下表右侧数值。

| 项 | 第一版（误） | 现（按 Demo 实测比例） |
|---|---|---|
| 图标 tile | 64px | **44px** 见方（内嵌 **32px 原生图标**，像素不插值） |
| 标题 | `text-base` 16px | **15px `font-extrabold`** |
| 徽章 | 状态 + 类型 + 需确认，`text-xs` | 同三项但 `text-[11px]`、间距收紧 |
| 元信息 | 独立一行 `text-xs` | 一行 `text-[11px]`：`预计 20 分钟 · 计划 10/6 · 14:00–15:00` |
| 卡片内边距 | `p-3`(12px) | **`p-2.5`(10px)** |
| 折叠卡高 | ≈92px | **≈64–78px**（Demo ≈85px） |

展开区保持：虚线分隔 + 进度（按状态）+ 完成标准 + 大按钮（开始=橙 / 完成=绿）。

任务类型文案由奖励档分类派生（`未设置奖励档 → 未分类`，与 Demo 一致；此前把 `NULL` 当"悬赏"是错的，已改）。

### 15.3 本周打卡栏（对齐 Demo）

| 项 | 第一版（误） | 现（按 Demo 实测比例） |
|---|---|---|
| 标题 | 「🔥 本周打卡」小字 | 「本周打卡」主标题 + 右侧 `已点亮 x/7 天` |
| 周几标签 | 格子**下方** | 格子**正上方** `周一…周日` |
| 格子形状 | **全宽矩形**（`w-full h-10`）❌ | **正方形 40×40**（Demo 实测：宽≈高，格子间隙≈格宽 1/2 → 现格间 ≈16px） |
| 格子内容 | `✓`/日期数字 | `✓` 绿（已打卡）/ `★` 琥珀（今天未打卡）/ `·` 米色（未打卡） |
| 装饰 | — | 像素描边 + 硬阴影；今天额外 accent 圈（`data-checkin-state` 可测） |

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

**修正后验证（66 条）**：按 Demo 实测比例改小卡片/改方格后，断言增至 **66 条全绿（31 秒）**，
新增几何回归：卡片图标 **28–48px**（防再做大）、打卡格**正方形（宽高差 ≤2px）**、
**不铺满整宽（≤56px）**、**格间留白 ≥8px** —— 把"比例"这类主观项变成可断言项，避免下次再靠感觉调。

---

## 16. 用户实测第二轮修复（2026-10-06）：当前时间线改横线 + 导航不再遮挡

用户用截图指出日程页两个问题：

| # | 现象 | 根因 | 修复 |
|---|---|---|---|
| 1 | 当前时间线是**竖线**，应为**横线** | `current-time-line.tsx` 实现为 `h-full w-[2px]`（从"现在"画到底部），源自 §5.4 原文"2px 竖线"；实现后用户看图才判定不符直觉 | 改为**横线**：`h-[2px] w-full` + 左端像素方块 + 右端 `HH:mm` 标签（`data-current-time-line` 可测）；文档 `schedule-two-day-design.md §5.4/§7#3`、`p2-ui-ux-review.md §6` 同步改为横线（**避免下次按旧文档改回竖线**） |
| 2 | 日程表被**底部导航压住** | 导航是 `sticky bottom-2` 的**浮层**，靠 `main` 的 `pb-28` 兜底；62vh 网格未滚到底时必然被盖住（§11.3 只断言"滚到底后 gap≥0"，掩盖了真问题） | 外壳改为 **`flex h-[100dvh] flex-col`**：`header` / `main`(flex-1 + `overflow-y-auto`) / `nav`(独立一行) → 导航不再浮在内容上，任何滚动位置都不重叠（实测 `main 底 729 = nav 顶 729`，gap 0）。断言由"滚到底 gap≥0"升级为**结构性检查**（`main.bottom <= nav.top`） |

**验证**：`browser-check` 66 → **70 条全绿（32 秒）**，新增两条关键断言：
- **固定时钟技巧**：当前时间线只在 07:30–21:30 内渲染，真实时间不满足时断言会"空过"。检查脚本用
  `Page.addScriptToEvaluateOnNewDocument` 注入 `MockDate`（固定本地 14:00）后再断言 →
  实测输出 `时间线 271x2 标签=14:00`（宽 >> 高 = 横线），用完后移除注入恢复真实时钟。
- 布局断言：`main` 底与 `nav` 顶相邻（gap ≥ -1px），日程网格滚到底也不越过导航顶。

---

## 17. 用户实测第三轮（2026-10-06）：格线颜色（主题层根因）/ 时间胶囊 / 表头对齐

用户对着截图提三条：① 框线是灰色、很浅看不清，要用比背景略深的颜色；② 当前时间标签应在**左侧、与时间轴同列**，且外面是**椭圆（胶囊）**不是方形；③「今天/明天」中间的竖线与下方**没对齐**，两列应等宽。

### 17.1 ① 的根因是**主题层的坑**（影响全站，不止日程页）

实测格线颜色 = `rgb(229, 231, 235)` —— 那是 **Tailwind 默认边框灰**，而我们写的是 `border-ink/30`。原因：

> 主题色此前定义为 `ink: 'var(--ink)'`。Tailwind 的**透明度修饰**（`/30`）需要颜色带 alpha 通道占位，
> 对裸 `var(--ink)` **无法生成**对应工具类 → 元素没有 `border-color`，退回 preflight 默认灰 `#e5e7eb`。
> 即：`border-ink/30`、`bg-panel/10`、`bg-accent/5`、`text-panelLight/80`、`divide-ink/40`……
> **全站所有 `/透明度` 类此前都没生效**（一直是默认值/透明），只是日程页那种大面积格线把它暴露得最明显。

**修复（一次性根治）**：`index.css` 每个 token 同时给 hex 与 **RGB 通道**两份；
`tailwind.config.ts` 改用 `rgb(var(--x-rgb) / <alpha-value>)`。
约定已写入 `docs/ui-reference.md §1.1`（新增主题色必须两份都给）。

### 17.2 ② 当前时间胶囊

- 标签由"横线右端的方形框"改为**左侧时间刻度栏内的红色胶囊**（`w-14` 铺满刻度栏、`rounded-full`、白字、垂直居中对齐横线），与参考的 iOS 日历一致；
- 横线仍横穿今天列（`data-current-time-line` / `data-current-time-label` 可测）。

### 17.3 ③ 表头与表体对齐

- 现象：表头分格线 x=646，表体 x=641（差 **5px**）。
- 根因：表头在滚动容器**外面**，而表体滚动容器有 **10px 垂直滚动条**占宽 → 表体两列被压窄 10px，中线左移 5px。
- 修复：把**表头移进同一个滚动容器**（`sticky top-0`，左侧刻度栏同时 `sticky left-0`），
  表头/表体共用同一宽度与同一套结构（`w-14 + border-r-2 + grid-cols-2 + divide-x-2`）→ 列宽与分格线天然一致。
- 顺带：滚动条主题化（`index.css` 的 `scrollbar-*`），不再是浏览器默认灰。

**验证**：`browser-check` 70 → **80 条全绿（33 秒）**，新增 10 条中与本次相关的实测输出：

| 断言 | 实测值 |
|---|---|
| 表头与表体分格线对齐（\|Δ\| ≤ 2px） | 表头 x=**641** = 表体 x=**641** |
| 表头/表体两列等宽（\|Δ\| ≤ 1px） | 表头 `[284,284]`、表体 `[284,284]` |
| 格线比背景深（亮度差 ≥ 12） | 格线 `rgba(74,51,38,0.3)`（亮度 55）vs 背景（亮度 147） |
| 时间标签在左侧刻度栏内 + 胶囊 | left=301 < 列左 357；圆角 **9999px**；56×16 |
| 无文档级滚动 + 导航是外壳最后一个元素 | doc 高 803 = 视口 803；nav 底 791；lastChild 含 nav=true |

---

## 18. 用户实测第四轮（2026-10-06）：整页滚动 / 任务取消 / 时间冲突显示

用户提两条：① 日程表要**整个可以滑动**，滑动后上方日期条也跟着滚；② **任务没有取消功能**，且**同时间段的两个任务都能创建成功**，应该有冲突显示。

### 18.1 日程整页滚动（去掉网格内部滚动）

| 项 | 之前 | 现在 |
|---|---|---|
| 滚动方式 | 网格自身 `max-h-[62vh] overflow-auto`（内部滚动） | **整页滚动**（网格不再内部滚动，`main` 是唯一滚动容器） |
| 上方日期条 | 不随网格滚动而移动（观感"卡住"） | **跟着一起滚走** |
| 表头（今天/明天） | 网格内部 sticky | 仍 `sticky top-0`（相对 `main`）——滚动时**表头固定**、日期条滚走 |

实测：网格自身可滚 `0px`；滚动 240px 后日期条 98 → **-142**、表头 236 → 98（钉在 `main` 顶 82 + `pt-4` 16 内）。

### 18.2 任务取消（前端此前完全没有入口）

`DELETE /tasks/:id` **后端早就有**（软删除；`completed` → 409 `task_not_deletable`），但前端零入口 —— 用户反馈"任务没有取消功能"。

- 任务卡展开区新增「取消任务」（红色，`data-cancel-task`）+ **二次确认弹窗**（Radix AlertDialog，`data-confirm-cancel`）；
- 完成后失效 `['tasks']`/`['approvals']` 缓存；`409` → "已完成的任务不能取消"、`403` → 无权限；
- 已完成的卡片不显示该按钮（与后端规则一致）。

### 18.3 时间冲突：并排显示 + 冲突标记 + 创建时提示

**契约层新增纯函数** `packages/shared-types/src/schedule-conflict.ts`（Web/Mobile 共用，只吃"当天分钟数"，不碰日期/时区）：

| 函数 | 作用 |
|---|---|
| `overlapMinutes` / `isOverlapping` | 重叠判定（**首尾相接不算冲突**） |
| `findOverlaps` | 与候选时间段重叠的已有任务（创建/编辑提示用） |
| `assignLanes` | **车道打包**（区间图贪心着色：重叠分不同车道、不重叠复用车道），返回 `lane` 与连通组 `laneCount` |

**产品决策（重要）**：**允许**时间重叠（家庭场景常见，例如两件事并行），因此：
- 创建/编辑时**只提示不阻止**（红框列出冲突任务与时段，注明"仍可保存"）；
- 日程上**并排渲染**（每块宽 `100/laneCount%`）且冲突块**红实线描边 + ⚠**，不再互相遮挡。

落地：`two-day-grid.tsx`（并排 + `data-task-block`/`data-lane`/`data-conflict`）、`schedule-chip.tsx`（`conflicting` 样式）、`task-create-sheet.tsx`（`data-conflict-warning`）。
算法思路参考 Kaneo `packWeekLanes`（已登记 `opensource-mapping.md` §一）。

**验证**：`browser-check` 80 → **91 条全绿（40 秒）**，本批新增 11 条，实测值：

| 断言 | 实测 |
|---|---|
| 网格自身不再内部滚动 | 可滚 **0px** |
| 滚动后日期条跟着滚走 | 98 → **-142** |
| 滚动后表头仍固定 | 236 → 98（`main` 顶 82） |
| 同时间段两个任务都渲染（不遮挡） | 2 个块，left **360 / 505**、各宽 **140** |
| 分属不同车道 + 并排等宽 | lane 1/2 与 2/2；宽度差 0 |
| 冲突标记 | 2 个 `chip[data-conflict=true]` |
| 取消任务：二次确认 + 真删除 | 弹窗出现 → 确认后卡片从列表消失 |
| 创建时冲突提示 | "⚠️ 时间冲突：该时段已有 2 个任务 · 冲突B（15:00–16:00）· 冲突A（15:00–16:00）" |

---

## 19. 用户实测第五轮（2026-10-06）：任务颜色改为日程实色底 + 等级 UI 重做

用户提两条：① 新建任务里选的颜色"效果不对"——应改为**换掉日程上对应任务块的底色**（不是虚线边框），底框**可以有弧度**、字体**白色**以增强对比；② 同意换掉左上角头像并重做等级 UI（附参考图：**等级徽章 + 条内文字 "25 / 30 XP"**）。

### 19.1 日程任务块：实色底 + 圆角 + 白字

| 项 | 之前 | 现在 |
|---|---|---|
| 选了颜色的任务 | 虚线边框 + 一枚小色点（颜色几乎看不出） | **实色底 = 所选颜色**、圆角 ounded-md、**白字**、冲突时加红色 ring |
| 未选颜色的任务 | 虚线中性块 | 保持虚线中性块（与 Event 实色仍可区分） |

> **文档偏差已登记**：schedule-two-day-design.md 原定"Task=虚线 / Event=实色"的视觉区分，现改为
> "**带颜色的 Task 也是实色**、不带颜色才虚线"——用户明确要求；Event（P5）仍走实色 + 硬阴影，两者靠硬阴影与业务入口区分。

### 19.2 头像与等级 UI

| 项 | 变更 |
|---|---|
| 头像 | 手绘 16×16 像素头像 → **Kenney Toon Characters（CC0）头肩像**：Female person/PNG/Poses/character_femalePerson_idle.png 取 alpha 包围盒上部 78% 裁切、补正方形、128px LANCZOS（脚本 isualasset/build_avatar_toon.py）；像素头像保留为备用 |
| 等级 UI | 表头与成长页统一为 **「等级数字徽章 + 经验条」**，经验文字（cur / need XP）**写在条内居中**、白字带描边；条为 2px ink 描边 + 圆角；新增主题色 --xp（蓝 #3f6bab，含 --xp-rgb，遵循 RGB 通道约定） |
| 表头布局 | 头像 + 徽章 + 经验条占满可用宽度（lex-1），右侧角色/家庭/退出不变；日期与累计 XP 收在经验条下方一行 |

### 19.3 验证

rowser-check 91 → **100 条全绿（39 秒）**，本批新增 9 条，实测输出：

| 断言 | 实测 |
|---|---|
| 任务块背景 = 所选颜色 | gb(59,130,246)（蓝）/ gb(74,158,107)（绿） |
| 任务块文字白色 / 圆角 / 非虚线 | gb(255,255,255)、radius **6px**、order-style: solid |
| 等级徽章显示数字 | badge = 1 |
| 经验文字在条内且形如 cur / need XP |   / 100 XP，label 矩形完全落在 bar 内 |
| 经验条圆角 + 头像换成 toon | radius 6px、img[src$=avatar-girl-toon.png] |
| 成长页等级 UI 同款 | [data-xp-label] 文本匹配 \d+ / \d+ XP |

---

## 20. 用户实测第六轮（2026-10-06）：等级 UI 对齐参考图 / 头像换女冒险者 / 删除入口补到详情页

### 20.1 等级 UI：对齐用户给的参考图

用户指出上一版与参考的差距：**参考外面还有一个框**、**条有阴影（更立体）**、**颜色不对且很平**、**"经验条超过数字后可以是白色，不然应该是深色，不然看不清字"**。

| 项 | 上一版 | 现在（对齐参考） |
|---|---|---|
| 外框 | 无（徽章与条直接摆在深色表头上） | **外框**：`border-2 border-ink` + `bg-panelLight` + `shadow-pixel`（硬阴影 4px 4px 0，实测 `rgb(58,42,30) 4px 4px 0px`） |
| 条填充 | 中蓝 `#3f6bab`、无立体感 | **深蓝 `#3a5a95`**（新增 token `--xp`/`--xp-rgb`）+ **上下内阴影**（`inset 0 2px 0 rgba(255,255,255,.3)` / `inset 0 -2px 0 rgba(0,0,0,.35)`） |
| 条余量 | 米黄 panelLight（与填充接近，看不出进度） | **白色**（`bg-white`），进度对比明显 |
| 经验文字 | 白字压在米黄余量上 → 进度低时看不清 | 数字**自带深色底**（`bg-xp`），**任何进度下都压在深色上**（实测 `labelBg == fillBg == rgb(58,90,149)`） |

### 20.2 头像换成女冒险者

用户"换一个好看一点的" → 先用 `visualasset/_avatar_candidates.py` 生成 **11 个候选**（Female/Male person、Female/Male adventurer、Robot × idle/cheer/show/talk）对照挑选，
选定 **Female adventurer（红发 + 绿衣 + 挎包）idle**（原为 Female person）；备选同角色 `cheer0`（欢呼）。素材登记已同步 `opensource-mapping.md`。

### 20.3 删除入口：改名 + 补到详情页

用户第二次反馈"任务还是没有删除功能"。上轮只加在**任务卡展开区**，可发现性不足，本轮：
- 名称由「取消任务」改为醒目的 **「删除任务」**（红色实底）；
- **任务详情页**右上角新增 **「删除」**（与「编辑」并列，`data-delete-task`），删完自动回「今日」；
- 失败文案：已完成 → "已完成的任务不能删除"、403 → 无权限。

### 20.4 验证

`browser-check` 100 → **109 条全绿（41 秒）**，本批新增 9 条，实测值：

| 断言 | 实测 |
|---|---|
| 等级区有外框（2px 描边） | borderTopWidth = **2px** |
| 外框有像素硬阴影 | `rgb(58,42,30) 4px 4px 0px` |
| 经验条余量为白色 | `rgb(255,255,255)` |
| 填充为深蓝 + 有内阴影 | `rgb(58,90,149)` / `inset … rgba(255,255,255,.3)`、`inset … rgba(0,0,0,.35)` |
| 数字自带深色底 | labelBg == fillBg == `rgb(58,90,149)` |
| 详情页有删除按钮 + 删完回今日 + 落库确认 | `[data-delete-task]` 存在；pathname `/`；列表查不到该 id |

> 顺带修掉一处自造断言：正则 `/rgba?\\(/` 多转义导致脚本 SyntaxError（已改为 `/rgba?\(/`）。

---

## 21. 用户实测第七轮（2026-10-06）：顶部信息栏结构与样式重做（**含一次做错后回退**）

用户给出参考图与当前实现图，要求只改样式/布局（**不动 XP 计算、等级规则、接口与其它功能**）。

### 21.1 第一次做错了（已回退）

第一版把「等级数字 + XP 条」整体套进一个双层大外框（`PixelFrame`：外层 2px 深棕 + 2px 暖棕 + 内层 2px），
并把 XP 文字做成带 `bg-xp` 深色底的小块。用户指出这形成了**"大框套小框"**，且 XP 文字像"条下方又一块独立区域"（视觉上成了上下两层进度条），
要求**先回退再按结构重做**。

**回退动作**：`git checkout 85f0fe9 --` 恢复 `app-layout.tsx` / `GrowthPage.tsx` / `index.css` / `tailwind.config.ts` / `browser-check.mjs`；
**删除** `apps/web/src/components/ui/pixel-frame.tsx`（用户明确：不要靠叠加边框做像素风，不要重新引入）。

### 21.2 订正后的正确结构（三个互相独立的组件）

```
[头像框]   [ 1 ]   [ XP 条：蓝已完成 + 米未完成 + 文字叠加居中 ]
                  10月6日 周二 · 累计 20 XP
```

| # | 组件 | 实现 |
|---|---|---|
| 1 | 头像框 | 独立小框 `border-2 border-ink bg-panelLight p-0.5`（内边距仅 **2px**，贴着头像），内部 `img` 用 `object-contain` |
| 2 | 等级数字 | 独立小方框 `h-9 w-9 border-2 border-ink bg-accent`，与 XP 条横向并列（**不共外套**） |
| 3 | XP 条 | `border-2 border-ink bg-panel`，**边框只包进度条本体**；内部仅两层：填充层（`absolute inset-y-0 left-0` `bg-xp` + 上下斜角）与文字层（`absolute inset-0 grid place-items-center`，**无底色**，白字 + 深色描边） |

- 三者同为 `h-9`（36px）→ **等高**；`items-start` → **顶部对齐**；间距统一 `gap-2`；
- 日期与累计 XP 移到整行**下方**；
- 颜色沿用参考采样值：填充 `#444e69` + 斜角 `#66799e`/`#2e3957`，未填充浅米色 `panel`；
- 窄屏 360px：角色文字 `hidden sm:inline-block` 让宽度（否则 XP 条被挤到不足 80px）。

### 21.3 验证

`browser-check` 109 → **121 条全绿（43 秒）**；本批断言全部针对**结构**而非像素：

| 断言 | 实测 |
|---|---|
| 三组件各有边框（均 2px） | avatar 2 / badge 2 / bar 2 |
| 等级框与 XP 条是同一父级兄弟，父级无边框 | `parentBorder = 0`、`parentIsShared = true` |
| 父级无底色（不存在包住等级+XP 的大矩形） | `parentBg = rgba(0,0,0,0)` |
| 更外层无边框（不形成套娃） | `grandBorder = 0`、且该层含头像 = true |
| 三组件等高 / 顶部对齐 | `heights=[36,36,36]`、`tops=[12,12,12]` |
| 头像框贴身 | `avatarPad=[2,2]` |
| XP 文字无独立底色块 + 绝对定位 + 整条居中 | `labelBg=透明`、`position=absolute`、`labelCentered=true` |
| XP 条只有一个水平面 | `fillCoversInner=true`、条内子元素仅 **2** 个（填充 + 文字） |
| 未填充浅米色 / 填充深藏蓝 | `rgb(242,229,201)` / `rgb(68,78,105)` |
| 窄屏 360：无溢出 / 头像不缩 / 条 ≥80px / 文字在条内 / 仍顶部对齐 | overflow 0、头像 28px、条 **152px**、全部 true |

> 教训记入 `docs/ui-reference.md §1.2`：像素感来自"少量描边 + 暖米色底 + 深蓝进度 + 统一厚度 + 清晰间距"，不是靠叠加边框；
> 结构上禁止给「等级 + XP 条」再套外框，也禁止给 XP 文字加底色块。

### 21.4 第二版订正：**高头像 + 低状态条**（底部对齐）

用户进一步澄清：不是把 XP 条宽度缩短，而是把【等级 + XP】**整体高度缩到约一半**，并与头像**底部对齐**，
形成"高头像 + 低状态条"的层级；且等级框与 XP 条**直接相连**视为一个连续组件。

| 项 | 第二版（上一轮） | 现在 |
|---|---|---|
| 结构 | 三个等高组件（头像框/等级框/XP 条）横向排列 | **头像（高） + 【等级+XP】连续组件（低）** |
| 对齐 | `items-start` 顶部对齐 | **`items-end` 底部对齐**（不是垂直居中） |
| 高度关系 | 三者均 h-9（36px）等高 | 头像框 **36px**、状态组 **h-5（20px）≈ 56%** |
| 等级框 ↔ XP 条 | `gap` 分开 | **`-ml-0.5` 让边框重叠 2px → 共享一条缝（直接相连）** |
| 与头像距离 | gap-2 | `gap-1.5`（6px，靠近头像） |

实测（`browser-check`）：

| 断言 | 实测 |
|---|---|
| 头像框保持现有尺寸 | 36px（图 28px） |
| 状态组约为头像高度一半（0.4–0.7） | **0.56** |
| 底部与头像框底部对齐（\|Δ\| ≤ 1px） | `bottomDelta = 0` |
| **不是**垂直居中 | `centerDelta = 8px` |
| 等级框与 XP 条直接相连 | `seam = -2`（边框重叠一条缝） |
| 紧靠头像 | 6px |
| 分组与行容器无边框/无底色 | groupBorder 0、rowBorder 0、bg 均透明 |
| XP 文字无底色 + 绝对定位 + 居中；条内仅两层 | labelBg 透明、position absolute、labelCentered true、`barChildren = 2`、`fillCoversInner = true` |
| 窄屏 360px | 无溢出、条 180px、仍底部对齐 |

`browser-check` 121 → **122 条全绿（42 秒）**。
（本轮唯一的 FAIL 是我自己的断言写错：把 "直接相连" 写成 `|seam| ≤ 1`，而设计意图是 `seam = -2` 的边框重叠，已改为 `-2 ≤ seam ≤ 0`。）

---

## 22. 用户实测第八轮（2026-10-06）：「今日冒险」进度条游戏化（像素外框 + 进度标记 + 动画）

用户要求（**不改任务统计逻辑**，只改进度条表现）：① 进度条加完整多层像素边框（深棕粗描边 + 暖棕内层，条本体不贴外框，与页面其它像素 UI 同厚/直角）；
② 在"已完成/未完成"交界处加一个**跟随百分比移动**的像素图标（约条高 1–1.5 倍，不固定最右）；
③ 进度变化时播放 500–800ms 轻量动画（平滑增长 + 图标跟随 + 到达时轻微弹跳，可加极轻微粒子/高亮），**首次加载不播放**；
④ 100% 时标记到最右 + 克制反馈 + 文案变「今日冒险完成！」。

### 22.1 实现（新组件 `apps/web/src/components/adventure-progress.tsx`）

| 项 | 做法 |
|---|---|
| 多层像素边框 | 外层 `border-2 border-ink bg-inkSoft p-[2px]`（暖棕层由外层背景在 padding 处露出）→ 内层 `border-2 border-ink bg-panelLight p-[3px]` → 条本体 `h-4 border-2 border-ink bg-panel`（**与边框留白 3px，不贴框**） |
| 进度标记 | **复用角色头像** `/avatar-girl-toon.png`（20px ≈ 条高 1.25 倍），`left = percent%` + `translate(-50%,-50%)`，夹在 2.5%–98.5% 内（100% 时右缘贴终点） |
| 平滑增长 | 宽度与标记 `transition-[width]/[left] 620ms ease-out` |
| 到达反馈 | 标记 `pixel-marker-pop`（1 → 1.28 → 0.96 → 1，420ms）+ 5 枚 `pixel-spark` 像素粒子（620ms 淡出）；**100% 时**额外一次 `pixel-sheen` 高亮扫过 |
| 首次加载不播放 | 组件按 `ready`（`tasksQuery.isSuccess`）门控 + `initialized` 基准：**首次拿到数据只同步、不播放**；仅在就绪后百分比变化时播放 |
| 100% 文案 | `已完成 x/y 个任务 · 进度 100%` + `今日冒险完成！`（带 `/icons/chest.png` 宝箱图标，复用现有素材） |
| 无障碍 | `prefers-reduced-motion: reduce` 下关闭三种动画 |
| 未引入依赖 | 纯 CSS keyframes（`index.css`）+ 现有素材，无新库 |

### 22.2 验证

`browser-check` 122 → **137 条全绿（47 秒）**，本批新增 15 条；实测值：

| 断言 | 实测 |
|---|---|
| 多层像素外框 | 外层 `border=2px`、暖棕层 `rgb(122,92,56)`；内层 `border=2px`、米白 `rgb(247,237,217)` |
| 条本体不贴外框 | 内边距 **3px** |
| 条本体 2px 描边 + 米色底 | `border=2px`、`rgb(242,229,201)` |
| 标记尺寸约条高 1–1.5 倍 | 条高 16px、标记 **20px** → **1.25×** |
| 标记跟随百分比 | 与理论位置偏差 **1px**；距右端 **437px**（未固定最右） |
| 平滑增长 | 宽度与标记过渡均 **0.62s** |
| **首次加载不播放** | 重新加载后 `data-marker-pulse` 为 false |
| 完成任务后播放 | 行内点「✓ 完成」→ 轮询到 `data-marker-pulse="true"`（弹跳 + 粒子），~1.4s 后恢复静止，且百分比确实增加 |
| 100% 状态 | `data-progress-percent=100`、`data-progress-complete=true`、标记右缘距终点 **1px**、文案 **「今日冒险完成！」** |

> 过程中修正两处**我方问题**：
> ① 断言一开始取了错误的 DOM 层级（暖棕层实为外层容器背景，不是独立子元素）→ 改为直接测外层背景色；
> ② 100% 用例只到 75%——因为带审批的任务**正确地**卡在 pending 闸门，测试脚本补上"家长批准待审批项"这一步（这也是真实业务路径）。
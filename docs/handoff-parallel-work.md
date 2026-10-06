# 并行开发交接说明（给另一个窗口 / 另一个 Agent）

> 目的：让两个窗口同时改这个仓库而不互相覆盖。**先读本文，再动手。**

## 1. 当前状态（2026-10-06）

| 项 | 值 |
|---|---|
| 运行方式 | Docker 三容器：`huahua-postgres`(5432) / `huahua-api`(:3000) / `huahua-web`(nginx **:18080**) |
| 打开地址 | **http://localhost:18080**（用 `localhost`，不要用 `127.0.0.1`，CORS 只放行配置里列出的 Origin） |
| 仓库 | `github.com/hasuanmi/adventure`（`origin main`），**CI 全绿**：typecheck+build / API 冒烟 42 条 / 真实浏览器 UI 检查 151 条 |
| 已完成 | P0 脚手架·认证·Docker、P1 后端、P2 Web 收口（家庭、审批、日程、任务闭环）、**P4 打卡**（2026-10-06，见 `p2-closure-record.md §23`） |
| 未开始 | P3 移动端（用户已暂停）、P5 Event+日历、P6 错题本（**设计已调研，见下**） |
| P6 调研结论 | `docs/wrong-notebook-feature-inventory.md`（上游项目全功能盘点）。**三个阻塞项**：① 上游无 LICENSE 文件（README 仅一行 "MIT License"）② 其图片是 base64 直存 DB（必须重做）③ 间隔复习是死代码（零调用点）。另有 7 处认证/越权缺口**不得继承** |
| 关键文档 | `docs/p2-closure-record.md`（当前进度与教训）、`docs/deployment.md`、`docs/P1-人工验收指南.md`、`docs/opensource-mapping.md`（开源复用登记，**新增复用必须登记**） |

## 2. 分工（按文件范围隔离，别抢同一文件）

| 归谁 | 范围 |
|---|---|
| 窗口 A（写本文的窗口） | `.github/workflows/**`、`scripts/**`、`docs/p2-closure-record.md`、`docs/deployment.md` |
| 窗口 B（新窗口，建议） | `apps/web/src/**`、`apps/api/src/**`、`packages/shared-types/src/**`、新增文档 |

需要动对方范围的文件时，先在对话里说一声；**不要两边同时改同一个文件**。

## 3. 硬规则（踩过的坑，务必遵守）

1. **提交只用明确路径**：`git add -- <具体文件>`。**禁止 `git add -A` / `git add .`** ——
   本工作区有并行产出，已发生过一次误提交（把 `visualasset/` 素材和 `__pycache__` 一起提交了）。
2. **推送前先同步**：`git pull --rebase`，**不要 `--force`**；同一时刻只让一个窗口提交。
3. **提交前先看 `git status`**，确认没有别人的在制品、没有临时文件（日志/截图/构建产物）。
4. **Docker 重建要打招呼**：`docker compose up -d --build web` 会替换别人正在看的页面；
   重建后等 3–5 秒再刷新。别同时重建。
5. **别抢端口**：Web 18080 / API 3000（容器内）。Windows 保留端口会漂移，
   新起端口前先 `netsh int ipv4 show excludedportrange protocol=tcp`。
6. **受限沙箱**：`pnpm <script>` 可能报 `spawn EPERM`，改为直接调
   `node node_modules/typescript/bin/tsc` / `node node_modules/vite/bin/vite.js`。
7. **真实浏览器验证优先**：纯前端交互问题（点击/默认值/布局）typecheck 与 API 冒烟都抓不到。

## 4. 验证命令（提交前至少跑前两条）

```powershell
# ① 类型检查（三包）
cd apps/web; node ..\..\node_modules\typescript\bin\tsc -p tsconfig.json --noEmit
# ② 真实浏览器 UI 检查（14 条断言，含登录/刷新保持登录/日期点击/默认时段/导航遮挡；会自动造数据并清理）
cd C:\Users\48489\Desktop\time; node scripts/browser-check.mjs --out .\ui-shots
# ③ API 冒烟（42 条，走 nginx）
$env:SMOKE_BASE = 'http://localhost:18080/api'
Invoke-Expression (Get-Content -Raw .\scripts\p2-smoke.ps1)
```

> 截图会输出到 `ui-shots/`（已 gitignore），可作为人工复核凭据。

## 5. 已知未决 / 待确认（别重复决定）

- ~~**当前时间线**~~ **已定并已改**：现为**横线**（左端像素方块 + 右端 `HH:mm` 标签），见 `docs/schedule-two-day-design.md §5.4`；不要再按旧的"竖线"描述改回去。
- ~~底部导航遮挡日程网格~~ **已结构性修复**：外壳改为 `flex h-[100dvh]` 列（`main` 自身滚动、导航独占一行），见 `docs/p2-closure-record.md §16`。
- `POST/GET /api/files` 上传未实现（凭证目前是文本描述）。
- ESLint/Prettier 未接入 CI；`main` 分支保护未开。
- 库里遗留早期验收测试账号（`parent1`/`child1`/`rp*`/`dc*` 等）；用户自己的 `miluyao`(家长)、`ziling`(孩子) 在用，**不要删**。
- 奖励档位：统一走默认档，不做任务类型精确映射（用户已确认）。

## 6. 产品/架构硬约束（改代码前必须遵守）

- **没有 Family 模块/表**：家庭只靠 `users.family_id` 单列关联（《新项目V1》§3.5）。
- 每张业务表都必须有 `family_id`；枚举一律 `VARCHAR` + 应用层白名单（不用 DB ENUM）。
- 软删除用 `deleted_at`；幂等靠手写 partial unique index。
- 错误体统一 `{ error, reason, fields? }`（全局 `ApiExceptionFilter` 已归一 class-validator 的 400）。
- 审批模块必须保持业务无关：label 等信息由业务侧注册 `descriptor`（见 `docs/opensource-mapping.md` §二点十）。
- 开源复用纪律：不引入 GPL/AGPL；复用必须登记 `docs/opensource-mapping.md`；错题本方向只能 clean-room。

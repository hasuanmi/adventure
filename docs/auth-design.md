# Auth 机制设计（P0 落地稿）

> 版本：v1.0 · 2026-10-05
> 依据：v1.2 主架构文档 §3.6 + `docs/client-architecture.md` §6（Web Cookie + Mobile SecureStore/Bearer 双通道）
> 本稿在 Auth 实现前落实具体机制；实现必须与本稿一致。

---

## 1. 目标与约束

- 单后端、双客户端：Web（浏览器）+ Mobile（React Native + Expo）。
- **同一 `/auth/refresh` 端点双通道**：Web 走 httpOnly Cookie；Mobile 走 `Authorization: Bearer`。
- 最小认证：`role` 枚举（child/parent/teacher）仅做最小校验与 UI 分支；无 RBAC、无权限矩阵。
- Access 有效期 30 分钟；Refresh **每次使用即轮换**；**重放检测 = 撤销整个 token 族**。

## 2. 凭据形态

| 凭据 | 格式 | 存储 |
|---|---|---|
| Access Token | JWT（HS256），claims：`sub`=userId、`role`、`jti`、`iat`、`exp`（30min） | 客户端内存（Web）/ SecureStore（Mobile，可选缓存）；服务端不存 |
| Refresh Token | 不透明随机 256-bit（`crypto.randomBytes(32)` → base64url） | 服务端仅存 **SHA-256 哈希**；客户端：Web httpOnly Cookie / Mobile SecureStore |

## 3. 数据表 `refresh_tokens`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| userId | uuid FK → users（Cascade） | |
| tokenHash | text UNIQUE | sha256(明文 token) |
| familyId | uuid | 旋转链族 ID（同一次登录链 = 同族） |
| expiresAt | timestamptz | 默认 30 天（`REFRESH_TTL_DAYS`） |
| usedAt | timestamptz? | 消费（轮换）时间；非空 = 已使用 |
| replacedByTokenHash | text? | 轮换产生的下一枚（审计） |
| revokedAt | timestamptz? | 登出/全撤/重放惩罚 |
| ip / userAgent | text? | 审计（可选） |
| createdAt / updatedAt | timestamptz | |

索引：`userId`、`familyId`、`tokenHash`(UNIQUE)。

## 4. 双通道传输协议

- **通道识别**：客户端在登录/刷新请求带 `X-Auth-Channel: mobile`（Mobile）或省略（Web 默认）。后端据此决定响应形态，避免把 refresh 泄漏给浏览器 JS。
- **登录/刷新成功响应**：
  - body 始终含 `{ accessToken, user }`（两端一致）；
  - **Web（无 X-Auth-Channel）**：`Set-Cookie: rt=<refresh>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=<REFRESH_TTL_DAYS>d`（生产 HTTPS 才发 Secure；开发 http 不强制）；**body 不含 refreshToken**；
  - **Mobile（X-Auth-Channel: mobile）**：不 Set-Cookie；body 含 `refreshToken` 字段（客户端存 SecureStore）。
- **`/auth/refresh` 取令牌优先级**：`Authorization: Bearer` → Cookie `rt`。二者都无 → 401。

## 5. 轮换（Rotation）

`POST /auth/refresh` 流程：
1. 取令牌（Bearer 或 Cookie）→ sha256 查 `refresh_tokens`；
2. 校验：存在、未过期（`expiresAt > now`）、未撤销（`revokedAt IS NULL`）；
3. **已使用检测**：`usedAt IS NOT NULL` → 判定重放 → **撤销整个 familyId**（同族全部 `revokedAt=now`）→ 401 `reason=refresh_reused`；
4. 消费当前令牌：`usedAt=now`；
5. 签发新 Refresh（随机、新哈希、**同 familyId**）+ 新 Access；
6. 响应：按 §4 通道返回；`replacedByTokenHash` 记录旧→新。

> 每次刷新换新 Refresh；旧 Refresh 一旦使用即作废（即使被窃取，重放会触发全族撤销）。

## 6. 重放检测与撤销（Reuse & Revoke）

- **重放**：已 `usedAt` 的令牌再次提交 → 全族撤销 + 401 `refresh_reused` → 客户端必须重新登录。
- **登出**：`POST /auth/logout`：撤销当前提交令牌（`revokedAt=now`）；Web 同时 `Set-Cookie: rt=; Max-Age=0`；返回 204。`?all=true` 撤销该用户全部令牌（P0 支持）。
- **访问令牌撤销**：V1 不做黑名单；登出后 Access 在 ≤30min 内仍有效（文档明示，接受该窗口）。

## 7. 端点与错误语义

| 端点 | 行为 | 错误 |
|---|---|---|
| `POST /auth/register` | `{ username, password, role? }` → 201 `{ user }` | 400 校验 / 409 `username_taken` |
| `POST /auth/login` | `{ username, password }` → 200 `{ accessToken, user, refreshToken? }` + Set-Cookie | 401 `invalid_credentials` / 429 限流 |
| `POST /auth/refresh` | → 200 `{ accessToken, refreshToken? }` + Set-Cookie | 401 `refresh_reused` / `refresh_invalid` / `refresh_expired` |
| `POST /auth/logout` | 撤销当前令牌 → 204（`?all=true` 全撤） | 401 |
| `GET /auth/me` | JwtAuthGuard → 200 `{ user }` | 401 |

统一错误体：`{ error, reason, fields? }`；HTTP：400/401/403/404/409/429。

## 8. 密码与密钥

- 密码：`crypto.scrypt`（内置，无原生依赖），随机盐 16B，输出 64B，存 `salt:hash`（hex）。
- JWT 签名：HS256，`JWT_SECRET`（≥32 字节随机，环境变量注入，不入库/不入库）。
- Refresh 哈希：SHA-256。
- Cookie：`HttpOnly; Secure(生产); SameSite=Lax`。

## 9. 明确不做（P0）

- RBAC / 权限矩阵 / 角色管理 UI；访问令牌黑名单；多设备会话管理 UI；OAuth/第三方登录；MFA。
- 登录限流采用最小内存固定窗口（`auth` 模块内，非独立模块）。

## 10. 实现落点

| 文件 | 内容 |
|---|---|
| `apps/api/prisma/schema.prisma` | `User` + `RefreshToken` |
| `apps/api/src/auth/` | `auth.constants.ts`、`dto/*`、`auth.controller.ts`、`auth.service.ts`、`jwt-auth.guard.ts`、`jwt-payload.interface.ts` |
| `apps/web/src/lib/api/auth.ts` + `pages/login.tsx` | Cookie 通道登录/刷新/登出 |
| `apps/mobile/src/...` | SecureStore + Bearer 通道登录/刷新/登出 |
| `shared-types/src/auth.ts` | DTO 与 `reason` 常量（两端共用） |

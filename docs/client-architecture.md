# 客户端架构（Client Architecture）

> 版本：v1.0 · 2026-10-05
> 性质：架构设计文档（只分析、设计，不写代码）
> 关联：主架构文档《新项目V1-开源模块整合架构方案.md》（v1.2）

---

## 1. Web + Mobile + Backend 总体架构

```text
Web Client（React + Vite）──────┐
                                ├──→ Backend API（NestJS，唯一业务规则）──→ PostgreSQL
Mobile Client（React Native + Expo）┘                                   ├──→ 文件存储（uploads 卷）
                                                                        └──→ 日志
```

- **一个 Backend，两个正式客户端**：Web 与 Mobile 均为正式产品（非 future/optional），共用同一 API、同一 shared-types、同一数据库。
- **业务规则统一放 Backend**：状态机、审批决策、奖励计算、打卡防重、归属校验全部由 API 权威执行；客户端只是表现层。
- **不建立第二套 Backend**，也不把业务规则分别实现两遍。

## 2. Web 与 Mobile 的职责边界

| 层 | 负责 | 不负责 |
|---|---|---|
| Backend API | 业务规则、数据校验、状态机、权限归属、幂等、审计、发放计算 | 页面、交互、客户端存储 |
| Web Client | 页面、交互、状态展示、浏览器适配（响应式） | 业务规则、二次校验作为唯一依据 |
| Mobile Client | 页面、交互、状态展示、移动适配（离线缓存可选、图片选择） | 业务规则、二次校验作为唯一依据 |

- 客户端可以做**体验层校验**（必填、格式即时提示），但**权威校验在后端**（DTO + service）。
- 两端共享的纯逻辑（日历网格、日期工具、状态机常量、表单校验 schema）放 shared-types，两端复用，不重复实现。

## 3. Mobile 技术栈比较与推荐

| 维度 | React Native + Expo（推荐） | Flutter |
|---|---|---|
| 语言 | TypeScript（与 Web/Backend 同语言） | Dart（新语言、第二套生态） |
| 共享类型/逻辑 | shared-types 直接引用 | 需 codegen 或手写 Dart 模型，双份维护 |
| 团队经验 | 现有 React/TS 直接迁移 | 全新学习曲线 |
| 业务规则 | 后端唯一 → 两端薄客户端 | 同左，但类型层仍双份 |
| UI 表现力 | 够用（表单/列表/日历为本项目主体） | 强（重自定义图形/动画，本项目不需要） |
| 构建发布 | Expo EAS 简化签名/商店发布 | 自有工具链 |
| 复杂度增量 | 低（无新语言、无类型双份） | 中高 |

**推荐：React Native + Expo。** 理由：
1. 与现有 TypeScript + React 技术栈同语言，shared-types 与日历布局纯函数**零成本复用**；
2. API-first 下两端都是薄客户端，Mobile 不引入第二套类型体系；
3. 本项目是表单/列表/日历类应用，RN 性能足够；
4. 符合"不要因为技术选型增加不必要的复杂度"。

## 4. API-first 原则

- **API 是唯一契约**：Backend 先定义 OpenAPI/类型与路由，Web 与 Mobile 按同一契约开发。
- **契约载体**：`packages/shared-types` 中的 DTO/枚举/状态机常量 = 单一来源；两端禁止自己复制类型。
- **统一错误体**：`{ error, reason, fields? }`；客户端按 reason 分支提示，不做字符串匹配服务端异常。
- **无 Web-only 端点**：所有端点对 Mobile 可独立调用（无依赖浏览器 Cookie 写路径、无依赖 window 的响应）。
- **版本策略**：V1 无版本前缀（内部单一版本）；后续破坏性变更引入 `/v2` 前缀，两端同步升级。

## 5. shared-types（三方共享）

- 包：`packages/shared-types`（pnpm workspace，API/Web/Mobile 三方依赖）。
- 内容：
  - 类型：DTO、枚举、状态机常量（`COMPLETION_TRANSITIONS`/`TASK_STATUS_TRANSITIONS`）、领域模型类型；
  - 纯逻辑：日历网格算法（Kaneo `packWeekLanes`/`buildMonthWeeks` 移植）、日期工具、表单校验 schema（zod/class-validator 共享定义）。
- 约束：**只放类型与纯函数**（无 IO、无框架依赖）；Web/Mobile 只 import shared-types，不 import 后端源码；后端 DTO 由 shared-types 类型派生（class-validator 装饰器就地或另置 api 内）。
- 结构建议：
  ```text
  packages/shared-types/src/
  ├── index.ts              # 汇总导出
  ├── auth/                 # 登录/刷新 DTO
  ├── task/                 # Task/TaskCompletion/状态机
  ├── approval/             # ApprovalRequest/Record
  ├── event/                # Event/日历区间
  ├── attendance/           # Attendance/打卡状态
  ├── wrong-question/       # WrongQuestion/复习/掌握
  ├── growth/               # UserGrowth/RewardGrant/曲线常量
  ├── calendar/             # 月/周网格纯函数 + 日期工具
  └── validation/           # 校验 schema
  ```

## 6. Web / Mobile Auth

- 方案：JWT Access（30min）+ Refresh（轮换 + 重放撤销），**同一后端端点双通道**：

| 客户端 | Access Token | Refresh Token 存储 | 刷新方式 |
|---|---|---|---|
| Web | 内存（Zustand） | **httpOnly Cookie**（防 XSS） | `/auth/refresh` 自动带 Cookie |
| Mobile | SecureStore/Keychain | SecureStore（expo-secure-store） | `/auth/refresh` 带 `Authorization: Bearer <refresh>` |

- 后端 `/auth/refresh` **同时接受 Cookie 与 Bearer 头**（二者择一），返回新 Access（+新 Refresh，若轮换）。
- 登出：Web 清 Cookie + 内存；Mobile 清 SecureStore，并调 `/auth/logout` 撤销服务端 refresh 链。
- 过期处理：客户端拦截 401 → 静默刷新 → 重放原请求；刷新失败 → 跳登录。
- 角色：JWT 含 `role`（child/parent/teacher），客户端仅用于 UI 展示分支；授权以后端为准。

## 7. 文件上传

- **统一 API**：`POST /api/files`（multipart FormData，AuthGuard + 归属校验）→ 返回 `{key, url}`；读取走 `GET /api/files/:key`（鉴权）。
- Web：`fetch` + FormData；Mobile：expo-image-picker 选图 → 客户端压缩（≤1MB，借鉴 wrong-notebook 图片管线逻辑）→ `FormData({uri, name, type})` → 同一端点。
- 约束：图片 mime 白名单、≤9 张/实体、单文件 ≤10MB；存储按 `uploads/{family_id}/{entity}/{id}/`。
- 无公开静态目录、无 base64 入 DB——两端一致。

## 8. 公网部署

- 形态：单部署机 + Docker Compose（§9）；域名 + HTTPS（nginx 终结 TLS 或前置反代）。
- 环境变量（生产注入，不入库）：`DATABASE_URL`、`JWT_SECRET`、`ATTENDANCE_TIMEZONE`、`CORS_ORIGINS`、`UPLOAD_*`、`PORT`。
- CORS：仅 Web 来源需要白名单（浏览器）；Mobile 原生请求无 Origin 约束；Expo Web 需放行。
- 日志与错误处理：NestJS Logger + 请求日志中间件；全局异常过滤器输出统一错误体；生产不泄漏堆栈。
- API 基址：Web 同域 `/api`（nginx 反代）或 `https://api.example.com`；Mobile 用 `.env`（`EXPO_PUBLIC_API_URL`）指向公网 API。

## 9. Docker Compose

```yaml
services:
  postgres:
    image: postgres:16
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck: { test: ["CMD-SHELL", "pg_isready"], interval: 10s, retries: 5 }
  api:
    build: ./apps/api
    environment: [DATABASE_URL, JWT_SECRET, ATTENDANCE_TIMEZONE, CORS_ORIGINS, ...]
    volumes: [uploads:/app/uploads]
    depends_on: { postgres: { condition: service_healthy } }
    # 启动前置：prisma migrate deploy && node dist/main.js
  web:
    build: ./apps/web        # 多阶段：build → nginx 托管产物
    ports: ["443:443"]       # nginx：静态 + /api 反代 → api
    depends_on: [api]
volumes:
  pgdata:
  uploads:
```

- **Mobile 不进入 Docker**：正式客户端，经公网 API 连接生产；构建/发布走 Expo EAS + 应用商店（另行规划）。
- 不引入：Kubernetes / 微服务 / Service Mesh / 复杂 DevOps 平台 / 企业级多环境编排。

## 10. Mobile 调用生产 API

- 基址：`EXPO_PUBLIC_API_URL`（如 `https://api.example.com`），Web 与 Mobile 共用同一 API 域名/路径。
- 网络：fetch/axios 封装同 Web（Bearer Access + 401 自动刷新）；HTTPS 必选。
- 认证：SecureStore 存 token；冷启动从 SecureStore 恢复 Access/Refresh → 必要时刷新。
- 图片：expo-image-picker 拍照/相册 → 压缩 → 统一上传端点；预览走鉴权下载端点。
- 离线：V1 不做完整离线缓存；网络错误统一错误体提示 + 重试。

## 11. Backend 业务逻辑边界（Backend 独占，客户端不得重复实现）

- 任务状态机（pending/in_progress/completed/returned）与完成/提交状态机（TaskCompletion）。
- 审批：`requiresApproval` 分支、reviewerId 校验（创建人指定、仅指定审核人可审批）、approve/reject/cancel、状态守卫（仅 pending）+ 409、审计写入。
- 完成定稿事务（StaffScheduler 模式）：先副作用（完成任务 + 发放奖励）后决策写入，幂等（UNIQUE(completion_id)）。
- 成长：等级派生、六维/金币累计、发放流水与幂等、连续升级。
- 打卡：唯一约束防重、checkIn/checkOut 校验、时区日历日（`ATTENDANCE_TIMEZONE`）。
- 错题本：去重、掌握状态流转、复习轮次、归属校验。
- 归属/数据隔离：`family_id` + role 校验（service 层权威）。
- 错误语义：统一错误体、HTTP 状态码语义（400/401/403/404/409）。

## 12. Web / Mobile 客户端边界（各客户端独占，Backend 不感知）

| 客户端 | 独占内容 |
|---|---|
| Web | 浏览器路由、响应式布局（桌面/移动断点）、httpOnly Cookie 刷新、浏览器本地 UI 状态 |
| Mobile | 原生导航（expo-router）、SecureStore 密钥存储、expo-image-picker 选图、平台 UI 适配、App 生命周期/冷启动恢复 |
| 两者共享 | shared-types 类型与纯逻辑、API client 模式（各端 fetch 封装）、页面结构映射（今日/任务/学习/日程/成长） |

- 每个客户端**独立实现自己的页面与交互**，不互相复用组件代码（不同渲染环境），只复用 shared-types 的纯逻辑。
- 展示层组合：日历页分别查询 Event 与 Task（due 投影）后在客户端组合渲染（TaskLabs 模式）——该组合逻辑放 shared-types 纯函数或各端各自组合（推荐 shared-types 纯函数，两端一致）。

---

## 附：与主文档的对应

- 技术栈/选型依据：主文档 §3.1 / §3.9
- 部署：主文档 §3.8
- 实施顺序（Web + Mobile 双端）：主文档 §12
- 已确认决策：主文档 §18

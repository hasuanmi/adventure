# wrong-notebook 全功能盘点报告

> 目标项目：`C:\Users\48489\Desktop\huahuastudy\research\_artifacts\ref_repos\wrong-notebook\wrong-notebook-main`
> 版本：`package.json:3` → `"version": "1.9.1"`
> 盘点方式：只读。未修改、未创建、未删除目标项目内任何文件。
> 所有结论以 `相对路径:行号` 标注，路径均相对于上述项目根目录。

---

## 1. 项目概况

### 1.1 技术栈（全部来自 `package.json`）

| 层 | 技术 | 依据 |
|---|---|---|
| 框架 | Next.js `^16.0.10`（App Router，`output: 'standalone'`） | `package.json:40`；`next.config.ts:4` |
| UI | React `19.2.0` / react-dom `19.2.0` | `package.json:43-44` |
| 样式 | Tailwind CSS v4 + Shadcn UI（Radix primitives） | `package.json:59,76-79`；`components.json` |
| 图标 | lucide-react `^0.555.0` | `package.json:73` |
| 数据库 | **SQLite**，Prisma `5.22.0`（`@prisma/client` 同为 `5.22.0`） | `prisma/schema.prisma:10`；`package.json:23,74` |
| 认证 | NextAuth `^4.24.13` + `@next-auth/prisma-adapter ^1.0.7` + bcryptjs `^3.0.3` | `package.json:20,41,34` |
| AI SDK | `@google/genai ^1.34.0`（Gemini）、`openai ^6.9.1`（OpenAI 与 Azure OpenAI 复用） | `package.json:19,42` |
| 校验 | zod `^4.1.13` | `package.json:56`；`src/lib/ai/schema.ts:1` |
| 图片 | react-dropzone `^14.3.8`、react-image-crop `^11.0.10` | `package.json:45,47` |
| 数学/文本渲染 | katex `^0.16.25`、react-markdown `^10.1.0`、remark-math/gfm、rehype-katex、strip-markdown | `package.json:39,48,51-54` |
| 图表 | recharts `^3.5.0` | `package.json:49` |
| 日期 | date-fns `^4.1.0` | `package.json:35` |
| 代理 | undici `^7.16.0` + global-agent `^3.0.0` | `package.json:37,55`；`src/lib/global-proxy.ts:1,52` |
| 测试 | vitest `^4.0.15`（单元+集成）、@playwright/test `^1.57.0`（E2E） | `package.json:12-16,59,81` |
| 部署 | Docker（node:22-alpine，standalone）+ docker-compose（含 HTTPS 变体） | `Dockerfile:1,63-64`；`docker-compose.yml`、`docker-compose.https.yml` |

**值得注意的版本/依赖事实：**
- `@prisma/adapter-better-sqlite3` 声明为 `^7.0.1`（`package.json:22`），而 `@prisma/client`/`prisma` 是 `5.22.0`（`package.json:23,74`）—— 版本线不一致；但项目实际 `src/lib/prisma.ts` 只有 10 行，未使用该 adapter（schema 用的是标准 sqlite provider）。
- **声明但未被使用**：`react-easy-crop ^5.5.6`（`package.json:46`）在 `src/` 中零引用（裁剪实际用 `react-image-crop`，见 `src/components/image-cropper.tsx:4`）；`jsonrepair ^3.13.1`（`package.json:38`）在生产代码中零引用，仅在单测里被 mock（`src/__tests__/unit/ai/azure-provider.test.ts:55`）。

### 1.2 目录结构概要

```
wrong-notebook-main/
├── src/
│   ├── app/                    # App Router：14 个 page.tsx + layout + globals.css + manifest.ts
│   │   └── api/                # 40 个 route.ts（见第 3 节）
│   ├── components/             # 22 个业务组件 + ui/ 19 个 shadcn 组件 + admin/ + settings/
│   ├── contexts/LanguageContext.tsx
│   ├── lib/
│   │   ├── ai/                 # index/types/schema/prompts/tag-service + 3 个 provider
│   │   ├── tag-data/           # 9 学科预置课标标签（seed 数据源）
│   │   ├── constants/pagination.ts
│   │   └── ~22 个工具/服务模块
│   ├── types/                  # api.ts, next-auth.d.ts
│   ├── __tests__/              # 13 个集成测试 + 24 个单元测试 + setup
│   └── middleware.ts           # NextAuth 路由守卫
├── prisma/                     # schema.prisma(141行) + seed.ts + 10 个 migration + dev.db
├── config/.gitkeep             # 运行时 app-config.json 落盘处（当前不存在）
├── doc/                        # 8 个文档（含 PROJECT_OVERVIEW.md）
├── e2e/                        # 3 个 Playwright spec + fixtures/math_test.png
├── scripts/                    # 20 个运维/seed/测试脚本
├── public/icons/icon.png       # PWA 图标
└── Dockerfile / docker-compose*.yml / https-server.js / openclaw-integration.patch
```

- 源码文件数：174 个 `.ts`/`.tsx`（含测试，`src/` 递归统计）。
- 最大文件：`src/components/settings-dialog.tsx`（1451 行）、`src/lib/translations.ts`（1296 行）、`src/lib/tag-data/math.ts`（590 行）。

### 1.3 README 声明的功能（逐字引用）

`README.md:5-16`「✨ 主要功能」逐条原文：

> - **🤖 AI 智能分析**：自动识别题目内容，生成解析、知识点标签和同类练习题。
> - **⚙️ 灵活的 AI 配置**：支持 **Google Gemini** 和 **OpenAI** (及兼容接口) 两种 AI 提供商，可直接在网页设置中动态切换和配置。
> - **📚 多错题本管理**：支持按科目（如数学、物理、英语）创建和管理多个错题本。
> - **🏷️ 智能标签系统**：自动提取知识点标签，支持自定义标签管理。
> - **🔍 多维度筛选**：支持按掌握状态、时间范围、知识点标签、年级学期、试卷等级等多种条件筛选错题。
> - **🖨️ 灵活导出打印**：一键导出筛选后的错题，支持自定义打印内容（答案/解析/知识点）和图片缩放比例，可直接打印或保存为 PDF。
> - **📝 智能练习**：基于错题生成相似的练习题，巩固薄弱环节。
> - **📊 数据统计**：可视化展示错题掌握情况和学习进度。
> - **🔐 用户管理**：支持多用户注册、登录，数据安全隔离。
> - **🛡️ 管理员后台**：提供用户管理功能，可禁用/启用用户、删除违规用户。

`README.md:43` 技术栈 AI 行：

> - **AI**: Google Gemini API / OpenAI API / Azure OpenAI

`README.md:191`（网页配置优先级）：

> > **注意**：网页配置会保存到 `config/app-config.json` 文件中，该文件的优先级高于 `.env` 环境变量。

`README.md:213`（兼容模式）：

> > **兼容模式**：OpenAI 提供商兼容所有支持 OpenAI API 格式的第三方服务。只需将 Base URL 改为对应服务地址，即可使用硅基流动、智谱 GLM、月之暗面 Kimi、通义千问 DashScope 等平台的模型。模型名称需填写对应平台的完整模型 ID。

`README.md:19-21` 声明了一个 **屏幕截图功能**：

> ## 📸 屏幕截图功能 (HTTPS 设置)
> 本应用的屏幕截图功能依赖浏览器的安全上下文 (HTTPS)。

`README.md:23-25` 声明 **PWA 支持**（`README.md:24`: "本项目支持 PWA (Progressive Web App)"）。

`README.md:166-170` 默认管理员：

> 默认管理员账户：
> - **邮箱**: `admin@localhost`
> - **密码**: `123456`

> ⚠️ 注意：README 第 8 行只列了 Gemini 和 OpenAI 两种提供商，但第 43、129、185 行及代码都支持 **Azure OpenAI**——README 的功能列表与正文自相矛盾（功能列表未更新）。

### 1.4 许可证状态 —— ⚠️ 高风险

**结论：仓库内不存在任何 LICENSE / COPYING / NOTICE 文件。**

- 对项目根及全仓库（排除 `node_modules`、`.next`、`.git`）递归搜索文件名匹配 `^LICENSE|^COPYING|^NOTICE`：**零结果**。
- 根目录 24 个文件的完整清单中无 LICENSE：`.cursorrulers .dockerignore .env .env.example .gitignore .mailmap components.json docker-compose.https.yml docker-compose.yml docker-entrypoint.sh Dockerfile eslint.config.mjs export-tag-trees.ts https-server.js next-env.d.ts next.config.ts openclaw-integration.patch package-lock.json package.json playwright.config.ts postcss.config.mjs README.md tsconfig.json vitest.config.ts`。
- `package.json` **没有 `license` 字段**（`package.json:1-17` 完整可见，无 license 键）。`package-lock.json` 中的 `"license": "MIT"` 全部属于第三方依赖，与本项目无关。
- 项目**不是 git 仓库**（无 `.git` 目录），因此也无法通过 git 历史确认是否有过 LICENSE。
- 唯一声明位于 `README.md:238-240`：`## 📄 许可证` / 空行 / `MIT License`。**仅此一行，无正文、无版权行、无年份、无作者。**

**风险判定**：README 自称 MIT，但没有 LICENSE 正文文件、没有 package.json license 字段、没有版权归属声明。在法律上这属于"**未明确授权**"状态（README 一句话声明不能构成完整的 MIT 授权文本，尤其缺少"Permission is hereby granted..."正文与著作权人）。若要在自建产品中"复刻全部功能"，**必须先向原作者（GitHub: `wttwins`，见 `README.md:62,91`）取得明确书面授权或补齐 LICENSE**，否则所有代码级复用都存在权利瑕疵。这属于"移植阻碍"级别的阻塞项，不是小事。

---

## 2. 数据模型全清单

数据源：`prisma/schema.prisma`（141 行、5 个 model）。datasource 为 `provider = "sqlite"`（`prisma/schema.prisma:10`）。

### 2.0 与你们硬基线的总体差异（先说结论）

| 你们的要求 | 本项目状态 | 证据 |
|---|---|---|
| 每张表都要有 `family_id` | **完全没有**。多租户/家庭维度仅靠 `userId` 外键 | `prisma/schema.prisma:14-141` 全部 model 无 `family_id` |
| 枚举用 VARCHAR + 应用层白名单 | **部分符合**。`role`、`mistakeStatus`、`paperLevel`、`educationStage` 都是 String，靠应用层校验 | `:25-27, 97, 111`；白名单见 `src/lib/mistake-status.ts:4`、`src/lib/ai/schema.ts:13-18` |
| 软删除用 `deleted_at` | **完全没有软删除**。全部是物理删除 `prisma.x.delete()` / `deleteMany()` | `src/app/api/error-items/[id]/delete/route.ts:43`、`src/app/api/error-items/batch-delete/route.ts:72` |
| 手写部分唯一索引做幂等 | **只有 Prisma 层 `@@unique`**，无手写部分唯一索引。幂等靠"2 秒时间窗去重"这种应用逻辑 | `:61, :78`；去重见 `src/app/api/error-items/route.ts:70-102` |
| 错误体 `{error, reason, fields?}` | **完全不同的形状**：本项目是 `{message, code?, details?}` | `src/lib/api-errors.ts:10-14, 66-76` |

### 2.1 `User`（`prisma/schema.prisma:14-32`）

| 字段 | 类型 | 默认/约束 | 说明 |
|---|---|---|---|
| `id` | String | `@id @default(cuid())` | |
| `email` | String | `@unique` | 登录名 |
| `password` | String | — | bcrypt 哈希（`src/lib/auth.ts:66` 用 `compare`） |
| `name` | String? | — | |
| `createdAt` | DateTime | `@default(now())` | |
| `updatedAt` | DateTime | `@updatedAt` | |
| `educationStage` | String? | — | 注释：`primary, junior_high, senior_high, university`（`:22`） |
| `enrollmentYear` | Int? | — | 入学年份，与 `educationStage` 一起推导年级 |
| `role` | String | `@default("user")` | 注释：`"admin" or "user"`（`:25`） |
| `isActive` | Boolean | `@default(true)` | 禁用用户后登录抛错，见 `src/lib/auth.ts:61-64` |

关系：`errorItems`、`subjects`、`practiceRecords`、`customTags`（`:28-31`）。
**无软删除字段。**

### 2.2 `KnowledgeTag`（`prisma/schema.prisma:35-65`）—— 邻接表树

| 字段 | 类型 | 默认/约束 | 说明 |
|---|---|---|---|
| `id` | String | `@id @default(cuid())` | |
| `name` | String | — | 标签名，如"勾股定理" |
| `subject` | String | — | 学科 key：`math`/`physics`/`english`/…（`src/lib/knowledge-tags.ts:60`） |
| `parentId` | String? | 自关联 | **邻接表（adjacency list）**，无限层级 |
| `parent`/`children` | 自关联 | `onDelete: SetNull` | `:42-43` |
| `order` | Int | `@default(0)` | 教材顺序 |
| `code` | String? | — | 如 `"1.2.1"` |
| `isSystem` | Boolean | `@default(false)` | 系统预置 vs 用户自定义 |
| `userId` | String? | `onDelete: Cascade` | 自定义标签归属用户 |
| `errorItems` | 多对多 | 隐式连接表 | `:55` |
| `createdAt`/`updatedAt` | DateTime | now / updatedAt | |

约束与索引：
- `@@unique([subject, name, userId, parentId])`（`:61`）——"同一用户（或系统）下同一父节点下的标签名不重复"。
  - 该约束由迁移 `prisma/migrations/20251219014445_fix_tag_constraints/migration.sql:8,11` 从旧的 `(subject,name,userId)` 修正而来。
  - ⚠️ SQLite 中 `NULL` 不参与唯一约束，因此 `parentId IS NULL` 的根节点（`userId` 也为 `NULL` 的系统标签）实际**不受该唯一约束保护**——这是一个真实的数据完整性缺口。
- `@@index([parentId])`、`@@index([subject])`（`:63-64`）。
- 树的实际层级（由 seed 决定，见 `src/app/api/admin/migrate-tags/route.ts:233-334`）：
  - **math** 是 4 层：年级学期 → 章 → 节 → 知识点（`:236,249,262,275`）
  - **其他学科** 是 3 层：年级学期 → 章 → 知识点（`:295,308,321`）
- **无软删除字段。**

### 2.3 `Subject`（`prisma/schema.prisma:67-79`）—— 即 UI 上的"错题本"

| 字段 | 类型 | 默认/约束 |
|---|---|---|
| `id` | String | `@id @default(cuid())` |
| `name` | String | — |
| `userId` | String | `onDelete: Cascade` |
| `errorItems` | 一对多 | |
| `createdAt`/`updatedAt` | DateTime | now / updatedAt |

- `@@unique([name, userId])`（`:78`）—— 同名错题本去重，API 依赖 `name_userId` 复合键查询（`src/app/api/notebooks/route.ts:112-116`）。
- **注意命名混乱**：model 叫 `Subject`，但 API 路径、README、UI 全部称"错题本 / notebook"。且**学科是靠 `name` 字符串模糊推断的**，不是独立字段（`src/lib/knowledge-tags.ts:60-76` 的 `inferSubjectFromName` 用 `includes('数学')`/`includes('math')` 等做关键词匹配）。
- **无软删除字段。**

### 2.4 `ErrorItem`（`prisma/schema.prisma:81-117`）—— 核心错题实体

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | String | cuid | |
| `userId` | String | — | `onDelete: Cascade` |
| `subjectId` | String? | — | `onDelete: Cascade`（错题本删除级联删错题） |
| `originalImageUrl` | **String（非空）** | — | **实际存的是 base64 data URL 全文**，见 2.4.1 |
| `ocrText` | String? | — | 仅 Openclaw 通路写入（`src/app/api/openclaw/batch-upload/route.ts:172`） |
| `questionText` | String? | — | **题干**（AI 解析结果） |
| `answerText` | String? | — | **答案** |
| `analysis` | String? | — | **解析** |
| `wrongAnswerText` | String? | — | 学生错误解答原文 |
| `mistakeAnalysis` | String? | — | **错因分析** |
| `mistakeStatus` | String? | — | `not_attempted` / `wrong_attempt` / `unknown`；白名单在 `src/lib/mistake-status.ts:1-8` |
| `knowledgePoints` | String? | — | **`[DEPRECATED]` JSON 字符串**，注释原文："kept for migration only"（`:98`）。但**仍在被大量读写**，见 2.4.2 |
| `geogebraCommands` | String? | — | JSON 数组或换行分隔的命令串（`:99`） |
| `tags` | `KnowledgeTag[]` | — | 多对多（`:102`）—— 新的标签关系 |
| `source` | String? | — | 如 `"Midterm Exam"`（`:105`）；Openclaw 写入固定值 `'Openclaw'` |
| `errorType` | String? | — | 如 `"Calculation"`；**仅 Openclaw 通路写入**，主流程从不设置 |
| `userNotes` | String? | — | 用户笔记 |
| `masteryLevel` | Int | `@default(0)` | 注释原文：`0: New, 1: Reviewing, 2: Mastered`（`:109`）。但 **UI 只使用 0/1 两态**，见 `src/app/error-items/[id]/page.tsx:147`（`newLevel = masteryLevel > 0 ? 0 : 1`） |
| `gradeSemester` | String? | — | 如 `"初一上"`（中文）/ `"Junior High Grade 1, 1st Semester"`（英文），语言相关，见 `src/lib/grade-calculator.ts:56-63` |
| `paperLevel` | String? | — | `"a"` / `"b"` / `"other"`；⚠️ **schema 注释写的是 `"A", "B", "Other"` 大写（`:111`），实际存取用小写**（`src/components/correction-editor.tsx:56,275-277`），注释与实现不一致 |
| `createdAt`/`updatedAt` | DateTime | now / updatedAt | |
| `reviewSchedules` | `ReviewSchedule[]` | — | 一对多（`:116`） |

**索引情况：`ErrorItem` 上没有任何 `@@index` / `@@unique`**（`:81-117` 全文无 `@@`）。列表查询的全表扫描 + 去重查询的 `startsWith` 都无索引支撑（`src/app/api/error-items/list/route.ts:142-156`；`src/app/api/error-items/route.ts:75-88`）。**软删除字段：无。**

#### 2.4.1 图片字段：**base64 data URL 直存数据库，不是 URL，也不是对象存储**

- 保存：`originalImageUrl: currentImage || ""`，其中 `currentImage` 是 `processImageFile(file)` 的返回值（`src/app/page.tsx:130-131, 268`）。
- `processImageFile` 返回 `canvas.toDataURL('image/jpeg', q)` 或 `FileReader.readAsDataURL(file)`（`src/lib/image-utils.ts:46,54,95`）—— **都是 `data:image/jpeg;base64,...` 形式**。
- Openclaw 通路显式拼接：``originalImageUrl: `data:${mimeType};base64,${imageBase64}` ``（`src/app/api/openclaw/batch-upload/route.ts:171`）。
- 渲染时直接 `<img src={item.originalImageUrl}>`（`src/app/error-items/[id]/page.tsx:535,602`；`src/app/print-preview/page.tsx:264`）。
- 上游契约方也把它当 data URL 处理：`src/app/api/analyze/route.ts:41-48` 会剥离 `data:...;base64,` 前缀。
- 类型定义同样标注为必填 String：`src/types/api.ts:53`。
- **实测数据规模**：`prisma/dev.db` 存在（随仓库提交），图片与题目正文同库同表，无外部存储、无 CDN、无缩略图派生。

**⚠️ 这是移植时最重的阻碍之一**：单行 TEXT 承载 base64 图片，SQLite 下勉强能用，迁到 PostgreSQL 会造成 TOAST 膨胀、列表查询（`include: { tags: true }` 带出整行）带宽爆炸。列表接口 `GET /api/error-items/list` 会返回完整 base64 图片（`src/app/api/error-items/list/route.ts:147-156` 未做字段裁剪），前端列表页即使只显示 80 字摘要也会拉全图。

#### 2.4.2 `knowledgePoints` 与新 `tags` 关系**双轨并存（技术债）**

同一个知识点信息存在两处，代码到处"优先 tags、回退 knowledgePoints"：
- 写入时**两个都写**：`knowledgePoints: JSON.stringify(tagNames)` + `tags: { connect: tagConnections }`（`src/app/api/error-items/route.ts:173-180`；`[id]/route.ts:170-176`）。
- 读取时优先 `tags`：`src/components/error-list.tsx:346-356`、`src/app/error-items/[id]/page.tsx:428-439`、`src/app/print-preview/page.tsx:201-211`。
- 但**按标签筛选仍走旧的 JSON 字符串**：`whereClause.knowledgePoints = { contains: tag }`（`src/app/api/error-items/list/route.ts:107-109`）——这是子串匹配，会误伤（例如 tag `"三角形"` 会命中 `"全等三角形"`）。
- **相似题生成也仍读旧字段**：`tags = JSON.parse(errorItemWithSubject.knowledgePoints || "[]")`（`src/app/api/practice/generate/route.ts:30-35`）——即使某题只通过新 `tags` 关系关联了标签，只要 `knowledgePoints` 为空，AI 相似题就会拿到空知识点列表，生成质量下降。
- 标签统计也读旧字段：`src/app/api/tags/stats/route.ts:17-41`。

### 2.5 `ReviewSchedule`（`prisma/schema.prisma:119-129`）—— **定义了但基本上没被使用**

| 字段 | 类型 | 默认 |
|---|---|---|
| `id` | String | cuid |
| `errorItemId` | String | `onDelete: Cascade` |
| `scheduledFor` | DateTime | — |
| `completedAt` | DateTime? | — |
| `isCorrect` | Boolean? | — |
| `createdAt` | DateTime | now |

**没有任何 `@@index`**（`:119-129`）。**无软删除字段。**

**关键发现：这张表在业务流里是死的。** 全仓库检索 `ReviewSchedule` / `reviewSchedules` / `scheduledFor` 共 17 处命中：
- `src/lib/scheduler.ts:6,11` 定义了日期计算函数；
- `src/app/api/export/route.ts:54,79` 导出时读一次；
- `src/app/api/import/route.ts:64,301-323` 导入时写一次；
- `src/components/settings-dialog.tsx:404,443` 只是把导入统计数字显示出来。

**没有任何 API 端点或页面会创建、查询、展示、完成一条复习计划。** 详见第 6 节。

### 2.6 `PracticeRecord`（`prisma/schema.prisma:131-141`）

| 字段 | 类型 | 默认/说明 |
|---|---|---|
| `id` | String | cuid |
| `userId` | String | `onDelete: Cascade` |
| `subject` | String? | **存的是学科显示名（如 `"数学"`），不是 `subjectId` 外键**（`:136` 注释 `e.g. "Math", "Physics"`；实际写入见 `src/app/practice/page.tsx:122` 传 `question.subject`） |
| `difficulty` | String? | `"easy"` / `"medium"` / `"hard"` / `"harder"`；类型定义 `src/lib/ai/types.ts:9` |
| `isCorrect` | Boolean? | |
| `createdAt` | DateTime | now |

**没有 `@@index`**，**无软删除字段**，**不记录关联的 `errorItemId`**——因此"某道错题我练过几次、最近一次对错"这类信息**无法回溯**，也无法做按题目的练习历史。

### 2.7 缺失的 AI 状态字段

schema 中**没有任何 AI 任务状态字段**（无 `aiStatus`、无 `aiTaskId`、无 `analysisStatus`、无 `aiError`、无 `aiModel`、无 token/耗时记录）。
- AI 调用是**同步阻塞**的（`await aiService.analyzeImage(...)`，`src/app/api/analyze/route.ts:106`），前端靠 `analysisStep` 状态机 + 模拟进度条兜住 UX（`src/app/page.tsx:81-103`）。
- 失败后**没有任何可查询的失败记录**，只有服务端日志。
- 也没有记录"这一题是由哪个 provider/model 生成的"，无法审计或复现。

---

## 3. 后端 API 全清单

共 **40 个 `route.ts`**。统一错误体为 `{ message, code?, details? }`（`src/lib/api-errors.ts:10-14`），**与你们要求的 `{error, reason, fields?}` 完全不同**。错误码枚举在 `src/lib/api-errors.ts:19-49`。

### 3.1 🤖 AI 端点（真实调用大模型，产生 token 成本）

| # | 方法 + 路径 | 文件 | 入参 | 出参 | 模型调用 |
|---|---|---|---|---|---|
| A1 | `POST /api/analyze` | `src/app/api/analyze/route.ts:13` | `{imageBase64, mimeType?, language?, subjectId?}` | `ParsedQuestion`（9 字段，见 5.2） | `getAIService().analyzeImage(...)` `:105-106` |
| A2 | `POST /api/reanswer` | `src/app/api/reanswer/route.ts:10` | `{questionText, language='zh', subject?, imageBase64?, gradeSemester?}` | `{answerText, analysis, knowledgePoints[], wrongAnswerText, mistakeAnalysis, mistakeStatus}` `:41-45` | `reanswerQuestion(...)` `:41` |
| A3 | `POST /api/geogebra-analyze` | `src/app/api/geogebra-analyze/route.ts:15` | `{questionText, answerText, analysis}` | `{suitable, commands[], description}` `:42` | `analyzeForGeogebra(...)` `:34-38` |
| A4 | `POST /api/practice/generate` | `src/app/api/practice/generate/route.ts:11` | `{errorItemId, language, difficulty}` | `ParsedQuestion` `:51` | `generateSimilarQuestion(...)` `:38-44` |
| A5 | `POST /api/error-items/[id]/geogebra` | `src/app/api/error-items/[id]/geogebra/route.ts:11` | `{questionText?, answerText?, previousErrors?}` | `{suitable, commands[], description}` `:94` | `analyzeForGeogebra(...)` `:75-80`；成功后**回写** `geogebraCommands` `:84-89` |
| A6 | `POST /api/ai/test` | `src/app/api/ai/test/route.ts:94` | `{provider, apiKey, baseUrl?, model?, endpoint?, deploymentName?, apiVersion?, language?}` | `{success, textSupport, visionSupport, textError?, visionError?, modelInfo?}` `:230-237` | **真实调用两次**：先 `analyzeImage`（内嵌 1.7KB 测试图 base64，`:12`），失败再 `generateSimilarQuestion('1+1=?')` `:128,137,154,183,195,213` |

**AI 端点业务规则详情：**

- **A1 `/api/analyze`**
  - 认证：必须登录，否则 `401 {message:"Unauthorized"}`（`:16-22`）。
  - Data URL 自动剥离：正则 `/^data:([^;]+);base64,(.+)$/`（`:42`）。
  - **动态 prompt 注入**：查 `User.educationStage/enrollmentYear` → `calculateGradeNumber` 得年级 7-12（`:58-64`）；查 `Subject.name` → `inferSubjectFromName` → 中文科目名（`:72-102`）→ 一起传给 AI provider。
  - **无去重、无缓存、无频率限制**——同一张图重复提交会重复消耗 token。
  - 错误映射：把 provider 抛出的 `AI_*` 错误码原样透出，失败统一 500 + `code: 'AI_ERROR'`（`:154`）。
  - ⚠️ 该端点**不落库**——AI 结果只返回前端，用户确认后再调 `POST /api/error-items` 保存。

- **A2 `/api/reanswer`**：`questionText` 为空则 `badRequest`（`:33-36`）。带 `imageBase64` 时走多模态（provider 会剥 data URL 前缀，`src/lib/ai/gemini-provider.ts:311`）。**无落库**。

- **A4 `/api/practice/generate`**：**存在越权漏洞**——`prisma.errorItem.findUnique({ where: { id: errorItemId } })` 后**只判存在、不判 owner**（`:21-28`，对比 `[id]/route.ts:47` 有 owner 校验）。任何登录用户只要猜到/拿到别人的 `errorItemId` 即可读取他人题目并生成相似题。`subject` 由服务端从 DB 覆盖，做了白名单（`:47-49`）。

- **A6 `/api/ai/test`**：`provider` 或 `apiKey` 缺失 → 400（`:105-107`）；Azure 额外要求 `endpoint` + `deploymentName`（`:144-146`）。错误码归一化函数 `parseErrorCode`（`:16-70`）把 HTTP 状态/文本消息映射为 9 个 `AI_*` 码；`isConfigError` 判定配置类错误时跳过文本测试（`:118-121, 168-171`）。

- **A5 `/api/error-items/[id]/geogebra`** 特有业务规则：
  - 学科门禁：仅"数学/物理"允许，否则直接返回 `{suitable:false, description:"仅数学和物理题目支持 GeoGebra 动态演示"}`（`:44-57`）。
  - `questionText` 为空则拒绝（`:59-65`）。
  - **优先使用前端传入的 `questionText`/`answerText`（比 DB 新），回退 DB**（`:69-73`）。
  - 支持**重试反馈闭环**：`previousErrors` 会被注入 prompt 的错误修正段落（`src/lib/ai/prompts.ts:622-626`）。

### 3.2 错题 CRUD 与筛选

| # | 方法 + 路径 | 文件:行 | 入参 | 出参 | 关键业务规则 |
|---|---|---|---|---|---|
| B1 | `POST /api/error-items` | `error-items/route.ts:14` | `{questionText, answerText, analysis, wrongAnswerText, mistakeAnalysis, mistakeStatus, knowledgePoints[], originalImageUrl, subjectId, gradeSemester, paperLevel, geogebraCommands}` `:21-34` | 创建的 ErrorItem（含 tags），`201`；重复时 `200 + duplicate:true` | **去重窗口 2000ms**（`DEDUP_WINDOW_MS`，`:71`），按 `questionText` **前 100 字符 `startsWith`** 匹配同用户近期记录（`:72-88`）→ 命中则返回既有记录并打 `duplicate:true`（`:97-100`）。年级缺失时自动按用户档案计算（`:104-109`）。标签逐个"先查后建"，不存在则按年级挂到 `findParentTagIdForGrade` 找到的父节点（`:121-156`）。`masteryLevel` 强制 0（`:177`） |
| B2 | `GET /api/error-items/list` | `error-items/list/route.ts:12` | query: `subjectId, query, mastery, timeRange, tag, chapter, gradeSemester, paperLevel, page, pageSize` | `{items, total, page, pageSize, totalPages}` `:160-166` | 分页：`page≥1`，`pageSize` 夹在 `[MIN_PAGE_SIZE, MAX_PAGE_SIZE]`=`[1,1000]`，默认 `DEFAULT_PAGE_SIZE`=**18**（`:23-24`；常量 `src/lib/constants/pagination.ts:6,9,12`）。`mastery=1`→`gt:0`，否则 `=0`（`:64-66`）。`timeRange=week/month`（`:69-82`）。`query` 用 `AND` 包裹 `OR(questionText/analysis/wrongAnswerText/mistakeAnalysis/knowledgePoints contains)`（`:48-61`）。**章节筛选**递归找后代标签 id（BFS，`:253-285`）并 `tags.some.id.in`；查不到时用 `id:"__IMPOSSIBLE_ID__"` 强制空集（`:96-100`）。`gradeSemester` 走别名映射 + 学期连接符穷举（`:173-250`）。排序固定 `createdAt desc`（`:149`） |
| B3 | `GET /api/error-items/[id]` | `error-items/[id]/route.ts:13` | path `id` | 单个 ErrorItem（含 subject、tags） | owner 校验 → `403`（`:47-49`） |
| B4 | `PUT /api/error-items/[id]` | `error-items/[id]/route.ts:58` | 部分字段 `{knowledgePoints, gradeSemester, paperLevel, questionText, answerText, analysis, subjectId, wrongAnswerText, mistakeAnalysis, mistakeStatus, geogebraCommands}` `:78` | 更新后的 ErrorItem | 只更新显式传入的字段（`!== undefined` 判定，`:95-118`）。改错题本时校验目标 Subject 归属（`:102-109`）。`mistakeStatus` 会被 `normalizeMistakeStatusForSave` 用 `wrongAnswerText` 覆写（`:110-117`）。标签变更时 **`set: []` 先清空再 connect**（`:170-173`），并同步旧字段（`:176`） |
| B5 | `PATCH /api/error-items/[id]/mastery` | `error-items/[id]/mastery/route.ts:10` | `{masteryLevel}` | 更新后的 ErrorItem | owner 校验（`:32-43`） |
| B6 | `PATCH /api/error-items/[id]/notes` | `error-items/[id]/notes/route.ts:10` | `{userNotes}` | 更新后的 ErrorItem | ⚠️ **无 owner 校验、无 item 存在校验**——直接 `prisma.errorItem.update({where:{id}})`（`:31-38`）。任意登录用户可改写他人错题的笔记。**IDOR 漏洞** |
| B7 | `DELETE /api/error-items/[id]/delete` | `error-items/[id]/delete/route.ts:10` | path `id` | `{message:"Deleted successfully"}` | owner 校验（`:38-40`）；**物理删除**（`:43-45`） |
| B8 | `POST /api/error-items/batch-delete` | `error-items/batch-delete/route.ts:15` | `{ids: string[]}` | `{deleted, failed[]}` `:82-85` | `ids` 非空数组且 **≤100 条**（`:25-31`）；过滤出属于当前用户的 id（`:59-61`），越权 id 进 `failed` 并在日志 warning（`:63-67`）；`deleteMany` 物理删（`:72-76`） |
| B9 | `DELETE /api/error-items/clear` | `error-items/clear/route.ts:10` | — | `{message}` | 清空当前用户**全部**错题（`:22-24`）。⚠️ 用 `session.user.id`，但 session 的 `id` 来自 JWT（`src/lib/auth.ts:104`），此处 `@ts-ignore`（`:17`） |

### 3.3 错题本（Subject / notebook）

| # | 方法 + 路径 | 文件:行 | 规则 |
|---|---|---|---|
| C1 | `GET /api/notebooks` | `notebooks/route.ts:14` | **首次访问自动创建 `["数学","英语"]` 两个默认错题本**（`:46-74`）。带 `_count.errorItems`，`createdAt desc` |
| C2 | `POST /api/notebooks` | `notebooks/route.ts:87` | `name` 必填去空（`:105-107`）；同名 → `409 conflict`（`:110-121`） |
| C3 | `GET/PUT/DELETE /api/notebooks/[id]` | `notebooks/[id]/route.ts:14,63,126` | 全部 owner 校验（`:48,90,160`）。**DELETE 前置条件：`_count.errorItems > 0` 时拒绝**（`:165-167`），提示先清空 |

### 3.4 标签（KnowledgeTag）

| # | 方法 + 路径 | 文件:行 | 规则 |
|---|---|---|---|
| D1 | `GET /api/tags?subject=&flat=` | `tags/route.ts:60` | 需登录（`:63`）。`subject` 必填否则 400（`:71-73`）。查 `isSystem:true OR userId=me`（`:76-88`）。`flat=true` 返回**叶子节点**+`parentName`（`:90-107`）；否则返回嵌套树 `buildTagTree`（`:26-52, 110-121`） |
| D2 | `POST /api/tags` | `tags/route.ts:133` | `{name, subject, parentId?}`；同父下同名 → 409（`:149-160`）；创建为 `isSystem:false` + 当前用户（`:163-171`） |
| D3 | `DELETE /api/tags?id=` | `tags/route.ts:186` | **只能删自己的自定义标签**（`userId: me, isSystem: false`，`:201-207`），否则 404 |
| D4 | `GET /api/tags/stats` | `tags/stats/route.ts:14` | ⚠️ **完全无认证、无 userId 过滤**——遍历**全库所有用户的 `errorItems`** 统计标签词频（`:17-41`）。跨租户数据泄露 + 全表扫描。返回 `{stats:[{tag,count}], total, uniqueTags}` |
| D5 | `GET /api/tags/suggestions?q=&subject=&stage=` | `tags/suggestions/route.ts:19` | 未登录也可调用（`:41-44` 的 OR 数组会退化成只有 `isSystem:true`）。取叶子节点（`:69`），`stage` 过滤时对系统标签**上溯到根节点**匹配年级（`:72-98`），`q` 子串匹配（`:101-105`），**最多返回 30 条**（`:108-110`） |

### 3.5 统计 / 分析

| # | 方法 + 路径 | 文件:行 | 返回 |
|---|---|---|---|
| E1 | `GET /api/analytics` | `analytics/route.ts:11` | `{totalErrors, masteredCount, masteryRate, subjectStats[], activityData[7天]}`（`:86-92`）。掌握率 = `masteryLevel>0 / total *100`（`:28-36`）。近 7 天逐日 count 循环查询（N+1，`:58-84`） |
| E2 | `GET /api/stats/practice` | `stats/practice/route.ts:11` | `{subjectStats, activityStats[近6月, 按难度堆叠], difficultyStats, overallStats{total,correct,rate}}`（`:90-99`）。用 `groupBy(subject/difficulty)` + 6 个月月度聚合 |
| E3 | `DELETE /api/stats/practice/clear` | `stats/practice/clear/route.ts:10` | 清空当前用户全部练习记录，返回 `{message, count}` |

### 3.6 导入 / 导出

| # | 方法 + 路径 | 文件:行 | 规则 |
|---|---|---|---|
| F1 | `GET /api/export?all=true` | `export/route.ts:10` | 导出 JSON：`{version:1, exportedAt, scope, user, subjects, customTags, errorItems(含tags), reviewSchedules, practiceRecords}`（`:64-81`）。`all=true` **仅 admin**，否则 403（`:29-31`）。`Content-Disposition: attachment; filename="wrong-notebook-export[-all]-YYYY-MM-DD.json"`（`:94-102`） |
| F2 | `POST /api/import?all=true` | `import/route.ts:96` | 体量上限 **50MB**（`:120-123`）。校验 `version`/`user`/`errorItems`（`:128-130`）。非 admin 模式校验 `body.user.email === 当前用户 email`（`:133-135`）。**整体包在 `$transaction`（timeout 60s）**（`:147,342-344`）：subjects 按 `(name,userId)` 去重映射 → customTags 去重 + parentId 重映射 → 预加载标签名避免 N+1（`:204-228`）→ errorItems 按 `(userId,subjectId,questionText)` 去重（`:237-250`）→ 关联 tags → reviewSchedules 按 `(errorItemId,scheduledFor)` 去重（`:307-313`）→ practiceRecords 全量插入（无去重，`:329-341`）。返回各表 `stats`（`:352-355`）。`masteryLevel` 被夹到 `[0,2]`（`:90-94`） |

### 3.7 用户 / 认证 / 设置 / 其他

| # | 方法 + 路径 | 文件:行 | 规则 |
|---|---|---|---|
| G1 | `GET/PATCH /api/user` | `user/route.ts:20,52` | GET 返回 `{name,email,educationStage,enrollmentYear}`（不含 password，`:30-37`）。PATCH 用 zod 校验（`:12-18`），邮箱正则 `/^[^\s@]+@[^\s@]+$/`（支持 `admin@localhost`，`:74-80`），密码 **≥6 位** 且 `bcrypt.hash(...,10)`（`:83-88`） |
| G2 | `POST /api/register` | `register/route.ts:16` | `allowRegistration === false` → 403（`:19-25`）。zod：邮箱正则 + 密码 `min(6)` + 名字 `min(1)`（`:7-14`）。已存在 → 409（`:34-39`）。`hash(password,10)`（`:41`）。**⚠️ `catch` 里吞掉所有错误统一返回 500 "Something went wrong"（`:58-63`），连 zod 校验失败也是 500 而不是 400** |
| G3 | `GET /api/register/status` | `register/status/route.ts:4` | `{allowRegistration}` |
| G4 | `GET/POST /api/settings` | `settings/route.ts:11,17` | ⚠️ **无任何认证校验**（`:11-15` 直接返回 config）。**GET 返回包含全部明文 API Key 的完整 config**（注释原文 "Return full config including API keys since this is an authenticated endpoint"，`:13` ——但事实上并不校验）。POST 支持 `'********'` 掩码回填保留原 key（Gemini `:23-26`、OpenAI 实例按 id 匹配 `:29-42`、Azure `:45-47`）。落盘到 `config/app-config.json` |
| G5 | `GET /api/version` | `version/route.ts:5` | 读 `package.json` 返回 `{version}` |
| G6 | `POST /api/logs/frontend` | `logs/frontend/route.ts:28` | 接收 `{logs:[...]}` 或单条，映射到服务端 logger（`:33-61`）。**无认证** |
| G7 | `GET/POST /api/auth/[...nextauth]` | `auth/[...nextauth]/route.ts:6` | NextAuth 处理器 |

### 3.8 管理员端点

| # | 方法 + 路径 | 文件:行 | 规则 |
|---|---|---|---|
| H1 | `GET /api/admin/dashboard` | `admin/dashboard/route.ts:11` | `requireAdmin(session)`（`:14`）。返回 `{overview{totalUsers,totalErrorItems,totalPracticeRecords,totalSubjects}, userStats[], subjectDistribution[], dailyTrend[7天], masteryDistribution{new,reviewing,mastered}}`（`:115-141`） |
| H2 | `GET /api/admin/users` | `admin/users/route.ts:11` | admin only；用户列表 + `_count{errorItems,practiceRecords}` |
| H3 | `PATCH/DELETE /api/admin/users/[id]` | `admin/users/[id]/route.ts:11,56` | admin only。**禁止禁用/删除自己**（`:27-29, 69-71`）；**禁止操作 `admin@localhost` 超级管理员**（`:36-38, 78-82`）。PATCH 只接受 `{isActive}` |
| H4 | `GET /api/admin/users/[id]/detail` | `admin/users/[id]/detail/route.ts:11` | 用户详情：notebooks、errorCount、practiceCount、recent7DaysCount、masteryDistribution、subjectDistribution、**最近 20 条错题**（`:108-123`） |
| H5 | `POST /api/admin/migrate-tags` | `admin/migrate-tags/route.ts:29` | ⚠️ **仅允许非 admin 用户的 session 被拒，且 `session.user.role` 从 JWT 取**（`:36-38`）。三步事务（timeout 120s，`:214-216`）：① 备份所有错题的系统标签关联（`:47-72`）；② **按学科 `deleteMany({isSystem:true})` 后从 `src/lib/tag-data` 重建全部系统标签**（`:74-113` + `seedMath :233-290` / `seedStandardSubject :292-334`）；③ 按 `(name, subject)` 复原关联，找不到系统标签时**降级为该管理员的私有自定义标签**（`:132-197`）。**这是破坏性重建** |
| H6 | `POST /api/admin/system-reset` | `admin/system-reset/route.ts:11` | admin only（`:19-21`）。**工厂重置**：`$transaction` 内 `practiceRecord.deleteMany({})`、`errorItem.deleteMany({})`、`subject.deleteMany({})`、`knowledgeTag.deleteMany({isSystem:false})`、**`user.deleteMany({email: {not: 当前用户}})`**（`:39-73`）。⚠️ **全是无过滤的全库 deleteMany，会删掉所有其他用户的数据**（不只是自己的）。前端要求输入 `RESET` 二次确认（`src/components/settings-dialog.tsx:297`） |

### 3.9 外部集成端点

| # | 方法 + 路径 | 文件:行 | 规则 |
|---|---|---|---|
| I1 | `POST /api/openclaw/batch-upload` | `openclaw/batch-upload/route.ts:195` | **不依赖 NextAuth**，走独立认证：`OPENCLAW_AUTH_MODE=apikey` 时校验请求头 `x-api-key` 与 `OPENCLAW_INTEGRATION_API_KEY`（`:199-236`）；默认 `credentials` 模式用 `{username, password}` 查库并 `bcrypt.compare`（`:239-286`，username 可匹配 email 或 name）。限制：**最多 20 张**（`MAX_IMAGES`，`:12,302-309`）、**单图 ≤5MB**（`MAX_IMAGE_SIZE`，`:13,47-50`）、**仅 `.jpg/.jpeg/.png`**（`:14-15,42-45`）。逐图调用外部 `POST {OPENCLAW_API_URL}/api/recognize`（默认 `http://localhost:8080`，`:56,63-74`），超时 `OPENCLAW_TIMEOUT`（默认 30000ms）并按图片数均分、**上限 3000ms/张**（`:329-330`）。返回 `201`（全成功）或 **`207 Multi-Status`**（部分失败），体为 `{success,total,successCount,failCount,results[]}`（`:400-408`） |

### 3.10 路由守卫（`src/middleware.ts`）

- matcher 排除 `api|_next/static|_next/image|favicon.ico`（`:62-72`）——**即所有 API 路由都不经中间件**，认证必须由每个 route 自己实现（这也解释了 G4/D4 的缺失）。
- 未登录访问任何非 auth 页面 → 重定向 `/login?callbackUrl=...`（`:39-49`）。
- 已登录访问 `/login` `/register` → 重定向 `/`（`:31-37`）。
- `/admin` 页面要求 `token.role === 'admin'`（`:52-55`）。
- cookie 名硬编码为 `next-auth.session-token`（`:16`，与 `src/lib/auth.ts:24` 一致）。

### 3.11 汇总：认证缺口清单（移植时必须补）

| 端点 | 问题 | 证据 |
|---|---|---|
| `GET/POST /api/settings` | **零认证**，返回明文 API Key | `settings/route.ts:11-15` |
| `GET /api/tags/stats` | **零认证 + 跨用户全库统计** | `tags/stats/route.ts:17-21` |
| `PATCH /api/error-items/[id]/notes` | 无 owner 校验（IDOR） | `[id]/notes/route.ts:31-38` |
| `POST /api/practice/generate` | 无 owner 校验（IDOR） | `practice/generate/route.ts:21-28` |
| `POST /api/logs/frontend` | 无认证 | `logs/frontend/route.ts:28` |
| `GET /api/ai/models` | 无认证，apiKey 通过 **query string** 传递（会进访问日志） | `ai/models/route.ts:68-80` |
| `POST /api/admin/system-reset` | 全库 deleteMany，非仅自身 | `admin/system-reset/route.ts:41-58` |

---

## 4. 前端页面与组件全清单

### 4.1 页面路由（14 个 `page.tsx`）

| 路由 | 文件 | 行数 | 说明 |
|---|---|---|---|
| `/` | `src/app/page.tsx` | 619 | 首页 + 录入工作台。三种输入模式 tab（`:42` `"image" \| "text" \| "direct"`）。含完整分析流程状态机 |
| `/login` | `src/app/login/page.tsx` | 94 | 登录 |
| `/register` | `src/app/register/page.tsx` | 269 | 注册。字段：name/email/password/confirmPassword/`educationStage`（默认 `junior_high`）/`enrollmentYear`（默认 `"2025"`）（`:17-27`）；进页先查 `/api/register/status`（`:33-42`） |
| `/notebooks` | `src/app/notebooks/page.tsx` | 160 | 错题本列表，卡片网格 + 新建/重命名/删除 |
| `/notebooks/[id]` | `src/app/notebooks/[id]/page.tsx` | 112 | 错题本详情，内嵌 `<ErrorList>`（`:101`） |
| `/notebooks/[id]/add` | `src/app/notebooks/[id]/add/page.tsx` | 379 | 指定错题本内新增错题（同样的上传→AI→编辑流程） |
| `/error-items/[id]` | `src/app/error-items/[id]/page.tsx` | 616 | 单题详情：分段 inline 编辑（题目/标签/元数据/答案/我的答案+错因/解析）+ 掌握标记 + 练习入口 + 删除 + 图片查看器 + GeoGebra |
| `/practice` | `src/app/practice/page.tsx` | 365 | 智能练习（`?id=<errorItemId>`） |
| `/stats` | `src/app/stats/page.tsx` | 58 | 统计中心，两个 Tab：错题统计 / 练习统计 |
| `/tags` | `src/app/tags/page.tsx` | 431 | 标签管理：树浏览 + 统计 + 新建/删除自定义标签 |
| `/print-preview` | `src/app/print-preview/page.tsx` | 313 | 打印预览，选项齐全 |
| `/admin` | `src/app/admin/page.tsx` | 397 | 管理看板 + 用户列表 |
| `/admin/user/[id]` | `src/app/admin/user/[id]/page.tsx` | 250 | 单用户详情 |
| `/latex-test` | `src/app/latex-test/page.tsx` | 68 | LaTeX 渲染自测页 |

另有 `src/app/layout.tsx`（53 行）、`src/app/globals.css`、`src/app/manifest.ts`（PWA，`manifest.ts:5-19`：name `智能错题本`、`display: standalone`、`theme_color: #f97316`、`orientation: portrait`）。

### 4.2 图片管线（重点）

#### 4.2.1 上传入口 `src/components/upload-zone.tsx`（232 行）

- 使用 **`react-dropzone`**（`:4,51`）。
- 接受类型：`{"image/*": [".jpeg", ".jpg", ".png"]}`（`:53-55`）——**只接受 JPEG/PNG**，且**不限制文件大小**（无 `maxSize`）。
- **`maxFiles: 1`**（`:56`）——单次只能一张。
- `isAnalyzing` 时 `disabled`（`:57`）。
- 拿到 File 后**不做任何处理**，直接 `onImageSelect(file)` 交给父组件（`:40-49`）——压缩发生在父组件。
- **额外能力：屏幕截图（getDisplayMedia）**（`:67-179`）：
  - 特性检测 `'getDisplayMedia' in navigator.mediaDevices`（`:60-65`），不支持则提示（`:69`）。
  - 用 `CaptureController` 的 `setFocusBehavior('no-focus-change')` 实现**截图时不切换标签页焦点**（`:77-111`）——这是较新的浏览器 API。
  - `canvas.toBlob(..., 'image/png', 1.0)`（`:155-165`），质量 1.0，输出 **PNG**（不同于压缩管线的 JPEG）。
  - 依赖 **HTTPS 安全上下文**（`doc/HTTPS_SETUP.md`；`README.md:19-21`）。
  - 挂载时请求 `Notification.requestPermission()`（`:35-37`）——申请了通知权限但后续并无实际通知使用（`console.log` 声称"截图完成"）。

#### 4.2.2 裁剪 `src/components/image-cropper.tsx`（172 行）

- 使用 **`react-image-crop`**（`ReactCrop`、`Crop`、`PixelCrop`、`centerCrop`、`makeAspectCrop`，`:4`）——**不是 react-easy-crop**。
- **自由比例（free aspect）**，无锁定：初始裁剪框为 `unit:'%', width:80, height:50, x:10, y:25`（`:48-58`）。
- 输出：`canvas.toBlob(cb, "image/jpeg")`（`:90-97`）——**只指定 MIME，未指定 quality**（默认 0.92）。
- 尺寸计算：`scaleX = naturalWidth / width`，画布尺寸 = 裁剪区 × scale（`:67-70`）——保留原始分辨率，**不降采样**。
- 兜底：若用户没设置裁剪框，`fetch(imageSrc)` 取原始 blob 直接返回（`:117-126`）。
- 父组件把 blob 包成 `new File([blob], "cropped-image.jpg", {type:"image/jpeg"})` 再送分析（`src/app/page.tsx:114`）。

#### 4.2.3 压缩 `src/lib/image-utils.ts`（100 行）—— 精确参数

```ts
// src/lib/image-utils.ts:9-14
export async function compressImage(
    file: File,
    maxSizeMB: number = 1,      // 阈值 1MB
    maxWidth: number = 1920,    // 最大宽度 1920px
    quality: number = 0.8       // 起始质量 0.8
): Promise<string>
```

- **阈值判定**：`processImageFile` 中 `const threshold = 1`（`:83`），`if (fileSizeMB > threshold)` 才压缩，否则 `readAsDataURL` 原样返回（`:87-99`）。
- **仅等比缩放宽度**：`if (width > maxWidth) { height = height*maxWidth/width; width = maxWidth }`（`:33-36`）——**高度不校验**（超长图会导致 height 巨大）。
- **编码格式：JPEG**，`canvas.toDataURL('image/jpeg', currentQuality)`（`:46`）。
- **体积估算**：`sizeInMB = compressed.length * 3 / 4 / 1024 / 1024`（`:49`）——按 base64 长度 × 3/4 反推字节。
- **质量递减循环**：每次 `-0.1`，下限 `> 0.1`，达标即 break（`:52-60`）。
- **返回 base64 data URL 字符串**（不是 Blob、不是 File）。
- 全程 `console.log` 打点（`:57,62,85,88,91`），无 logger 抽象。

#### 4.2.4 数据流向（图片最终怎么进后端）

1. `UploadZone.onDrop` → `onImageSelect(file)`（`upload-zone.tsx:40-49`）
2. `page.tsx:105-109` `onImageSelect` → `URL.createObjectURL(file)` 开裁剪弹窗
3. `page.tsx:111-116` `handleCropComplete(blob)` → 包成 File → `handleAnalyze(file)`
4. `page.tsx:130` `const base64Image = await processImageFile(file)` → `setCurrentImage(base64Image)`
5. **`page.tsx:139-143`**：
   ```ts
   const data = await apiClient.post<AnalyzeResponse>("/api/analyze", {
       imageBase64: base64Image,          // ← base64 data URL，JSON 体内
       language: language,
       subjectId: initialNotebookId || autoSelectedNotebookId || undefined
   }, { timeout: aiTimeout });
   ```
   **▶ 明确是 JSON body 携带 base64 字符串，不是 multipart 上传。**
6. 保存时 `page.tsx:266-269`：`{...finalData, originalImageUrl: currentImage || ""}` → `POST /api/error-items`（同样 JSON）→ 最终以 base64 data URL 落库。

**因此：全程没有对象存储、没有 multipart；图片在 HTTP body 和数据库里都是 base64 字符串。** 这意味着请求体会是原图 4/3 大小，`apiClient` 默认超时 60s 被 `aiTimeout`（默认 180000ms，`src/lib/config.ts:120`）覆盖。

#### 4.2.5 文本录入两条路径

- `src/components/text-input-zone.tsx`（95 行）：**"AI 解题"模式**。输入题目文本 → `POST /api/reanswer`（`page.tsx:309-320`）。支持 **Ctrl/Cmd+Enter 提交**（`text-input-zone.tsx:27-34`）。提示支持 Markdown/LaTeX（`:57`）。**注意：返回后 `subject` 被硬编码为 `"数学"`**（`page.tsx:333`，注释"Default, will be overridden by notebook selection"）。
- `src/components/direct-text-editor.tsx`（287 行）：**"直接录入"模式**，完全不调用 AI。字段：`questionText, answerText, analysis, wrongAnswerText, mistakeAnalysis, mistakeStatus, knowledgePoints, subjectId, gradeSemester, paperLevel`（`:39-48`）→ 直接 `POST /api/error-items`（`page.tsx:390-402`）。

### 4.3 录入 → 查看 → 复习 → 掌握标记 的完整用户路径

```
1. 录入
   / 首页三 tab（page.tsx:526-558）
   ├─ [拍照上传] UploadZone → ImageCropper → processImageFile(base64)
   │   → POST /api/analyze → 得 ParsedQuestion → step="review"
   ├─ [AI解题]   TextInputZone → POST /api/reanswer（纯文本，无图）
   └─ [直接录入] DirectTextEditor → 直接 POST /api/error-items（跳过 AI）
2. 确认/纠错（step==="review"）
   CorrectionEditor（correction-editor.tsx:49）
   ├─ 左侧编辑：错题本选择 / 年级学期 / 试卷等级(a,b,other) / 题目 / 标签 / 答案 / 解析 / 作答状态+错误解答+错因
   ├─ 🔄 [重新解题] → POST /api/reanswer（buildReanswerRequestBody，reanswer-request.ts:9-36；
   │                有 imagePreview 时把图一起带上做错因判断）
   ├─ 📦 [生成演示] → POST /api/geogebra-analyze
   └─ 💾 [保存] → onSave → POST /api/error-items
                → 成功后 alert + router.push(`/notebooks/${subjectId}`)（page.tsx:283-285）
3. 查看列表
   /notebooks/[id] → ErrorList（error-list.tsx:41）
   ├─ 搜索框（questionText/analysis/wrongAnswerText/mistakeAnalysis/knowledgePoints）
   ├─ 掌握状态筛选（全部/待复习/已掌握）+ 时间范围（全部/一周/一月）
   ├─ KnowledgeFilter（年级学期 → 章节 → 知识点 三级联动，knowledge-filter.tsx:236-275）
   ├─ 试卷等级按钮组（全部/A/B/其他）
   ├─ 分页（默认 18/页，pagination.tsx）
   ├─ 卡片：掌握 Badge、日期、80 字摘要(cleanMarkdown)、作答状态 Badge、标签(默认 3 个，可展开)
   └─ 多选模式 → 底部固定操作栏 → POST /api/error-items/batch-delete
4. 查看单题
   /error-items/[id]（error-items/[id]/page.tsx:53）
   ├─ 分块 inline 编辑：题目(:278) / 标签(:189) / 元数据 错题本+年级+试卷(:230) /
   │                  答案(:303) / 我的答案+错因(:353) / 解析(:328) / 笔记(:179)
   ├─ 图片：查看原题图片（默认折叠，:530-537）+ 全屏 viewer(:587-613) + 浮动题目卡(:410-423)
   ├─ 📦 GeoGebra 区（有 commands 则渲染 demo，否则给"生成演示"按钮，:576-581）
   └─ 顶部操作：返回 / 🔄练习 / ✅掌握标记 / 🗑删除（:454-488）
5. 掌握标记
   toggleMastery（:144-157）：newLevel = masteryLevel > 0 ? 0 : 1
   → PATCH /api/error-items/[id]/mastery → 本地 setItem 乐观更新 + alert
   ★ 注意：只有 0/1 两态，schema 里的 level 2 (Mastered) 前端从不产生
6. 复习/练习
   /practice?id=<id>（practice/page.tsx:20）
   ├─ 难度四选一 easy/medium/hard/harder（:163-180）
   ├─ [生成练习] → POST /api/practice/generate {errorItemId, language, difficulty}
   ├─ 做题 → 输入答案 → [提交答案]
   │   判分逻辑（纯客户端字符串比较，:100-117）：
   │     normalize = trim().toLowerCase().replace(/[.,;!]/g,'')
   │     ① 完全相等
   │     ② 用户输入单个 a-d 且正确答案以其开头 → 对（选择题）
   │     ③ 答案 contains 用户输入 且 用户输入长度>1 → 对
   ├─ 显示对/错 + 你的笔记 → POST /api/practice/record {subject, difficulty, isCorrect}
   └─ 展开正确答案 + 详细解析（MarkdownRenderer）
   ⚠️ 没有"间隔复习队列"，没有"今日待复习"，没有 ReviewSchedule 的 UI
7. 统计
   /stats（stats/page.tsx:37-55）
   ├─ Tab1 WrongAnswerStats → GET /api/analytics（Pie 学科分布 + Bar 近7天录入 + 3 张概览卡）
   └─ Tab2 PracticeStats   → GET /api/stats/practice（Pie 学科 + 堆叠 Bar 月度×难度 + 3 张概览卡）
8. 导出打印
   ErrorList [导出打印]（:64-82）把当前全部筛选条件序列化进 URL → /print-preview
   → GET /api/error-items/list?pageSize=200（PRINT_PREVIEW_PAGE_SIZE，print-preview/page.tsx:38）
   → 选项：图片缩放 30%-100% / 显示题目文本 / 显示答案 / 显示解析 / 显示知识点
   → 逐题勾选（默认全选）→ [Print / Save PDF] = window.print()（:49-51）+ print: CSS 类
```

### 4.4 关键组件清单

| 组件 | 文件 | 行数 | 职责/要点 |
|---|---|---|---|
| `ErrorList` | `src/components/error-list.tsx` | 488 | 错题列表 + 全部筛选 + 分页 + 多选批删 + 导出打印入口。筛选变化自动回第 1 页（`prevFiltersRef` diff，`:171-196`） |
| `KnowledgeFilter` | `src/components/knowledge-filter.tsx` | 277 | **年级→章节→知识点三级联动下拉**。按用户 `educationStage`/`enrollmentYear` 计算可用年级（`:89-143`）；标签树来自 `GET /api/tags?subject=`（`:162`）。有 `EDUCATION_GRADE_MAP`（`:35-39`）和 `GRADE_TO_SEMESTERS`（`:43-56`）两张硬编码映射表 |
| `CorrectionEditor` | `src/components/correction-editor.tsx` | 498 | AI 结果确认/纠错主编。左编辑右预览（question/answer/analysis/错因 四张预览卡） |
| `DirectTextEditor` | `src/components/direct-text-editor.tsx` | 287 | 纯手工录入表单，无 AI。字段级 `required` 标记（`:200`） |
| `TextInputZone` | `src/components/text-input-zone.tsx` | 95 | AI 解题文本输入 |
| `UploadZone` | `src/components/upload-zone.tsx` | 232 | dropzone + 屏幕截图 |
| `ImageCropper` | `src/components/image-cropper.tsx` | 172 | 自由裁剪，输出 JPEG blob |
| `TagInput` | `src/components/tag-input.tsx` | 161 | 带联想下拉的标签输入。调 `GET /api/tags/suggestions`（`:48`）；键盘上下选 + Enter 确认（`handleKeyDown :81-88`）；点击外部关闭（`:104-105`） |
| `GeogebraDemo` | `src/components/geogebra-demo.tsx` | 323 | **从 CDN 动态加载 GeoGebra**：`https://www.geogebra.org/apps/deployggb.js`（`:29`），**单例 promise 缓存**（`:19-39`）。`appName:"classic"`、`language:"zh"`、`enableShiftDragZoom`（`:166-189`）。命令解析同时支持 **JSON 数组**与**换行分隔**（`parseCommands :42-53`）。区分两类命令：`API_PREFIXES` 白名单 16 个方法走 `api[method](...)`（`:55-65`），其余走 `api.evalCommand`，且**做了 `/[<>'"]/` 字符黑名单过滤**防注入（`:109-115`）。用 `innerHTML` 注入 DOM 并显式规避 React 协调（`:133-136, 292-297`）。功能：重置、放大/缩小、重新生成 |
| `MarkdownRenderer` | `src/components/markdown-renderer.tsx` | 81 | `react-markdown` + `remarkMath` + `remarkGfm` + `rehypeKatex`（`:38-39`）。**前置文本修整逻辑很重**：`\n` 转义还原、单换行智能转段落、中文标点后断行、序号/带圈数字防代码块、`$` 公式与文本间补空格（`:16-33`） |
| `WrongAnswerStats` | `src/components/wrong-answer-stats.tsx` | 179 | recharts：PieChart（学科分布）+ BarChart（近 7 天录入，带渐变 fill）+ 3 张概览卡 |
| `PracticeStats` | `src/components/practice-stats.tsx` | 209 | recharts：PieChart（学科）+ **堆叠 BarChart**（月度 × 难度，`stackId="a"`，`:196`）+ 自定义 Tooltip + 3 张卡。难度色板 `DIFFICULTY_COLORS`（`:12-18`） |
| `SettingsDialog` | `src/components/settings-dialog.tsx` | 1451 | 6 个 Tab（见 4.5） |
| `PromptSettings` | `src/components/settings/prompt-settings.tsx` | 189 | 自定义 analyze/similar 提示词模板，带 `{{变量}}` 说明与一键重置 |
| `ModelSelector` | `src/components/ui/model-selector.tsx` | 146 | 调 `GET /api/ai/models` 拉模型列表，支持"自定义模型名"模式（`:32-33,56`） |
| `Pagination` | `src/components/ui/pagination.tsx` | 124 | 首/上/页码/下/末，最多显示 `MAX_VISIBLE_PAGES`=5 个页码按钮（`:34`） |
| `NotebookSelector` | `src/components/notebook-selector.tsx` | 59 | 错题本下拉，数据来自 `GET /api/notebooks` |
| `NotebookCard` / `CreateNotebookDialog` / `RenameNotebookDialog` | `src/components/notebook-card.tsx`(66) / `create-notebook-dialog.tsx`(72) / `rename-notebook-dialog.tsx`(71) | — | 错题本卡片与增改弹窗 |
| `UserWelcome` | `src/components/user-welcome.tsx` | 26 | `useSession` 显示用户名 |
| `BroadcastNotification` | `src/components/broadcast-notification.tsx` | 84 | **硬编码两条公告**（无后端）：① 去 设置→账户 填学段/入学年份（`:52-64`）② 标准标签库加载失败时用管理员重置（`:67-79`）。未读红点纯前端 state（`:17`），刷新即复现 |
| `ProgressFeedback` | `src/components/ui/progress-feedback.tsx` | 51 | 分析进度遮罩 |
| `Providers` | `src/components/providers.tsx` | 12 | SessionProvider + LanguageProvider |
| `UserManagement` | `src/components/admin/user-management.tsx` | 233 | 管理端用户表：启用/禁用、删除 |

**`ui/` 下 19 个 shadcn 组件**：`back-button, badge, button, card, checkbox, dialog, dropdown-menu, input, label, model-selector, pagination, progress, progress-feedback, select, slider, switch, table, tabs, textarea`。

### 4.5 设置弹窗的 6 个 Tab（`settings-dialog.tsx`）

| Tab | 内容 | 行 |
|---|---|---|
| `general` | 语言切换、**AI 分析超时（秒）**（改 `config.timeouts.analyze`） | `:677-773` |
| `account` | 姓名/邮箱/学段/入学年份/修改密码 | `:681-893` |
| `ai`（仅 admin 可见，`:686`） | Provider 选择（gemini/openai/azure）、OpenAI **多实例管理（上限 10，`MAX_OPENAI_INSTANCES` `:35`）**、Azure endpoint/deployment/apiVersion、**连接测试**（文本+视觉双能力结果） | `:687-1203` |
| `prompts`（仅 admin） | 自定义 analyze / similar 提示词模板 | `:691-1233` |
| `admin`（仅 admin） | 用户管理（内嵌 `UserManagement`） | `:695-698` |
| `danger` | **导出数据 / 导出全部 / 导入数据 / 导入全部 / 迁移标签 / 清除练习数据 / 清除错题数据 / 系统初始化（需输入 `RESET`）** | `:701-1486` |
| `about` | 版本（`GET /api/version`）、GitHub、Release Notes、Feedback 链接 | `:705-1536` |

`AdminPage`（`src/app/admin/page.tsx`）独立于设置弹窗，走 `GET /api/admin/dashboard`（`:336`），含概览卡 + 趋势 + 学科分布 + 用户列表。

### 4.6 i18n

- 机制：React Context + `localStorage`，**无路由前缀、无 SSR 国际化**。
  - `src/contexts/LanguageContext.tsx:15` 默认 `'zh'`；`:18-22` 从 `localStorage['app-language']` 恢复；`:24-27` 切换时写回。
- 语言：**仅 `'zh' | 'en'` 两种**（`src/lib/translations.ts:1` `export type Language = 'zh' | 'en'`；`:3` `export const translations = {`）。
- 规模：`translations.ts` 共 1296 行，是最大的文件之一；`t.xxx` 深度嵌套（`t.settings.prompts.vars.languageInstruction` 等）。
- 语言也影响**后端行为**：`language` 参数一路传到 AI prompt（`src/lib/ai/prompts.ts:322-324`）和年级字符串格式（`src/lib/grade-calculator.ts:56-63`：中文返回 `"高一上"`，英文返回 `"Senior High Grade 1, 1st Semester"`）及错误提示映射（`src/app/page.tsx:213-227` 用 `t.errors[backendErrorType]`）。

### 4.7 可访问性缺口

`src/app/error-items/[id]/page.tsx:588-613` 的图片 Viewer 用 `<div onClick>` 实现遮罩关闭、`<button>` 无 `aria-label`；`upload-zone.tsx` 等大量交互用 `alert()` / `confirm()` 原生弹窗（如 `page.tsx:240`、`error-list.tsx:151`、`error-items/[id]/page.tsx:163`），共计数十处，不利于自动化测试与无障碍。

---

## 5. AI 能力细节

### 5.1 架构

```
getAIService()  ← src/lib/ai/index.ts:13-29（每次调用都重新读配置，支持热切换）
  ├── aiProvider === "openai" → new OpenAIProvider(getActiveOpenAIConfig())   :18-21
  ├── aiProvider === "azure"  → new AzureOpenAIProvider(config.azure)         :22-24
  └── 默认                     → new GeminiProvider(config.gemini)            :25-27

AIService 接口 ← src/lib/ai/types.ts:26-31（4 个方法）
  analyzeImage(imageBase64, mimeType?, language?, grade?, subject?, gradeSemester?)
  generateSimilarQuestion(originalQuestion, knowledgePoints[], language?, difficulty?, gradeSemester?)
  reanswerQuestion(questionText, language?, subject?, imageBase64?, gradeSemester?)
  analyzeForGeogebra(questionText, answerText, analysis, previousErrors?)
```

### 5.2 各 AI 功能详解

#### F1. 图片识题 + 解析（`analyzeImage`）
- **输入**：base64 图片 + mimeType + 语言 + 年级(7-12) + 中文科目 + 年级学期。
- **输出**：`ParsedQuestion`，由 **Zod schema** 严格定义（`src/lib/ai/schema.ts:7-21`）：
  | 字段 | 类型 | 约束 |
  |---|---|---|
  | `questionText` | string | `min(1)` |
  | `answerText` | string | `min(1)` |
  | `analysis` | string | `min(1)` |
  | `wrongAnswerText` | string | optional，default `""` |
  | `mistakeAnalysis` | string | optional，default `""` |
  | `mistakeStatus` | enum | `not_attempted`/`wrong_attempt`/`unknown`，default `unknown` |
  | `subject` | enum | 10 值：数学/物理/化学/生物/英语/语文/历史/地理/政治/其他 |
  | `knowledgePoints` | string[] | **`max(5)`** |
  | `requiresImage` | boolean | optional，default `false` |
- **解析方式：自定义 XML 标签，不是 JSON**（关键设计）。provider 用 `extractTag(text, tagName)` 做 `indexOf(<tag>)` / `lastIndexOf(</tag>)` 字符串截取（`src/lib/ai/gemini-provider.ts:88-99`）。
- **降级策略**：Zod 校验失败**不抛错**，只 `logger.warn` 并返回未校验对象（`gemini-provider.ts:151-158`）——即宽松模式。
- **硬校验**：`questionText/answerText/analysis` 任一缺失 → 抛 `"Invalid AI response: Missing critical XML tags"`（`:115-118`）。
- **`mistakeStatus` 后处理**：`normalizeMistakeStatusForSave(status, wrongAnswerText)`——**只要 `wrongAnswerText` 非空就强制为 `wrong_attempt`**（`src/lib/mistake-status.ts:14-16`）。

#### F2. 相似题生成（`generateSimilarQuestion`）
- **输入**：原题文本 + 知识点数组 + 语言 + 难度（4 档）+ 年级学期。
- **输出**：同 `ParsedQuestion`（只用到 question/answer/analysis，见模板）。
- **难度指令映射**（`prompts.ts:433-438`）：
  - `easy` → "Make the new question EASIER than the original. Use simpler numbers and more direct concepts."
  - `medium` → "Keep the difficulty SIMILAR to the original question."
  - `hard` → "Make the new question HARDER... Combine multiple concepts or use more complex numbers."
  - `harder` → "Make the new question MUCH HARDER (Challenge Level). Require deeper understanding and multi-step reasoning."
- **模板承诺的 12 种变式技法**（`prompts.ts:222`，逐字）："条件替换/情境迁移/问题转化/数据重构/图形变形/角色反转/跨学科融合/难度阶梯/开放拓展/陷阱设计/逆向思维/生活应用"。
- 输出标签仅 3 个：`<question_text>` / `<answer_text>` / `<analysis>`（`:248-260`）。
- ⚠️ **A4 端点的知识点来源是已废弃的 `knowledgePoints` JSON 字段**（见 2.4.2）。

#### F3. 重新解题（`reanswerQuestion`）
- **输入**：校正后的题目文本 + 语言 + 科目 +**可选图片** + 年级学期。
- **输出**：`{answerText, analysis, knowledgePoints[], wrongAnswerText, mistakeAnalysis, mistakeStatus}`（`src/lib/ai/types.ts:11-18`）。
- **双模态**：有图时 `contents = [{text: prompt}, {inlineData:{mimeType:'image/jpeg', data: base64WithoutPrefix}}]`（`gemini-provider.ts:308-318`），**mimeType 硬编码为 `image/jpeg`**——传 PNG 会标错类型。
- 输出 6 个 XML 标签（`prompts.ts:473-498`），并**特别强调不要猜测**学生作答痕迹（`:489,493,497` 三处 "不要猜测"/"看不到...请留空"）。

#### F4. GeoGebra 演示生成（`analyzeForGeogebra`）
- **输入**：questionText + answerText + analysis + **可选 previousErrors（重试反馈）**。
- **输出**：`{suitable: boolean, commands: string[], description: string}`（`types.ts:20-24`）。
- **这是唯一要求 JSON 输出的 AI 功能**（`prompts.ts:581-587`）。解析做了三层容错：先正则剥 ```json``` 代码块（`gemini-provider.ts:376-379`），再取第一个 `{` 到最后一个 `}` 的子串（`:382-386`），然后 `JSON.parse`（`:388`）。
- **提示词内嵌完整的 GeoGebra 命令白名单**（`prompts.ts:544-578`），分两类：
  - 绘图命令（走 `evalCommand`）：函数/点/线/线段/圆/椭圆/多边形/交点/中点/垂线/平行线/角度/文本/**滑动条 Slider**/轨迹/反射/平移/旋转（`:548-565`）
  - Applet API 设置（走方法调用）：`setCoordSystem / setAxesVisible / setGridVisible / setColor / setLineThickness / setLineStyle / setPointSize / setPointStyle / setLabelVisible / setCaption / setFilling`（`:568-578`）
- **适用性判断标准**也写进提示词：适合 7 类（函数与图像/几何图形/解析几何/向量/概率统计/不等式/立体几何部分）；不适合 6 类（纯文字推理与证明/纯计算/概念辨析与选择/非理科/纯概率计算/数列通项推导）（`:526-542`）。
- **9 条 CRITICAL RULES**（`:589-604`），其中第 9 条是最长的**命令语法自检清单**（a-f，`:598-604`）：变量先定义、命令名必须是官方指令（**明确举例："平行线用 `Line(P, l)` 而非 `ParallelLine(P, l)`"**）、顺序合理、语法正确、循环条件语法、`setCoordSystem` 必须在所有绘图命令之前。
- **重试闭环**：`generateGeogebraPrompt(..., previousErrors)` 注入 5 步修正规则（`prompts.ts:622-626`），前端 [重新生成] 按钮触发（`geogebra-demo.tsx:246-254`）。

### 5.3 提示词文件与结构

- **文件**：`src/lib/ai/prompts.ts`（665 行，实际代码 460 行左右）。
- **占位符机制**：`replaceVariables(template, vars)` 用 `/\{\{(\w+)\}\}/g` 替换，**未定义的变量替换为空串**（`:271-275`）——静默容错。
- **三个主模板 + 一个 GeoGebra 模板**：
  | 常量 | 行 | 输出格式 | 角色 |
  |---|---|---|---|
  | `DEFAULT_ANALYZE_TEMPLATE` | `:115-213` | **9 个 XML 标签** | "世界顶尖的、经验丰富的、专业的跨学科考试分析专家" |
  | `DEFAULT_SIMILAR_TEMPLATE` | `:215-266` | 3 个 XML 标签 | "资深的K12教育题目生成专家" / "题目变异大师" / "学情分析师" |
  | `DEFAULT_REANSWER_TEMPLATE` | `:457-506` | 6 个 XML 标签 | "经验丰富的专业教师" |
  | `DEFAULT_GEOGEBRA_PROMPT` | `:512-604` | **纯 JSON** | "专业的 GeoGebra 数学可视化专家" |
- **9 个 XML 标签全名**（analyze）：`subject` / `knowledge_points` / `requires_image` / `wrong_answer_text` / `mistake_status` / `mistake_analysis` / `question_text` / `answer_text` / `analysis`（`:125-197`）。
- **变体占位符**（analyze）：`{{language_instruction}}`、`{{knowledge_points_list}}`、`{{grade_instruction}}`、`{{provider_hints}}`（`:118,200,212,213`）。三者被 `settings/prompt-settings.tsx:111-122` 暴露给管理员编辑。
- **🚫 反复强调的关键约束（逐字）**：
  - `prompts.ts:121`："**严禁**使用 JSON 或 Markdown 代码块。**严禁**对 LaTeX 公式中的反斜杠进行二次转义（如 `"\\frac"` 是错误的，必须是 `"\frac"`）。"
  - `prompts.ts:207`："必须严格包含上述 9 个 XML 标签，除此之外不要输出任何其他'开场白'或'结束语'。"
  - `prompts.ts:210`："**禁止图片**：严禁包含任何图片链接或 markdown 图片语法。"
  - `prompts.ts:204`："每题最多 5 个标签。"
- **表格转录规则**（`prompts.ts:152-185`）——非常详细，5 组规则：标准表格用 Markdown 语法；复杂表格（合并单元格/多级表头）先文字说明结构再用简化表 + 注释；完整性要求（空单元格用 `-`、保留标题/单位/注释、对齐与分组）；上下文（表号前置、注释后置）；特殊情况（图表混合说明位置关系、**手写表格不确定处用 `[?]` 标注**、模糊表格注明"（表格内容可能不完整）"）。
- **语言注入策略**（`:322-324`）：中文模式下要求 analysis 用简体中文，但 **questionText/answerText 必须与原题语言一致**（英文题保持英文）。
- **学历约束**（`generateGradeInstruction`，`:89-95`）：把年级转中文显示名后注入"本题目标年级：X，请严格使用该年级课程标准范围内的方法解答，**禁止使用超纲知识**"。
- **标签注入按科目裁剪以省 token**（`:342-401`）：识别到 `数学/物理/化学/生物/英语` 时只放该学科标签列表（并提示"必须从上述列表中选择精确匹配的标签"）；未知科目才把 5 个学科列表全放。
- **年级→标签的累进规则**（`src/lib/ai/tag-service.ts:23-49`）：初中累进（7 含 7；8 含 7-8；9 含 7-9），**高中不跨学段**（10 只含高一；11 含高一+高二；12 含高一到高三）。
- **无标签兜底**：`getMathTagsForGrade` 若拿不到预取标签就返回空数组并 `console.warn('[prompts] No prefetched tags provided, AI will tag freely')`（`prompts.ts:300-307`）。

### 5.4 三大 Provider 实现要点

| 项 | Gemini | OpenAI | Azure OpenAI |
|---|---|---|---|
| 文件 | `src/lib/ai/gemini-provider.ts`(369) | `src/lib/ai/openai-provider.ts`(459) | `src/lib/ai/azure-provider.ts`(399) |
| SDK | `@google/genai` `GoogleGenAI` | `openai` `OpenAI` | `openai` `AzureOpenAI` |
| 默认模型 | **`gemini-2.0-flash`**（`:39`）⚠️ 但 config 默认是 `gemini-2.5-flash`（`src/lib/config.ts:106`）——**两处默认值不一致** | `gpt-4o`（`:40`） | `deployment`（`:56`） |
| 基址配置 | `httpOptions.baseUrl`，注释明确说是为**避免全局 `setDefaultBaseUrls` 的竞态**（`:30-37`） | `new OpenAI({ baseURL })`（`:32-34`） | `endpoint` + `deployment` + `apiVersion`（`:49-53`） |
| **重试** | ✅ **有**：`retryOperation`，**maxRetries=3**，**指数退避 `2^(attempt-1) * 1000ms`** = 1s/2s/4s（`:50-86`）。可重试条件含 503/502/504/network/connect/overloaded/timeout/ETIMEDOUT/ENOTFOUND/ECONNRESET/ECONNREFUSED/unavailable | ❌ 未见等价重试封装 | ❌ 未见等价重试封装 |
| max_tokens | 未显式设置 | **8192**（识题/相似题/重解题，`:216,249,281,341,401,411`）/**4096**（GeoGebra，`:467`） | 未在检索结果中出现 |
| `response_format: json_object` | 不适用 | **已注释掉**，注释原文："Removing to improve compatibility with 3rd party providers"（`:280,340`） | 同样 |
| 特殊适配 | — | `this.isLongCat = this.baseURL.includes('longcat.chat')`（`:43`）——针对 LongCat 服务商的特判 | — |
| 错误归一化 | `handleError` 映射到 9 个码：`AI_CONNECTION_FAILED / AI_TIMEOUT_ERROR(AI_QUOTA_EXCEEDED / AI_PERMISSION_DENIED / AI_NOT_FOUND / AI_SERVICE_UNAVAILABLE / AI_RESPONSE_ERROR / AI_AUTH_ERROR / AI_UNKNOWN_ERROR`（`:402-438`） | `handleError`（`:503+`） | `handleError` |

**Fallback 总结**：没有"主 provider 失败自动切备用 provider"的机制。`getAIService()` 是单选（`index.ts:16-28`）。唯一的降级是：
1. OpenAI 多实例（最多 10 个，`src/lib/config.ts:203`）——但一次请求只用一个 active 实例；
2. Gemini 的网络级重试（3 次）；
3. Zod 校验失败时返回未校验数据（宽松模式）；
4. AI 错误码透传到前端，由 i18n 字典翻译成用户提示（`src/app/page.tsx:213-227`）。

### 5.5 环境变量 / 配置（AI 相关）

`src/lib/config.ts:90-122` 的 `DEFAULT_CONFIG` 与 `.env.example`：

| 变量 | 默认值 | 依据 |
|---|---|---|
| `AI_PROVIDER` | `gemini` | `.env.example:20`；`config.ts:91` |
| `GOOGLE_API_KEY` | 无（必填） | `.env.example:28`；`config.ts:104` |
| `GEMINI_BASE_URL` | 无（`https://generativelanguage.googleapis.com`） | `.env.example:29`；`gemini-provider.ts:40` |
| `GEMINI_MODEL` | `gemini-2.5-flash` | `.env.example:30`；`config.ts:106` |
| `OPENAI_API_KEY` | 无 | `.env.example:23`；`config.ts:94-101`（会生成 id 为 `env-default` 的实例） |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | `.env.example:24`；`config.ts:98` |
| `OPENAI_MODEL` | `gpt-4o` | `.env.example:25`；`config.ts:99` |
| `AZURE_OPENAI_API_KEY` | 无 | `config.ts:109`（`.env.example` **未列**） |
| `AZURE_OPENAI_ENDPOINT` | 无 | `config.ts:110` |
| `AZURE_OPENAI_DEPLOYMENT` | 无 | `config.ts:111` |
| `AZURE_OPENAI_API_VERSION` | `2024-02-15-preview` | `config.ts:112` |
| `AZURE_OPENAI_MODEL` | `gpt-4o` | `config.ts:113` |
| `timeouts.analyze` | **180000 ms** | `config.ts:120` |

**优先级**（`src/lib/config.ts:124-163`，与 `doc/PROJECT_OVERVIEW.md:221-226` 一致）：
```
config/app-config.json  >  环境变量  >  DEFAULT_CONFIG（代码硬编码）
```
- 落盘路径：`path.join(process.cwd(), 'config', 'app-config.json')`（`:7`）。
- **配置里含明文 API Key**（`doc/PROJECT_OVERVIEW.md:252` 自己列为已知问题："`app-config.json` 明文存储 API Key"）。
- 有**旧版 OpenAI 配置自动迁移**逻辑：检测 `'apiKey' in config && !('instances' in config)` 即视为旧格式，迁移为单实例并立即写盘（`:53-58, 69-88, 130-142`）。
- 读写用**同步 `fs.readFileSync/writeFileSync`**（`:127,181`）——`doc/PROJECT_OVERVIEW.md:250` 自认为会阻塞事件循环。

**非 AI 但必需的环境变量**：`DATABASE_URL`（`.env.example:3`，默认 `file:./dev.db`）、`NEXTAUTH_SECRET`（`:7`）、`NEXTAUTH_URL`（`:12`，可注释）、`AUTH_TRUST_HOST`（`:16`）、`LOG_LEVEL`（`:35`）、`DEBUG_DB`（`:39`）、`HTTP_PROXY`/`HTTPS_PROXY`（`README.md:122-123`；消费方 `src/lib/global-proxy.ts:7-9`）、`OPENCLAW_*` 5 个（`.env.example:43-54`）。

---

## 6. 其他值得一提的能力

### 6.1 间隔复习算法 —— **未真实实现（死代码）**

- **算法本身存在**：`src/lib/scheduler.ts`（仅 20 行）实现了艾宾浩斯间隔：
  ```ts
  const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30];            // :4
  export function calculateNextReviewDate(currentStage) {     // :6
      const interval = REVIEW_INTERVALS[currentStage] || 30;  // :7
      return addDays(new Date(), interval);                   // :8
  }
  export function getReviewStageDescription(stage) {}         // :11-19
  ```
- **但这两个函数在整个 `src/` 中没有任何调用点。** 全仓库检索 `calculateNextReviewDate|getReviewStageDescription` 命中仅 `scheduler.ts:6,11` 本身（定义处）。
- `ReviewSchedule` 表同样只在 export/import 里出现（见 2.5 的完整命中列表）。
- **结论**：没有 FSRS、没有 SM-2、没有"今日待复习"队列、没有复习提醒、没有复习完成记录 UI。`ReviewSchedule` 是一张只进导出流水、不进业务流程的空壳表。**移植时这一块等于从零做**（但可以复用 `[1,2,4,7,15,30]` 这个间隔序列作为产品决策参考）。

### 6.2 统计与图表 —— 真实实现

- **2 个统计 API + 2 个图表组件 + 3 种图表类型**（全部 recharts `^3.5.0`）：
  - `WrongAnswerStats`：PieChart（学科分布，内嵌环 `innerRadius=60/outerRadius=80`，百分号 label）+ BarChart（近 7 天录入量，`linearGradient` fill）+ 3 张概览卡（总错题/已掌握/掌握率）（`src/components/wrong-answer-stats.tsx:112-175`）。
  - `PracticeStats`：PieChart（学科）+ **堆叠 BarChart**（近 6 个月 × 4 档难度，`stackId="a"`，最后一根加圆角 `radius:[4,4,0,0]`）+ 自定义 Tooltip 带合计行 + 3 张卡（总练习数/正确率/活跃月数）（`src/components/practice-stats.tsx:140-203`）。难度色板：easy `#4ade80`、medium `#facc15`、hard `#fb923c`、harder `#f87171`、Unknown `#94a3b8`（`:12-18`）。
  - **Admin 看板**（`src/app/admin/page.tsx`）另有一套：概览卡 + 趋势 + 学科分布 + 掌握度分布（new/reviewing/mastered，来自 `admin/dashboard/route.ts:109-113`）。
- **服务端聚合方式**：`prisma.groupBy(by:['subject'|'difficulty'])` + 应用层月度桶化（`stats/practice/route.ts:23-73`）。`analytics` 的近 7 天是**循环 7 次 count 查询**（N+1，`analytics/route.ts:58-84`）。
- 空数据时 `PracticeStats` 直接 `return null`（`practice-stats.tsx:76-78`）。

### 6.3 导出 —— 有，但只有 JSON

- `GET /api/export` 输出**结构化 JSON 备份**（`version:1`，含 5 张表），不是 CSV/Excel（`export/route.ts:64-102`）。
- **打印/PDF 导出**是另一条路：`/print-preview` 页面 + `window.print()` + Tailwind `print:` 变体（`print-preview/page.tsx:49-51, 89, 199, 216`）。支持勾选题目、图片缩放 30-100%、显示题目文本/答案/解析/知识点。
- `shouldReserveAnswerSpace(showAnswers, showAnalysis)`：两个都不显示时预留答案空白区（`src/lib/print-preview.ts:12-14`，配合 `pb-20 print:pb-16`）。
- **无图片单独导出、无错题集 PDF 生成服务端渲染。**

### 6.4 搜索

- 只有一种：`GET /api/error-items/list?query=`，在 **5 个字段**上做 SQL `contains`（`questionText` / `analysis` / `wrongAnswerText` / `mistakeAnalysis` / `knowledgePoints`）（`error-items/list/route.ts:50-61`）。
- **无全文索引、无分词、无模糊匹配、无拼音搜索、无高亮。** 中文 `contains` 在 SQLite 下等价于全表 `LIKE '%x%'`。
- 标签联想是独立的一条：`GET /api/tags/suggestions?q=`（最多 30 条，`tags/suggestions/route.ts:108-110`）。

### 6.5 i18n

见 4.6。补充：**只有 zh/en**，`localStorage` 持久化，**无 URL 语言段、无 `Accept-Language` 协商**。

### 6.6 Admin —— 真实实现，且功能不小

- 独立页面 `/admin`（看板）+ `/admin/user/[id]`（单用户详情）（`src/app/admin/page.tsx:326`；`src/app/admin/user/[id]/page.tsx`）。
- 6 个 admin API（3.8 节）+ 前端 `UserManagement` 组件。
- 双重守卫：**中间件按 `token.role` 拦页面**（`middleware.ts:52-55`）+ **每个 API 用 `requireAdmin(session)`**（`src/lib/auth-utils.ts:7-12`）。
- 保护规则：不能禁用/删除自己（`admin/users/[id]/route.ts:27,69`）、不能动 `admin@localhost`（`:36,79`）。
- 高危能力：**系统工厂重置**（全库清空 + 删其他所有用户，`admin/system-reset/route.ts:39-73`）、**标签库破坏性重建**（`admin/migrate-tags/route.ts:74-113`）。
- `doc/PROJECT_OVERVIEW.md:56` 把 admin 描述为"管理员用户管理"，但实际还包括看板统计、标签迁移、系统重置——**文档低估了 admin 的权限面**。

### 6.7 GeoGebra —— 真实实现且是亮点

- 前端 CDN 动态加载 + 单例缓存（`geogebra-demo.tsx:19-39`）。
- 命令执行有**安全过滤**：16 个 API 方法白名单 + `evalCommand` 前的 `/[<>'"]/` 字符黑名单（`:55-65, 109-115`）。
- 有**重试修正闭环**：生成结果执行失败 → 把错误回传 AI → prompt 内 5 步修正规则（`prompts.ts:622-626`；`error-items/[id]/geogebra/route.ts:70-80` 接受 `previousErrors`）。
- 结果**持久化**到 `ErrorItem.geogebraCommands`（`error-items/[id]/geogebra/route.ts:84-89`）。
- 学科门禁（仅数学/物理）（`:44-57`）。
- 前端还支持手动 `onSaveCommands`（`geogebra-demo.tsx:16`；`error-items/[id]/page.tsx:138-142`）。
- ⚠️ 依赖 `www.geogebra.org` CDN —— **国内网络可达性 + 离线不可用**是产品级风险。

### 6.8 其他

- **PWA**：`src/app/manifest.ts`（20 行）；README 承诺"添加到主屏幕/全屏运行/启动画面适配"（`README.md:27-30`）。但我**未找到 service worker 或 `next-pwa` 配置**——因此"快速启动/离线"能力实际上只有 manifest 的 `display: standalone`，**不是真正的离线 PWA**（这一点 README 表述偏乐观）。
- **屏幕截图（getDisplayMedia）**：见 4.2.1，是真实现，但强依赖 HTTPS 与浏览器支持（Chrome/Edge，Safari 不支持 `getDisplayMedia` + `CaptureController`）。
- **Openclaw 集成**：一条完整的**机器对机器批量导入通道**（`openclaw/batch-upload/route.ts`），有独立认证模式、20 图/5MB 限制、`207 Multi-Status` 部分成功语义、以及 `scripts/test-openclaw-integration.js`（会起 mock 服务在 8080）+ `openclaw-integration.patch`。这是一个**外部 agent 生态的接入点**，README 完全没提。
- **日志系统**：自研 `src/lib/logger.ts`（243 行），开发环境彩色 pretty、生产 JSON，支持 `LOG_LEVEL` 与 `logger.box()` 打印完整 prompt。前端有一层 `src/lib/frontend-logger.ts`（111 行）会把前端日志 POST 回 `/api/logs/frontend`。`doc/LOGGING_GUIDE.md` 有专门文档。`instrumentation.ts` 只有 6 行。
- **代理支持**：`src/lib/global-proxy.ts` 同时配置 undici `ProxyAgent`（`setGlobalDispatcher`）和 `global-agent/bootstrap` 打补丁 http/https，支持 `http_proxy/https_proxy/all_proxy`（`:7-9`）。
- **运维脚本 20 个**（`scripts/`）：`reset-password.js`、`seed-admin.js`、5 个学科标签 seed（math/physics/chemistry/biology/english）、`rebuild-system-tags.ts`、`migrate-tags.ts`、`migrate-error-tags.ts`、`seed-additional-subjects.ts`、`test-ai-gemini.ts`、`test-ai-openai.ts`、`test-openclaw*.js`、3 个 `check-*.js`（api-models/db-data/db-users）、`check-network.js`、`test-grade-calc.ts`。
- **CI/CD**：`.github/workflows/` 有 `ci.yml`、`build-docker.yml`、`release.yml`。
- **测试覆盖**：`src/__tests__/` 下 13 个集成测试（admin-users/analytics/analyze/error-items/notebooks/practice/reanswer/register/settings/stats/tags/user）+ 24 个单元测试（含 ai 目录下 7 个：azure-provider/gemini-provider/gemini-retry/models-route/openai-provider/providers/schema），另有 `ai-prompts`、`mistake-status`、`print-preview`、`geogebra`、`grade-calculator`、`middleware`、`config`、`logger`、`docker/seed-admin` 等。E2E 3 个 spec：`admin-settings`、`auth-flow`、`upload-correction`。
- **`latex-test` 页面**：`src/app/latex-test/page.tsx`（68 行），用于验证 KaTeX 渲染。

---

## 7. "全部功能"移植评估

### 7.1 分类归档

#### 🟢 A 类：可直接移植（几乎零改造，逻辑是纯函数或纯 CRUD）

| 功能 | 位置 | 说明 |
|---|---|---|
| 年级计算（学段+入学年份 → 年级/学期） | `src/lib/grade-calculator.ts:1-64`；`src/lib/knowledge-tags.ts:14-53` | 纯函数，无依赖。⚠️ 注意两处实现**算法不一致**（`grade-calculator` 按 `currentMonth>=9` 加 1 且会给"已毕业/学前"，`knowledge-tags` 按 `currentMonth<9` 减 1 且越界返回 null），移植时需先统一 |
| 学科名推断 | `src/lib/knowledge-tags.ts:60-76` | 纯字符串映射 |
| 错因状态归一化 + 标签文案 | `src/lib/mistake-status.ts:1-36` | 纯函数 + 中英字典 |
| 知识点记忆曲线间隔表 | `src/lib/scheduler.ts:4-19` | 纯常量 + 纯函数（虽然目前是死代码，但可复用） |
| 分页常量 | `src/lib/constants/pagination.ts` | 18/1000/1/5/200 |
| 打印预览纯逻辑 | `src/lib/print-preview.ts:5-28` | 4 个纯函数 |
| Markdown/LaTeX 渲染 + 文本修整 | `src/components/markdown-renderer.tsx:16-33` | React 组件，逻辑可直接搬（依赖 react-markdown/remark/rehype 生态） |
| 标签树构建（邻接表→树） | `src/app/api/tags/route.ts:26-52` | 纯函数 |
| 章节后代标签 BFS | `src/app/api/error-items/list/route.ts:253-285` | 纯算法 |
| 年级筛选别名/学期连接符穷举 | `src/app/api/error-items/list/route.ts:173-250` | 纯查询构造，业务知识（初一=七年级等）值得保留 |
| Prompt 模板与变量替换 | `src/lib/ai/prompts.ts:115-266, 457-604` + `replaceVariables :271-275` | **模板文本本身可移植**（但需注意许可证！见 1.4） |
| Zod 响应 schema | `src/lib/ai/schema.ts:7-21` | 直接可用，还刚好满足你们"应用层白名单"的要求 |
| AI 错误码归一化 | `src/app/api/ai/test/route.ts:16-70`；`gemini-provider.ts:402-438` | 纯映射表 + 文案 |
| recharts 图表组件 | `wrong-answer-stats.tsx` / `practice-stats.tsx` | 只依赖 recharts + 数据形状 |
| 打印策略纯函数 | `src/lib/print-preview.ts` | — |
| 三次点击重置/批量删除的边界限制 | batch ≤100、import ≤50MB、openclaw ≤20 图/5MB | 数值决策可直接沿用 |

#### 🟡 B 类：需改造（结构对、但要适配你们的栈/基线）

| 功能 | 位置 | 需要的改造 |
|---|---|---|
| 全部 5 张表的 Prisma schema | `prisma/schema.prisma` | ① `provider` 改 `postgresql`；②**每表加 `family_id`**（新增维度，现只有 `userId`）；③ 全部软删除改 `deleted_at DateTime?` + 所有查询加 `deleted_at: null` + 改手写部分唯一索引（如 `UNIQUE(subject,name,user_id,parent_id) WHERE deleted_at IS NULL`，正好能修掉 SQLite NULL 不参与唯一约束的那个缺口）；④ `originalImageUrl` **必须改成对象存储 key + 单独表/仅列表接口不返回**；⑤ `ErrorItem` 补 `@@index`；⑥ `masteryLevel` 语义要定：是 0/1/2 三态还是 0/1（代码与 schema 不一致）；⑦ `paperLevel` 大小写统一；⑧ `PracticeRecord.subject` 应改 `subjectId` 外键，并补 `errorItemId` |
| 全部 40 个 API 的错误体 | `src/lib/api-errors.ts` | 从 `{message, code?, details?}` 改为你们的 `{error, reason, fields?}`。注意 `use-` 侧前端解析在 `src/app/page.tsx:209`（读 `error.data.message`）、`practice/page.tsx:75`、`correction-editor.tsx:132` 等多处，需同步 |
| 认证与授权 | `src/lib/auth.ts`、`middleware.ts` | 从 NextAuth v4 JWT + `next-auth.session-token` cookie 换成 NestJS 侧的方案；**并且必须补齐 7 个认证缺口**（3.11 节）：settings 零认证、tags/stats 跨租户、notes IDOR、practice/generate IDOR、logs 无认证、ai/models 无认证且 key 走 query、system-reset 全库删除 |
| 分页/筛选接口 | `error-items/list/route.ts` | 现在**排序固定 `createdAt desc`**、`pageSize` 上限 1000（会让前端一次拉全库）→ 需加排序参数、KeySet 分页、字段裁剪（尤其排除 base64 图片） |
| 去重/幂等 | `error-items/route.ts:70-102` | 从"2 秒时间窗 + 前 100 字符 startsWith"改为你们的手写部分唯一索引做幂等（真正的幂等键，比如 `(family_id, user_id, question_hash)`） |
| 标签双轨制 | `error-items/route.ts:173,176`；`list/route.ts:107-109`；`practice/generate/route.ts:32`；`tags/stats/route.ts:17-41` | 收敛到单一真相：删掉 `knowledgePoints` 旧字段，全部走 `KnowledgeTag` 关联表；按标签筛选改为 `tags.some` 而非 `contains` |
| 提示词自定义配置 | `src/lib/config.ts` | 从"读写 `config/app-config.json` 同步 fs"改为 DB 表或专用配置服务（现在同步 IO + 明文 key + 单进程假设，多实例部署会读到不同文件） |
| 统计接口性能 | `analytics/route.ts:58-84`；`stats/practice/route.ts:23-73` | N+1 循环 count → 单次 `groupBy`/原始 SQL 按日聚合 |
| 导入事务 | `import/route.ts:147-344` | 60s 事务在 PostgreSQL 下要注意锁与超时；`practiceRecords` 无去重需要补幂等 |
| 标签 seed 数据 | `src/lib/tag-data/*.ts` + `admin/migrate-tags/route.ts` | math（4 层，185 节）最完整；physics(51 数组)/english(52)/biology(46)/chemistry(32) 有数据；**chinese/history/geography/politics 是空壳**（`chinese.ts:12-21` 所有年级都是 `[]`）。需补齐或改用你们的课标数据 |
| 3 层 vs 4 层标签树 | `admin/migrate-tags/route.ts:233-334` | math 有"节"层，其他学科没有 → 统一层级模型或显式支持可变深度 |
| i18n | `src/contexts/LanguageContext.tsx` + `translations.ts` | 从 Context+localStorage 改为你们 Web 栈的 i18n 方案（TanStack Query 生态）；**并且要抽出服务端文案**（AI prompt 语言、年级字符串格式、错误码文案都受语言影响） |
| 前端框架迁移 | 全部 `src/app/**/page.tsx` + `src/components/**` | Next.js App Router → React 19 + Vite 的纯 SPA + TanStack Query 客户端。`"use client"` 全部可去；`useSearchParams`/`useRouter` 换 react-router；数据获取从手写 `apiClient` 换 TanStack Query（现在 `ErrorList` 的筛选/分页是靠 `useEffect` + `prevFiltersRef` 手动 diff，`error-list.tsx:171-196`，用 TanStack Query 的 queryKey 会天然解决） |
| 管理员能力边界 | `admin/system-reset/route.ts:39-73`、`admin/migrate-tags/route.ts:74-113` | 全库 `deleteMany({})` 必须改成带 `family_id`/`user_id` 范围；破坏性重建要有审计日志与回滚 |
| `ErrorItem.ocrText` / `source` / `errorType` | 只在 Openclaw 通路写入 | 要么在主流程 UI 里补齐这三个字段的录入/展示，要么从模型里删掉 |
| 屏幕截图功能 | `upload-zone.tsx:67-179` | 依赖 `getDisplayMedia` + `CaptureController`（Chromium 系专属）+ HTTPS。若你们的 Web 要支持 Safari/Firefox 需降级或砍掉 |
| 图片裁剪 | `image-cropper.tsx` | `react-image-crop` 在 Vite 下可用，但**必须改用你们的设计系统组件**，且裁剪逻辑必须补 `image-utils` 的压缩/降采样（现在裁剪输出原分辨率 JPEG，见图 4.2.2 → 4.2.3 的断层） |

#### 🔵 C 类：依赖外部服务

| 功能 | 外部依赖 | 依据 |
|---|---|---|
| 识题 / 解析 / 相似题 / 重新解题 | **LLM API**：Gemini（`@google/genai`）或 OpenAI 兼容端点或 Azure OpenAI。**必须配置有效 API Key，否则所有录题功能不可用** | `src/lib/ai/index.ts:13-29`；`gemini-provider.ts:26-28`（无 key 直接抛 `AI_AUTH_ERROR`） |
| AI 连接测试 | 同上，且**真实消耗 token**（会发图 + 生成题） | `ai/test/route.ts:128,137,154,183,195,213` |
| 模型列表 | 上游 `GET {baseUrl}/models` 或 Gemini 的 `/v1beta/models?key=` | `ai/models/route.ts:19,44` |
| **GeoGebra 交互演示** | **`https://www.geogebra.org/apps/deployggb.js`**（运行时 CDN 加载） | `geogebra-demo.tsx:29` |
| Openclaw 批量导入 | 外部 agent 服务 `POST {OPENCLAW_API_URL}/api/recognize`（默认 `http://localhost:8080`） | `openclaw/batch-upload/route.ts:56,63` |
| 出网代理 | 若部署在内网需 `HTTP_PROXY/HTTPS_PROXY` | `global-proxy.ts:7-9` |
| 邮件/短信/OAuth/对象存储 | **无** —— 项目不使用任何对象存储、不发邮件、无第三方登录 | 全仓库无线程/邮件/OSS SDK 依赖（`package.json:18-57` 可完整核对） |

#### 🔴 D 类：与本项目硬基线直接冲突（必须重写而非改造）

| 冲突点 | 本项目实现 | 你们的基线 | 冲突程度 |
|---|---|---|---|
| 多租户维度 | 只有 `userId`（+ `KnowledgeTag.userId?`），无租户/家庭概念 | 每表 `family_id` | **结构性**：所有查询、所有唯一约束、所有索引都要重写；AI prompt 的标签预取（按 `isSystem/userId` 过滤，`tag-service.ts:118-131`）也要改成按 `family_id` |
| 软删除 | **零软删除**，9 处物理 `delete`/`deleteMany` | `deleted_at` | **行为性**：删除语义、列表过滤、唯一约束（软删后能否重建同名）、`_count` 统计口径全都要改；`error-items/clear`、`batch-delete`、`system-reset`、`admin/users DELETE` 全部要重写 |
| 枚举策略 | 部分用了 `z.enum`（好），但 `role`/`paperLevel`/`educationStage`/`PracticeRecord.difficulty|subject` 全是裸 String，**无 DB 约束、无应用层统一白名单** | VARCHAR + 应用层白名单 | **中**：需要为每个枚举补一个集中的白名单常量 + zod/class-validator |
| 幂等 | 无唯一索引级幂等；靠 2 秒时间窗 + 前 100 字符前缀比对（`error-items/route.ts:70-102`），**并发下不可靠**（两个请求可同时通过 `findFirst` 再同时 `create`） | 手写部分唯一索引 | **中高**：要设计幂等键（题目内容 hash？cliente 生成的 request id？）并建部分唯一索引，前端也要配合传键 |
| 错误体 | `{message, code?, details?}` | `{error, reason, fields?}` | **低但全面**：40 个 route + 前端 6+ 处解析点 |
| 数据库 | **SQLite**（含 `prisma/dev.db` 提交进仓库、无连接池、无并发写） | PostgreSQL 16 | **中**：`contains` 语义（SQLite `LIKE` 默认对 ASCII 大小写不敏感、PostgreSQL `LIKE` 敏感）、`groupBy(by:['createdAt'])`（`admin/dashboard/route.ts:75-85`）、`NULL` 唯一约束行为都不同 |
| ORM | Prisma 5.22 客户端 + `PrismaAdapter`（`auth.ts:11`） | Prisma 5 | **低**：版本兼容 |
| 认证框架 | NextAuth v4，与 Next.js 深度耦合（`getServerSession(authOptions)` 出现在 30+ 处） | NestJS 10 自己的守卫 | **中**：每个 route 的 `getServerSession` + `prisma.user.findUnique({where:{email: session.user.email}})` 模式（出现 30+ 次）要统一换成 NestJS Guard + `@CurrentUser()` |

### 7.2 关键阻碍（明确列出）

#### 阻碍 1：许可证（**最高优先级，阻塞一切**）
无 LICENSE 文件、`package.json` 无 license 字段、非 git 仓库，仅 `README.md:240` 一句 "MIT License"。**在拿到作者明确授权前，任何代码/提示词/schema 的复制都缺少法律依据。** 提示词模板这类"表达性内容"受著作权保护尤为明确。→ **行动项：先联系 `wttwins` 获取授权或书面许可，再决定是"参考重写"还是"直接搬"。**

#### 阻碍 2：AI 外部依赖 —— 需要一个 provider 抽象层 + 密钥管理
- 必须对接至少一个 LLM provider，且**识题必须支持视觉（多模态）**。项目自己的测试证明这是硬要求：`ai/test/route.ts:174` 定义了 `VISION_NOT_SUPPORTED` 这个状态，说明存在不支持视觉的模型。
- 4 个 AI 功能都**同步阻塞**，最长超时 180s（`config.ts:120`）。NestJS 侧若同步等待，会长时间占用连接/worker。→ 建议改为**任务队列 + `aiStatus` 字段 + 轮询/SSE**，但这**意味着 schema 要新增 AI 状态字段**（本项目完全没有，见 2.7），且前端 UX 要重做。
- 密钥现状：明文存 `config/app-config.json`（单机文件），**且 `GET /api/settings` 零认证就会吐出来**（`settings/route.ts:11-15`）。→ 移植时必须改为密钥管理服务/加密存储 + 严格鉴权。这是一个**必须重做**的面。
- 提示词依赖**标签库预取**（按学科 + 年级累进去 DB 查叶子标签，`tag-service.ts:23-111`），且 `getMathTagsFromDB` 里 `gradeToSemesterMap` 硬编码了 `'七年级上'`~`'高三下'` 这些**具体标签名**。→ 若你们的标签命名不同，这段直接失效（不报错，只是静默返回空数组，AI 退化为自由打标）。**移植时这是个隐性坑。**

#### 阻碍 3：图片存储方式 —— 必须彻底重做，不是"改造"
- 现状：base64 data URL **直存 `ErrorItem.originalImageUrl` 单列**，并且**列表接口会整行返回**（`error-items/list/route.ts:147-156` 无 `select` 裁剪）。
- 三连锁后果：① 数据库体积膨胀；② HTTP 响应体膨胀（列表页一次可能几十 MB）；③ PostgreSQL 下 TOAST 与索引性能恶化。
- 前端管线也**没有任何服务端上传**概念：全程 JSON 内嵌 base64（`page.tsx:139-143, 266-269`）。
- → **必须**引入对象存储（S3/OSS/MinIO 或你们的自研）+ 预签名上传或 multipart + 缩略图派生 + `ErrorItem.image_key` 字段。同时前端 `processImageFile` 要改成"上传得 key"而不是"得 base64"。
- 顺带的：**压缩参数也需要重新定**（1MB / 1920px / q=0.8 / 仅限制宽不限制高，`image-utils.ts:9-13,33-36`）——对于题目截图足够，但对超长图（试卷整页）不合适。

#### 阻碍 4：浏览器端能力依赖（canvas 系）
| 能力 | 依赖 | 位置 | 风险 |
|---|---|---|---|
| **图片裁剪** | `<canvas>` + `canvas.toBlob` + `drawImage` | `image-cropper.tsx:66-97` | 无法在服务端做。必须保留客户端裁剪，或在服务端引入 `sharp`（`package.json:92` 的 `allowScripts` 里出现了 `sharp@0.34.5`，但**生产依赖中未见 sharp**，说明只是传递依赖）。→ 若你们允许服务端裁剪，可考虑把裁剪移到 NestJS + sharp，前端只上传原图 |
| **图片压缩** | `<canvas>.toDataURL('image/jpeg', q)` | `image-utils.ts:21,46,54` | 同上，纯客户端。**不能**在 Node 里用 `toDataURL` |
| **屏幕截图** | `navigator.mediaDevices.getDisplayMedia` + `CaptureController.setFocusBehavior` | `upload-zone.tsx:60-179` | **Chromium-only + 必须 HTTPS 安全上下文**（README 专门写了 `doc/HTTPS_SETUP.md`）。Safari/Firefox 不可用。若目标是移动端/跨浏览器，建议直接砍掉 |
| **GeoGebra 执行** | 浏览器全局 `window.GGBApplet` + CDN 脚本 | `geogebra-demo.tsx:21-39, 156,191` | 必须在浏览器跑，且**运行时依赖 `geogebra.org`**。若需离线/内网，必须自托管 `deployggb.js` + codebase |
| **打印/PDF** | `window.print()` + CSS `print:` | `print-preview/page.tsx:49-51` | 客户端打印。若要服务端生成 PDF，需重做（项目**没有**服务端 PDF 方案） |
| **图片 Viewer** | 纯 DOM + 全屏遮罩 | `error-items/[id]/page.tsx:587-613` | 无风险，可移植 |

#### 阻碍 5：NextAuth 与 Next.js 的深度耦合
`getServerSession(authOptions)` 在 30+ 个 route 中重复出现，且每个 route 都要自己做一次 `prisma.user.findUnique({where:{email: session.user.email}})`（如 `error-items/route.ts:57`、`[id]/route.ts:23`、`mastery/route.ts:20`、`notebooks/route.ts:20`…）。这是 Next.js 特有的写法。→ NestJS 应改为一个全局 `AuthGuard` + `@CurrentUser()` 装饰器 + 一次 `family_id`/`userId` 解析，把这个模式从 30+ 处收敛到 1 处。

#### 阻碍 6：`middleware.ts` 明确排除了 API 路由
`middleware.ts:71` 的 matcher 是 `"/((?!api|_next/static|_next/image|favicon.ico).*)"` —— **所有 `/api/*` 不经过中间件**。这正是 3.11 节那 7 个认证缺口的根因。→ 移植时如果照搬"路由自行校验"的模式，会继承同样的漏洞面。**建议在 NestJS 用全局 Guard 默认拒绝，显式 `@Public()` 才放行**（白名单而非黑名单）。

#### 阻碍 7：`doc/PROJECT_OVERVIEW.md:248-256` 自陈的已知技术债（可直接引用为改造清单）
> - [ ] `config.ts` 使用同步 `fs.readFileSync/writeFileSync`，可能阻塞事件循环
> - [ ] 自定义 Logger 无缓冲/轮转，生产环境大规模日志有性能风险
> - [ ] `app-config.json` 明文存储 API Key
> - [ ] 首页 `page.tsx` (~422行) 逻辑较重，可拆分
> - [ ] API 路由间错误处理模式不统一
> - [ ] AI 每次分析注入全量标签列表，token 消耗较大
> - [ ] 前端日志粒度过细，生产环境可降级

（注：该文档说 `page.tsx` ~422 行，实际 619 行，文档已过期；文档头写 version 1.5.5，实际 package.json 是 1.9.1 —— **文档与代码不同步**，不能作为唯一依据。）

---

## 8. 功能条目总表

| 功能名 | 类别 | 关键文件 | 移植难度 | 移植阻碍 |
|---|---|---|---|---|
| 注册（邮箱+密码+学段+入学年份） | 数据/UI | `src/app/api/register/route.ts:16`；`src/app/register/page.tsx:44` | 低 | zod→class-validator；错误体；注册开关（`config.allowRegistration`）要换存储；catch 吞异常返回 500 的问题要修 |
| 登录 / 登出 / 会话 | 其它 | `src/lib/auth.ts:10`；`src/app/api/auth/[...nextauth]/route.ts:6` | 中 | NextAuth v4 与 Next 深度耦合，30+ 处 `getServerSession` 要换成 NestJS Guard；JWT 里塞了 `id`/`role`（`auth.ts:104-105`）；cookie 名硬编码 |
| admin/user 双层守卫 | 其它 | `src/middleware.ts:52`；`src/lib/auth-utils.ts:7` | 低 | 逻辑简单，但要改成全局 Guard + 白名单 |
| 用户资料读写（含密码改） | 数据 | `src/app/api/user/route.ts:20,52` | 低 | zod；邮箱正则 `/^[^\s@]+@[^\s@]+$/`；bcrypt cost 10 |
| 管理员：用户列表/禁用/删除/详情 | 其它 | `src/app/api/admin/users/route.ts:11`；`admin/users/[id]/route.ts:11,56`；`admin/users/[id]/detail/route.ts:11` | 低 | 自保护规则（不能禁自己/不能动超管）要保留；删除必须改软删 |
| 管理员：全局看板统计 | 统计 | `src/app/api/admin/dashboard/route.ts:11`；`src/app/admin/page.tsx:336` | 中 | `groupBy(by:['createdAt'])` 需改 PG 按日聚合；`family_id` 口径 |
| 管理员：系统工厂重置 | 其它 | `src/app/api/admin/system-reset/route.ts:11` | 中高 | **全库 `deleteMany({})` + 删其他所有用户**（`:41-71`）；必须按 `family_id`/`user_id` 限定 + 审计 + 改软删 |
| 管理员：标签库破坏性重建 | 数据 | `src/app/api/admin/migrate-tags/route.ts:29` | 中高 | 三步事务（备份→删系统标签→重建→复原关联，120s 超时）；math 4 层 / 其他 3 层；chinese/history/geography/politics 是空数组 |
| AI 配置（provider/key/model/baseUrl） | AI | `src/lib/config.ts:90-204`；`src/app/api/settings/route.ts:11,17` | 中 | **`config/app-config.json` 同步 fs 单机文件 + 明文 key + GET 零认证** → 必须换 DB/密钥服务 + 鉴权 |
| AI 多实例管理（OpenAI，上限 10） | AI | `src/lib/config.ts:203`；`src/components/settings-dialog.tsx:515-570` | 中 | 实例数组要落 DB 表；active 切换的并发一致性 |
| AI 连接测试（文本+视觉双能力） | AI | `src/app/api/ai/test/route.ts:94` | 中 | **真实消耗 token**；内嵌 1.7KB 测试图（`:12`）；9 个错误码映射（`:16-70`）需要前端字典配合 |
| AI 模型列表拉取 | AI | `src/app/api/ai/models/route.ts:68`；`src/components/ui/model-selector.tsx:27` | 低 | 无认证且 key 走 query string（会进日志）→ 必须改为 POST + body 或服务端保存的密钥 |
| **AI 识题（图片→题干/答案/解析/知识点/错因）** | **AI** | `src/app/api/analyze/route.ts:13`；`src/lib/ai/gemini-provider.ts:161`；`openai-provider.ts`；`azure-provider.ts` | **高** | ①必须视觉模型+API Key；②180s 同步阻塞 → 建议改队列+`aiStatus`（schema 无此字段）；③prompt 依赖标签库预取，标签命名需对齐；④9 个 XML 标签的解析靠字符串截取，非结构化输出，需保留或改 JSON mode；⑤**必须重做图片存储**（base64 直传直存） |
| **AI 相似题/练习生成** | **AI** | `src/app/api/practice/generate/route.ts:11`；`src/lib/ai/prompts.ts:215-266,421-451` | **高** | ①知识点来源是**废弃的 `knowledgePoints` JSON**（`route.ts:32`）；②**IDOR：不校验 owner**（`:21-28`）；③4 档难度指令；④12 种变式技法需完整保留 |
| **AI 重新解题（含图片错因重判）** | **AI** | `src/app/api/reanswer/route.ts:10`；`src/lib/ai/prompts.ts:457-506`；`src/lib/reanswer-request.ts:9` | **高** | 同识题的外部依赖；图片 mimeType 硬编码 `image/jpeg`（`gemini-provider.ts:314`）；prompt 中 3 处"不要猜测"的语义约束要保留 |
| **AI 生成 GeoGebra 命令** | **AI/其它** | `src/app/api/geogebra-analyze/route.ts:15`；`src/app/api/error-items/[id]/geogebra/route.ts:11`；`src/lib/ai/prompts.ts:512-604` | **高** | ①唯一用 JSON 输出的 prompt，要保留三层解析容错（代码块剥离→首尾大括号→JSON.parse）；②19 个命令白名单 + 9 条语法自检规则是 prompt 的核心价值；③学科门禁（仅数学/物理）；④**重试反馈闭环**（`previousErrors`）要保留 |
| **GeoGebra 交互渲染** | 其它 | `src/components/geogebra-demo.tsx:21-323` | **高** | **运行时 CDN 依赖 `geogebra.org`**；`window.GGBApplet` 全局；`innerHTML` 注入规避 React（React 19 + Vite 下需重新验证）；命令黑名单 `/[<>'"]/` 是安全边界不能丢；**离线/内网需自托管 codebase** |
| 错题创建（含 2s 去重） | 数据 | `src/app/api/error-items/route.ts:14` | 中 | 去重逻辑并发不安全 → 改手写部分唯一索引做真幂等；`family_id`；软删除；标签"先查后建"有竞态 |
| 错题详情读取 | 数据 | `src/app/api/error-items/[id]/route.ts:13` | 低 | owner 校验已有（`:47`），但 `userId` → `family_id` 要重写 |
| 错题更新（11 个可选字段 + 标签重连） | 数据 | `src/app/api/error-items/[id]/route.ts:58` | 中 | `tags: {set:[], connect:[...]}`（`:170-173`）要改为事务内安全重连；同步写旧 `knowledgePoints` 字段（`:176`）应删除 |
| 掌握标记 | 复习 | `src/app/api/error-items/[id]/mastery/route.ts:10`；`src/app/error-items/[id]/page.tsx:144` | 低 | UI 只有 0/1 两态，schema 注释有 0/1/2 → 语义需先定 |
| 笔记编辑 | 数据 | `src/app/api/error-items/[id]/notes/route.ts:10` | 低 | ⚠️ **先补 owner 校验（IDOR）** |
| 单题删除 | 数据 | `src/app/api/error-items/[id]/delete/route.ts:10` | 低 | 改软删除 |
| 批量删除（≤100） | 数据 | `src/app/api/error-items/batch-delete/route.ts:15` | 低 | 改软删除；保留"越权 id 进 failed 不报错"的宽容语义 |
| 清空我的全部错题 | 数据 | `src/app/api/error-items/clear/route.ts:10` | 低 | 改软删除 |
| 错题本 CRUD（含自动建默认本） | 数据 | `src/app/api/notebooks/route.ts:14,87`；`notebooks/[id]/route.ts:14,63,126` | 中 | **GET 有副作用（自动创建两个本）**——REST 语义问题，NestJS 下建议移到注册流程；删除前置校验（有错题则拒）；`Subject` 命名 vs "notebook" 概念要理清 |
| 错题列表分页 + 8 维筛选 | 数据 | `src/app/api/error-items/list/route.ts:12` | 中高 | 默认 18/页、上限 1000；**排序固定 createdAt desc**；标签筛选用 `contains` 子串（会误伤）；gradeSemester 别名穷举很脆；**未裁剪 base64 图片字段** |
| 年级/章节/知识点三级联动筛选 | UI | `src/components/knowledge-filter.tsx:58` | 中 | 两张硬编码映射表（`:35-56`）；依赖 `/api/tags?subject=` 的树结构；`calculateCurrentGrade` 与 `grade-calculator.ts` 算法不一致 |
| 标签树查询（树/扁平两模式） | 数据 | `src/app/api/tags/route.ts:60` | 低 | 邻接表构建纯函数可搬；`family_id` 过滤 |
| 自定义标签创建/删除 | 数据 | `src/app/api/tags/route.ts:133,186` | 低 | 只能删自己的；`@@unique` 里 NULL 不生效的缺口要在 PG 用部分唯一索引修掉 |
| 标签联想建议（≤30 条） | 数据 | `src/app/api/tags/suggestions/route.ts:19`；`src/components/tag-input.tsx:48` | 低 | 未登录可用（退化为仅系统标签）；上溯根节点判 `stage` 的逻辑要保留 |
| 标签使用频率统计 | 统计 | `src/app/api/tags/stats/route.ts:14` | 低 | ⚠️ **零认证 + 跨用户全库统计** → 必须加 `family_id`/`user_id` |
| 标签管理页（树浏览+新建+删除） | UI | `src/app/tags/page.tsx:41` | 中 | 3 个 API 组合；`SubjectKey` 硬编码 9 学科 |
| 上传（dropzone + 屏幕截图） | UI | `src/components/upload-zone.tsx:26` | 中 | **屏幕截图 = Chromium + HTTPS 专属**（`getDisplayMedia` + `CaptureController`），Safari/Firefox 不可用；dropzone 无大小上限、仅 JPEG/PNG、单文件 |
| 图片裁剪（自由比例） | UI | `src/components/image-cropper.tsx:38` | 中 | **纯客户端 canvas**（`toBlob`）；输出原分辨率 JPEG、未指定 quality；与压缩管线之间有断层 |
| 图片压缩（1MB/1920px/q0.8 递减） | UI | `src/lib/image-utils.ts:9-100` | 中 | **纯客户端 canvas `toDataURL`**；**只限宽不限高**；返回 base64 而非上传 key |
| 文本录入（AI 解题模式） | AI/UI | `src/components/text-input-zone.tsx:17`；`src/app/page.tsx:296` | 中 | 依赖 reanswer 端点；`subject` 硬编码"数学"（`page.tsx:333`）；Ctrl+Enter |
| 文本录入（直接录入，不过 AI） | UI | `src/components/direct-text-editor.tsx:35` | 低 | 10 个字段表单，纯 CRUD |
| AI 结果确认/纠错编辑器 | UI | `src/components/correction-editor.tsx:49` | 中 | 左编辑右预览 4 张卡；内嵌 reanswer + geogebra 两个 AI 调用（双 AI 依赖）；标签/年级自动预填 |
| 错题详情页（分段 inline 编辑 + 图片 viewer） | UI | `src/app/error-items/[id]/page.tsx:53` | 中 | 同类组件在 `notebooks/[id]/add` 也出现（`add/page.tsx` 379 行）；浮动题目卡滚动监听；6 个独立编辑态 |
| Markdown + LaTeX 渲染 | UI | `src/components/markdown-renderer.tsx:13` | 低 | 纯依赖生态；但 `:16-33` 的 7 条文本修整规则是踩坑经验，务必带走 |
| 练习（生成→作答→客户端判分→记录） | AI/复习 | `src/app/practice/page.tsx:20`；`src/app/api/practice/record/route.ts:10` | 中高 | ①**判分是客户端字符串比较**（`practice/page.tsx:100-117`，3 条规则），不可靠且易绕过；②`PracticeRecord.subject` 存显示名非外键；③不记录 `errorItemId` → 无按题练习历史；④**practice/generate 有 IDOR** |
| 练习统计（学科饼图 + 月度堆叠难度柱 + 3 卡） | 统计 | `src/app/api/stats/practice/route.ts:11`；`src/components/practice-stats.tsx:51` | 中 | recharts 在 React 19 + Vite 下可复用；服务端 N+1 需优化 |
| 错题统计（掌握率 + 学科饼图 + 7 天柱） | 统计 | `src/app/api/analytics/route.ts:11`；`src/components/wrong-answer-stats.tsx:14` | 中 | 近 7 天是循环 7 次 count（N+1）；`masteryRate` 返回 string（`:36`）类型不严谨 |
| 练习历史清空 | 统计 | `src/app/api/stats/practice/clear/route.ts:10` | 低 | 改软删或真删（业务决策） |
| 导出打印预览（勾选+图片缩放+4 个开关） | UI | `src/app/print-preview/page.tsx:19`；`src/lib/print-preview.ts:1` | 中 | `window.print()` + `print:` CSS；若需服务端 PDF 则重做；`pageSize=200` 硬上限（超出会静默丢题） |
| JSON 全量导出 | 数据 | `src/app/api/export/route.ts:10` | 低 | 已是结构化 JSON；加 `family_id` 范围；`all=true` 仅 admin |
| JSON 全量导入（事务+映射+去重） | 数据 | `src/app/api/import/route.ts:96` | 中 | 50MB 上限；60s 事务；subjects/tags/errorItems/reviewSchedules 四类去重；practiceRecords **无去重** |
| 间隔复习 / 待复习队列 | 复习 | `src/lib/scheduler.ts:1-19`（**死代码**）；`prisma/schema.prisma:119-129`（**空壳表**） | **高（等于从零做）** | **算法函数无任何调用点；`ReviewSchedule` 只在导入导出出现**；无 UI、无 API、无提醒、无 `aiStatus` 类似的复习状态；需自行设计调度触发（定时任务？）、到期查询、复习完成记录、以及"掌握度自动升级"规则 |
| 掌握度可视化 | 统计/复习 | `admin/dashboard/route.ts:109-113`；`admin/users/[id]/detail/route.ts:83-87` | 低 | 只统计 0/1/2 三个桶；用户侧没有掌握度图表（只有 admin 有） |
| 屏幕截图录入 | UI | `src/components/upload-zone.tsx:67` | 中高 | **Chromium-only + HTTPS 强制**；`CaptureController` 非标准；截图后走同一裁剪/压缩管线（PNG 1.0 质量 → 再压 JPEG） |
| 深色模式 / 主题 | UI | `src/app/globals.css`；`components.json` | 低 | Tailwind v4 + shadcn 变量；`layout.tsx` 未读，主题切换机制**未能确认** |
| i18n（zh/en） | 其它 | `src/contexts/LanguageContext.tsx:14`；`src/lib/translations.ts:1-3` | 中 | 只有两语言；Context+localStorage 无 URL 段；**服务端文案（prompt 语言、年级字符串格式、错误码）也受语言影响**，需要设计语言在请求中如何传递 |
| PWA（添加到主屏幕） | 其它 | `src/app/manifest.ts:3` | 低 | 只有 manifest，**未找到 service worker** → 实际无离线能力；README 表述偏乐观 |
| 广播通知 | UI | `src/components/broadcast-notification.tsx:15` | 低 | **两条公告硬编码在前端**（`:52-79`），无后端；未读态刷新即复位 |
| 前端日志回传 | 其它 | `src/lib/frontend-logger.ts`；`src/app/api/logs/frontend/route.ts:28` | 低 | 无认证端点；`doc/LOGGING_GUIDE.md` 有规范 |
| 服务端结构化日志 | 其它 | `src/lib/logger.ts`（243 行） | 中 | 自研替代 pino；`logger.box()` 会打印完整 prompt（生产有泄露风险，但也解释了默认 `LOG_LEVEL=debug` 的原因） |
| 代理支持 | 其它 | `src/lib/global-proxy.ts:6` | 低 | undici `ProxyAgent` + `global-agent` 双套；NestJS 下只需 undici 那一套 |
| Openclaw 机器对机器批量导入 | 其它/AI | `src/app/api/openclaw/batch-upload/route.ts:195` | 中高 | 独立认证（apikey/credentials 双模式）；**依赖外部 `OPENCLAW_API_URL` 服务**（默认 `localhost:8080`）；20 图/5MB/jpg-png 限制；207 Multi-Status 语义；`subjectId` 由请求方传 |
| 版本显示 / About 页 | 其它 | `src/app/api/version/route.ts:5`；`settings-dialog.tsx:1500-1536` | 低 | 读 package.json；含 GitHub/Release/Feedback 外链 |
| 单元/集成/E2E 测试 | 其它 | `src/__tests__/**`（37 文件）；`e2e/**`（3 spec） | 中 | vitest 用例大量 mock Prisma，可作行为规格参考；Playwright spec 可直接作为验收用例 |
| Docker 部署 | 其它 | `Dockerfile:1-96`；`docker-compose.yml`；`docker-compose.https.yml`；`https-server.js`；`docker-entrypoint.sh` | 中 | 构建期就跑 `prisma migrate deploy` + seed + `rebuild-system-tags`（`:30-33`）——**构建产物里带数据库**，移植到 PG 要重构；`node:22-alpine` + standalone |
| 数据库迁移历史 | 数据 | `prisma/migrations/`（10 个） | 中 | init×3 + education_info + admin_role + cascade_delete + knowledge_tag + fix_tag_constraints + mistake_analysis_fields + geogebra_commands；**SQLite 语法**，迁 PG 需重写 |

---

## 9. 未能确认的事项（如实列出）

1. **深色模式/主题切换机制**：`src/app/globals.css` 与 `components.json` 未逐行读取，`layout.tsx`（53 行）未读取 → 主题切换的实现方式**未能确认**。
2. **`src/lib/logger.ts`（243 行）与 `src/lib/frontend-logger.ts`（111 行）的完整实现**：仅从 `doc/LOGGING_GUIDE.md` 的存在与 `LOG_LEVEL` 配置推断其能力（pretty/JSON 双模式、`logger.box()`），**未逐行核对**。
3. **`src/app/api/error-items/[id]/detail` 等不存在**；但我**未逐一打开全部 40 个 route 的每一行**——`admin/dashboard`、`import`、`openclaw`、`migrate-tags`、`ai/test`、`error-items/*`、`tags/*`、`analytics`、`stats/*`、`export`、`settings`、`user`、`register`、`version`、`logs`、`notebooks*`、`analyze`、`reanswer`、`geogebra-analyze`、`practice/*`、`auth`、`admin/*` 均已完整读取；**未完整读取的只有**：无（40 个 route 中已覆盖全部）。
4. **`src/app/notebooks/[id]/add/page.tsx`（379 行）与 `src/app/admin/user/[id]/page.tsx`（250 行）**：仅读取行数、未逐行读取内容 → 其与 `src/app/page.tsx` / `src/app/admin/page.tsx` 的具体差异**未能确认**（推断为同一流程的复用变体）。
5. **`src/lib/tag-data/*.ts` 的标签总数**：只统计了 `tags: [` 出现次数与 `section:` 出现次数（math 185 节 / 184 个标签数组），**未展开统计叶子标签的精确总数量**。
6. **`openclaw-integration.patch`、`https-server.js`、`export-tag-trees.ts`、`docker-compose.https.yml`、`.github/workflows/*.yml`** 的文件内容**未读取**，只确认存在及（对 Dockerfile）构建流程。
7. **`react-easy-crop` 与 `jsonrepair` 是否为死依赖**：已确认 `src/` 内无引用（`jsonrepair` 仅出现在单测 mock 中），但**未检查 `scripts/` 与 `e2e/` 目录**是否引用。
8. **`prisma/dev.db` 的实际内容**：文件存在（随仓库提交），但**未查询其数据**（只读任务，且无 sqlite3 CLI 保证）。因此"seed 后系统标签表实际有多少行"**未能确认**。
9. **`package.json` 的 `allowScripts` 中出现 `sharp@0.34.5`**，但 `dependencies` 中无 sharp → 推断为传递依赖，**未验证其来源**。
10. **许可证的完整法律状态**：已确认无 LICENSE 文件、无 package.json license 字段、非 git 仓库、README 仅一行 "MIT License"。**但无法确认 GitHub 上游仓库（`github.com/wttwins/wrong-notebook`）是否有 LICENSE**（本任务限定为本地只读盘点，未做网络请求）。
11. **`GET /api/admin/users` 等端点的分页**：确认**没有分页**（`:19-37` 直接 `findMany` 全量），但如果用户量很大时行为**未实测**。
12. **`ReviewSchedule` 是否曾通过已删除的代码路径被写入**：通过 `prisma/dev.db` 无法确认（见第 8 点），但从当前源码可确认**无任何活跃写入路径**。

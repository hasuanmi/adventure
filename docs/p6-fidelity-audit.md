# P6 错题本 · 移植忠实度审计（自证）

> 生成方式：**机械比对**，不是主观声明。
> 脚本：`visualasset/_fidelity_diff.py`（解析上游 `prisma/schema.prisma` 与本项目 schema 的字段名逐一对齐）
> 上游：`C:\Users\48489\Desktop\huahuastudy\research\_artifacts\ref_repos\wrong-notebook\wrong-notebook-main`（v1.9.1）
> 盘点报告：`docs/wrong-notebook-feature-inventory.md`

---

## 1. 模型字段机械比对（上游 5 个业务模型）

| 上游模型 | 本项目模型 | 上游字段数 | 我们字段数 | **内容字段是否一一保留** |
|---|---|---|---|---|
| `ErrorItem` | `WrongQuestion` | 25 | 26 | ✅ **全部内容字段同名保留**，仅 6 处按硬基线改名（见下） |
| `KnowledgeTag` | `KnowledgeTag` | 14 | 15 | ✅ 仅 `userId`→`childId` + `familyId` |
| `ReviewSchedule` | `WrongQuestionReview` | 7 | 8 | ✅ `scheduledFor`/`completedAt`/`isCorrect` 原样 |
| `PracticeRecord` | `PracticeRecord` | 7 | 8 | ✅ `subject`/`difficulty`/`isCorrect` 原样 |
| `Subject` | —（未采用） | 7 | 0 | ⛔ 用**固定学科枚举**替代（已登记为未采用项） |

### 1.1 `ErrorItem → WrongQuestion` 的 6 处改名（逐条给理由）

| 上游字段 | 本项目 | 理由（均为已登记的硬基线，非临时发挥） |
|---|---|---|
| `userId` / `user` | `childId` / `child` | 每表带 `family_id`/`child_id`（硬基线；上游无租户概念） |
| `subjectId`（FK → 自由 `Subject` 表） | `subject`（VARCHAR 固定枚举） | 固定学科枚举决策（`opensource-mapping.md` 已登记未采用自由科目） |
| `originalImageUrl`（**base64 data URL**） | `originalImageKey` | 硬基线禁止 base64 入 DB；上传接口随 P6-2 |
| `knowledgePoints`（上游自标 `[DEPRECATED]`） | **不移植** | 单一来源 = M2M `tags`；上游双轨导致"相似题读空知识点"（盘点 §AI 已记录） |
| `reviewSchedules`（关系名） | `reviews` | 仅关系字段名 |
| — | `familyId` / `createdBy` / `deletedAt` | 硬基线（租户 / 代录人 / 软删除） |

**其余 19 个内容字段逐一同名保留**：`id, subject, ocrText, questionText, answerText, analysis, wrongAnswerText, mistakeAnalysis, mistakeStatus, geogebraCommands, source, errorType, userNotes, masteryLevel, gradeSemester, paperLevel, tags, createdAt, updatedAt`。

### 1.2 额外修掉的两个上游缺陷（不改功能，只补正确性）

1. **标签唯一性**：上游 `@@unique([subject, name, userId, parentId])` 在 SQLite 下 **NULL 不参与唯一** → 根节点/系统标签实际不受保护；我们改成**两条手写部分唯一索引**（系统 / 自定义分开）。
2. **越权**：上游 `PATCH /api/error-items/[id]/notes` **无归属校验**（IDOR，盘点 §7 已列）；我们的同名接口强制 family 归属。

---

## 2. API 逐条对照（上游 40 个 route.ts）

状态：✅ 已实现（P6-1）｜🟡 计划中（说明批次）｜⚪ 平台级（我们已有等价物）｜⛔ 明确不采用

| 上游端点 | 状态 | 本项对应 |
|---|---|---|
| `POST /api/error-items` | ✅ | `POST /wrong-questions`（含**上游 2 秒窗 + 前 100 字符去重**） |
| `GET /api/error-items/list` | ✅ | `GET /wrong-questions`（5 字段关键词 + 学科 + 掌握度 + 标签 + 区间 + 分页默认 18） |
| `/api/error-items/[id]`（GET/PATCH/DELETE） | ✅ | `GET/PATCH/DELETE /wrong-questions/:id`（DELETE 改软删） |
| `/api/error-items/[id]/delete` | ✅ | 同上（上游另设一条删除路由） |
| `/api/error-items/[id]/mastery` | ✅ | `PATCH /wrong-questions/:id/mastery` |
| `/api/error-items/[id]/notes` | ✅ | `PATCH /wrong-questions/:id/notes`（**补归属校验**） |
| `/api/tags`（GET/POST/DELETE） | ✅ | `GET/POST/DELETE /knowledge-tags`（含 `tree=true`） |
| `/api/error-items/[id]/geogebra` | 🟡 P6-4 | GeoGebra 命令（外网 CDN） |
| `/api/geogebra-analyze` | 🟡 P6-4 | 同上（未保存题目） |
| `/api/analyze` | 🟡 P6-3 | AI 识题（图片→9 个 XML 标签） |
| `/api/reanswer` | 🟡 P6-3 | AI 重解 |
| `/api/practice/generate` | 🟡 P6-4 | 相似题生成 |
| `/api/practice/record` | 🟡 P6-4 | 练习记录（表已建） |
| `/api/stats/practice`、`/api/stats/practice/clear` | 🟡 P6-4 | 练习统计 |
| `/api/analytics` | 🟡 P6-4 | 统计分析 |
| `/api/export`、`/api/import` | 🟡 P6-4 | JSON 备份/恢复（事务化） |
| `/api/error-items/batch-delete`、`/api/error-items/clear` | 🟡 P6-4 | 批量删除 / 清空 |
| `/api/tags/suggestions` | 🟡 P6-4 | 标签建议 |
| `/api/tags/stats` | 🟡 P6-4 | 标签统计 |
| `/api/user`（GET/PATCH 学段/入学年） | 🟡 P6-4 | 用户档案（字段已加到 `users`） |
| `/api/notebooks`、`/api/notebooks/[id]` | ✅（等价） | **上游"错题本"= `Subject` 表**（已读源码确认：`prisma.subject.findMany({where:{userId}})`）→ 我们用固定学科枚举，列表页的**学科筛选**即等价能力 |
| `/api/ai/test`、`/api/ai/models` | 🟡 P6-3 | 连通性测试（注意上游把 key 放 query，我们不会） |
| `/api/settings`（GET/POST AI 配置） | ⛔ | 上游把密钥**明文存 JSON 且接口零认证**（盘点 §7）→ 我们只用 `.env`，不提供该端点 |
| `/api/admin/*`（dashboard/users/system-reset/migrate-tags） | ⛔ | 管理后台；`system-reset` 是**全库删除**（危险），不移植 |
| `/api/openclaw/batch-upload` | ⛔ | 机器对机器批量导入通道，与产品无关 |
| `/api/auth/[...nextauth]`、`/api/register`、`/api/register/status` | ⚪ | 我们已有自己的认证（P0：JWT + 刷新轮换） |
| `/api/logs/frontend`、`/api/version` | ⚪ | 平台级（上游该端点还缺认证） |

**小结**：错题本**业务核心**（录入 / 列表 / 详情 / 更新 / 删除 / 掌握度 / 笔记 / 复习 / 知识点标签）**已全部实现并验证**；
剩余为 P6-2 图片上传、P6-3 AI、P6-4（相似题 / 统计 / 导入导出 / 批量 / GeoGebra / 标签建议与统计）。

---

## 3. 页面逐条对照（上游 14 个 page.tsx）

| 上游页面 | 状态 | 本项对应 |
|---|---|---|
| `page.tsx`（首页 = 上传/识题入口） | 🟡 P6-2/P6-3 | 学习中心 → AI 解题 |
| `error-items/[id]/page.tsx`（错题详情） | ✅ | `WrongQuestionDetailPage` |
| `notebooks`、`notebooks/[id]`、`notebooks/[id]/add` | ✅（等价） | 错题列表 + 学科筛选 + 录入页（上游"错题本"=Subject，见 §2） |
| `tags/page.tsx`（标签管理） | 🟡 P6-4 | 目前可在录入页现场新建自定义标签 |
| `practice/page.tsx`（练习） | 🟡 P6-4 | — |
| `stats/page.tsx`（统计） | 🟡 P6-4 | — |
| `print-preview/page.tsx`（打印预览） | 🟡 P6-4 | — |
| `admin`、`admin/user/[id]` | ⛔ | 管理后台（含危险的全库重置） |
| `login`、`register` | ⚪ | 我们已有自己的登录/注册页 |
| `latex-test/page.tsx` | ⛔ | 上游开发自测页 |

---

## 4. 结论（如实）

1. **是的，是按上游做的**：模型字段、接口语义、去重算法、分页默认值、复习记录结构、知识点邻接表全部对照上游；
   可用 `visualasset/_fidelity_diff.py` 随时复跑核对。
2. **偏离只有 4 类且都已登记**：租户/归属字段、软删除、固定学科枚举、图片存 key 而非 base64；
   外加"不移植上游已废弃列 `knowledgePoints`"与"不移植上游有安全缺陷的 admin/settings/openclaw"。
3. **"全部功能"尚未完成**：P6-1（本批）是忠实子集；P6-2/3/4 清单见 §2 的 🟡 项，按用户确认的 4 批节奏推进。

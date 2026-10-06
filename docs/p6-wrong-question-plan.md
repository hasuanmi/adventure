# P6 错题本 + AI 解题 实施计划（含已确认决策）

> 版本：v1.0 · 2026-10-06
> 上游调研：[`docs/wrong-notebook-feature-inventory.md`](./wrong-notebook-feature-inventory.md)（wrong-notebook v1.9.1 全功能盘点，带 file:line）
> 架构基线：`新项目V1-开源模块整合架构方案.md`（v1.2）、`docs/opensource-mapping.md`、`docs/client-architecture.md`

---

## 0. 用户已确认的 4 项决策（2026-10-06）

| # | 决策 | 含义（实施时必须遵守） |
|---|---|---|
| 1 | **AI 先搭适配层，晚点接真模型** | 本批不依赖任何外部 AI 服务：定义 provider 接口 + `NullAiProvider`（未配置时返回明确 `ai_not_configured`，**不静默失败**）+ 前端 UI 与状态位；密钥到位后只改配置 |
| 2 | **按 MIT 意向复用（个人自用）** | 可复制+适配上游数据模型/去重算法/筛选逻辑/提示词，**必须附版权声明**（P6-1 起即建 `docs/THIRD_PARTY_NOTICES.md` 条目）；**仅个人自用**，商用/对外发布前必须联系作者 `wttwins` 取得正式授权或替换实现 |
| 3 | **分 4 批做** | P6-1 数据+手动闭环 → P6-2 图片上传+裁剪压缩 → P6-3 AI 识题/解析/重解 → P6-4 相似题/GeoGebra/统计/导入导出/打印。**每批独立可验收**，不跨批堆积 |
| 4 | **复习先做简单轮次** | `WrongQuestionReview`（round/status/result），**不做**间隔排期、不做"今日待复习"提醒（上游 `[1,2,4,7,15,30]` 是死代码，V1 不实现） |

---

## 1. 分批计划与验收

### P6-1 数据与手动闭环（本批先做）

**交付**：
- 后端：`KnowledgeTag`（邻接表树）/ `WrongQuestion` / `WrongQuestionTag` / `WrongQuestionReview` 四表 + service + API + DTO；学科固定枚举白名单；软删除 `deleted_at`；每表 `family_id`
- API：`POST/GET/PATCH/DELETE /wrong-questions`、`PATCH /:id/mastery`、`POST/GET /:id/reviews`、`GET/POST /knowledge-tags`
- 前端：**底部导航新增第三格「学习」** → 学习中心（两个入口卡：**AI 解题**、**错题本**）；错题列表（学科/掌握度/关键词筛选 + 分页）、录入表单（纯文字）、详情页（题干/答案/解析/错因/知识点/复习轮次/掌握标记/来源任务）
- 幂等：`dedupe_hash`（`sha256(childId + 题干前 100 字规范化)`）**手写唯一索引**；命中 → 409 `duplicate_question`（回带已有 id 供 UI 跳转）——替换上游"2 秒时间窗 + findFirst"的并发不安全做法

**验收**：录入 → 列表筛选可见 → 详情 → 标记掌握 → 加一次复习轮次 → 删除（软删不列表）；重复录入同题 → 409 且能跳到已有题；`browser-check` 新增断言，`tsc` 与迁移通过

### P6-2 图片上传（用户已确认"连上传接口一起做"）

- 后端：`POST /api/files`（multipart、mime 白名单、单文件 ≤10MB、归属校验）+ `GET /api/files/:key`（鉴权读取）；存储 `uploads/{family_id}/wrong-question/{id}/`，**URL/key 入库，绝不 base64**
- 前端：选图 → **压缩（≤1MB / 最长边 1920 / JPEG 质量递减）** → 必要时裁剪（自由比例）→ 上传 → 详情预览
- **不采用**上游：base64 直存 DB、列表接口不裁字段（我们列表一律 `select` 裁剪，不带图片体）
- 验收：上传 → 列表/详情可见 → 未授权读取 403/401；压缩后 ≤1MB；列表响应体不含图片数据

### P6-3 AI 识题 / 解析 / 重解

- 后端：provider 接口 + 三个端点 `POST /wrong-questions/ai/analyze`（**视觉模型**，图或文字）、`POST /:id/ai/reanswer`、`GET /ai/status`；**异步化**（队列 + `aiStatus: idle|running|succeeded|failed` + 轮询），**不照搬上游 180s 同步阻塞**
- 前端：录入页"AI 识题"按钮 + 进度/失败态；结果落表单可编辑后保存
- 提示词：按决策 2 复用上游模板（独立文件 + 版权声明），输出 **XML 标签**（9 个标签），解析沿用其 `extractTag` 思路
- **关键修正**：相似题/解析的知识点来源必须用**新 tags 关系表**（上游读的是已废弃 `knowledgePoints` 字段 → 会静默拿到空知识点）
- 未配密钥时：`ai_not_configured`（前端显示"AI 未配置"，其余功能不受影响）
- 验收：未配置 → 明确提示；配置后 → 识题结果回填表单；失败可重试

### P6-4 相似题 / GeoGebra / 统计 / 导入导出 / 打印

- 相似题生成（`POST /:id/practice/generate`）、练习记录（`PracticeRecord` 需**补 `wrongQuestionId`**，上游缺失导致无法回溯）
- GeoGebra：**保持外部 CDN 依赖 + 命令白名单 + 字符黑名单**（上游 16 方法白名单 / `[<>'"]` 黑名单两个安全边界不能丢）；若不要外网依赖可整批砍掉
- 统计：recharts（学科分布饼图 / 掌握度堆叠柱 / 复习趋势）
- 导入导出：JSON（`version:1`，事务化、去重映射）；打印：`window.print()` 打印预览
- 验收：各功能有断言；GeoGebra 未配置时优雅降级

---

## 2. 数据模型映射（上游 → 本项目）

| 上游 | 本项目 | 说明 |
|---|---|---|
| `User`（NextAuth，无租户） | `users`（已有）+ **每表 `family_id`/`child_id`** | 归属一律 service 层校验（硬基线） |
| `Subject`（自由命名） | **固定枚举白名单**：chinese/math/english/olympiad/pet | 与 `subject` 现用枚举一致，不引入自由建科目 |
| `KnowledgeTag`（邻接表，`@@unique` 含 NULL → SQLite 下根节点不受保护） | `KnowledgeTag`（邻接表） + **部分唯一索引**（`WHERE parent_id IS NULL` 与非 NULL 分开） | 顺手修掉上游唯一性漏洞 |
| `ErrorItem`（无任何索引；`knowledgePoints` 已废弃但双轨读写） | `WrongQuestion`（**建索引**：`family_id`/`child_id`/`subject`/`mastery_level`；**单一标签来源** = M2M 表） | 不做双轨 |
| `ErrorItem.originalImageUrl`（base64 单列） | `WrongQuestionImage`（key/url + 排序） | **绝不 base64**；列表 `select` 裁剪 |
| `masteryLevel` 0/1（2 从未产生） | `masteryLevel` 0/1/2（新建/复习中/已掌握，UI 三态可循环） | 上游 UI 只用了两态，我们按语义补全 |
| 去重：2 秒窗 + `findFirst`（并发不安全） | `dedupeHash` + **手写唯一索引** → 409 | 幂等靠 DB 约束 |
| 错误体 `{message,code?,details?}` | `{error, reason, fields?}`（全局异常过滤器） | 硬基线 |
| 无软删除（9 处物理删） | `deleted_at` 软删除 | 硬基线 |
| `ReviewSchedule`（零调用点的死代码） | **不建表**；`WrongQuestionReview`（round/status/result） | 决策 4 |

---

## 3. 明确不做（V1 范围外）

- 上游的 admin 后台 / 系统重置、i18n（zh/en）、PWA、Openclaw 批量导入通道、屏幕截图（`getDisplayMedia`，Chromium+HTTPS 限定）、广播通知、自由命名科目、base64 存储、间隔复习排期
- **7 处上游认证/越权缺口一律不继承**（`/api/settings` 零认证泄漏明文 Key、`/api/tags/stats` 跨用户统计、notes 与 practice/generate 两处 IDOR、`/api/logs/frontend` 无认证、`/api/ai/models` key 走 query、admin 全库 `deleteMany`）
  → 本项目坚持：**controller 级 `@UseGuards(JwtAuthGuard)` + service 层 family/child 归属校验**；后续可选加固为"全局 Guard 默认拒绝 + `@Public()` 白名单"

---

## 4. 待确认 / 数据依赖

1. **知识点标签库数据**：上游 `chinese/history/geography/politics` 是**空数组**，数学 4 层（185 节）最全。P6-1 先支持"任意学科 + 自定义标签"，内置树数据作为单独一步导入（避免被上游的空数据拖住）。
2. **AI 密钥与模型 ID**：等提供后填入 `.env`（`AI_PROVIDER` / `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` / `AI_VISION_MODEL`），**密钥只进 .env，不入库、不进前端**。
3. **GeoGebra 是否保留**（外部 CDN + 需 HTTPS 上下文）：P6-4 前确认。

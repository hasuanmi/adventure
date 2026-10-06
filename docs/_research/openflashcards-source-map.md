# OpenFlashcards（HelioFernandes404）源码级能力地图

> 调研对象：`https://github.com/HelioFernandes404/openflashcards`
> 快照：`HEAD = cb94738225264bf18c3df1e0cc338aa814794b20`（2026-10 只读抓取；本机 git 不可用，全部经 `api.github.com` / `raw.githubusercontent.com` 只读读取）
> LICENSE：**MIT**，`LICENSE` 原文 `Copyright (c) 2026 Helio Fernandes and contributors`
> 技术栈（`apps/api/go.mod` + `apps/web/src/features/*`）：Go（Gin + pgx + sqlc + PostgreSQL）+ React/TS（Vite）；自带 FSRS、TTS（Google/ElevenLabs/Piper）、Redis 缓存、媒体库
> 用途：本文件是 `docs/opensource-wordbook-mapping.md` 的证据底稿；结论只来自实际读到的文件，未读到的写「未确认」。

---

## 0. 一句话结论

它是一个「**通用 Anki 替代品**」，不是单词本：`cards.front` 是英文单词/短语，`cards.back` 是**译文/释义**（不区分词性、无中文释义、无例句字段），`fonetica` 明确注明是**「Brazilian-readable phonetics (NOT IPA)」**（`apps/web/src/features/cards/types/card.ts:12`）。
因此对本项目而言：**发音链路 / TTS 抽象 / FSRS 调度 / 复习配额并发守卫 / 媒体所有权** 值得复用；**数据结构与产品形态不适用**（我们要 Word/Definition/Example/词性/中文释义）。

---

## 1. 数据模型（源码级）

`apps/api/internal/shared/db/sqlc/models.go`（sqlc 生成，等价于 DDL；`apps/api/internal/shared/db/sqlc/cards.sql.go` 含原始 SQL）：

| 实体 | 字段（源码原文） | 备注 |
|---|---|---|
| `Card` | `id, deck_id, front, back, audio_url, imagem_url, fonetica, tts_enabled, stability, difficulty, due, last_review, state, reps, lapses, fsrs_card_json, row_version, created_at, updated_at` | `state ∈ new/learning/review/relearning`（`fsrs/fsrs.go` `mapState`）；`row_version` 乐观锁 |
| `Deck` | `id, user_id, name, description, tags[], new_cards_daily_limit, module_id, created_at, updated_at` | 每日新卡配额在 **deck** 上，不在用户上 |
| `Review` | `id, card_id, user_id, rating, state, scheduled_days, elapsed_days, review_datetime, review_duration_ms, stability, difficulty, was_new` | `was_new` 记录**复习前**状态，用于精确统计当日新卡（`service_review.go` 注释） |
| `Medium` | `id, user_id, kind('image'), storage_path, original_filename, content_type, size_bytes, created_at` | v1 只支持 image（`media/service.go:15` `const kindImage = "image"`） |
| `User` | 含 `fsrs_parameters float64[]`、`desired_retention`、`optimization_status`、`last_optimization`、`timezone` | **每用户 FSRS 权重 + 目标保留率** |

**可复用判断**：`Review` 的 `was_new` + `row_version` 两个字段设计值得照搬到我们的 `WordReviewRecord` 与 `UserWord`（见主文档 §8）。

---

## 2. 间隔复习（FSRS）

| 能力 | 源码位置 | 实现要点 |
|---|---|---|
| FSRS 封装 | `apps/api/internal/shared/fsrs/fsrs.go` | 薄封装 `github.com/open-spaced-repetition/go-fsrs/v4`；`Rating ∈ 1..4`（Again/Hard/Good/Easy）；`Card` 域投影（`State` 转字符串）+ `Inner` 保留完整库结构；`MarshalCard/UnmarshalCard` JSON 往返 |
| 每用户参数 | `fsrs.go` `NewWithParameters(weights, desiredRetention)` + `cards/service_review.go` `schedulerForUser()` | 从 `User.fsrs_parameters` / `desired_retention` 构造；**每条 fallback 都打日志**（注释原文：silent fallback 会让"没优化过"和"参数坏了"无法区分） |
| 提交复习 | `apps/api/internal/cards/service_review.go` `SubmitReview()` | ① 事务内先 `SELECT ... FOR UPDATE` 锁 deck 行 → ② 校验当日新卡配额 → ③ `UpdateCardAfterReview`（`WHERE id=? AND row_version=?`，`ErrNoRows → ErrRowVersionConflict` 409）→ ④ 写 `reviews` 行 → commit |
| 每日新卡配额 | 同上 `newCardsQuotaForUpdate()` + `cards.sql.go` 的 `countNewCardsStudiedToday` / `listDueCardsByDeck` / `countDueCardsByDeck` | 配额通过 `ROW_NUMBER() OVER (PARTITION BY (state='new'))` **下推到 SQL**，保证分页与总数一致（注释引用了上游 issue） |
| 复习预览 / 遗忘曲线 | `apps/api/internal/cards/service_preview.go`、`apps/web/src/features/study/components/ForgettingCurveChart.tsx`、`StudyRetrievabilityBar.tsx` | `GetRetrievability` 暴露可提取性；前端画遗忘曲线 |

**迁移到 NestJS+TS 的对应实现**：`ts-fsrs`（`open-spaced-repetition/ts-fsrs`，GitHub license 字段 = **MIT License**，805 stars）。不要照搬 Go 代码；照搬的是**同一个官方算法库 + 我们自己的 Prisma 事务写法**。

---

## 3. 发音 / TTS（最高优先级）

### 3.1 抽象层（可直接复用模式）

`apps/api/internal/shared/tts/`：

| 文件 | 能力 |
|---|---|
| `provider.go` | `Provider interface { Name() string; CacheKey() string; Synthesize(ctx, text) (string, error) }` —— **4 行接口**，任何 TTS 后端（云/自建）都能接 |
| `router.go` | `newProvider(cfg)`：`google`（默认）/ `elevenlabs` / `tts_piper` 三选一；未知 provider 直接报错不静默 |
| `tts.go` | `Service`：**Redis 缓存**（`key = "tts:" + sha256(provider.CacheKey() + "|" + text)`）、**指数退避重试**（`withRetry`）、**熔断器**（`newCircuitBreaker(3, 30s)`）；`Status()` 返回 `ok/degraded` 且**不做网络调用** |
| `resilience.go` | `withRetry` / `circuitBreaker`（3 次失败开 30s） |
| `google.go` | Google Cloud TTS，MP3，返回 **base64**；30s 超时 |
| `elevenlabs.go` | ElevenLabs HTTP，`xi-api-key`，返回 base64/URL（看上游响应） |
| `piper.go` | **HTTP 方式**调用外部 Piper 服务（`POST {baseURL}/synthesize`，body `{text, voice, model}`，可选 `Bearer token`）→ Piper 本体不在仓库内 |

配置默认值（`apps/api/internal/shared/config/config.go`）：

```go
TTSCacheTTLSeconds int    `envconfig:"TTS_CACHE_TTL" default:"31536000"`  // 1 年
TTSProvider        string `envconfig:"TTS_PROVIDER" default:"google"`
TTSLanguage        string `envconfig:"TTS_LANGUAGE" default:"en-US"`
TTSVoiceName       string `envconfig:"TTS_VOICE_NAME" default:"en-US-Chirp3-HD-Algenib"`
TTSSpeakingRate    float64 `envconfig:"TTS_SPEAKING_RATE" default:"0.80"` // 语速 0.8，为学习者放慢
```

**关键结论**：OpenFlashcards 把 TTS 当**首选发音来源**（不是 fallback），免费词典音频（Wiktionary）它完全没用；缓存放 Redis 且 TTL 一年 —— 这等于**长期持有第三方 TTS 厂商生成的音频**，是否合规取决于厂商条款（见 `audio-pronunciation-licensing.md`），不是代码问题。

### 3.2 发音相关接口

| 方法 | 路由 | 源码 | 行为 |
|---|---|---|---|
| GET | `/api/v1/cards/:id/audio` | `cards/handler.go` + `handler_content.go:audio()` | 返回 `{audioBase64}`；`tts_enabled=false → 400 TTS_DISABLED`；未配置 TTS → `503 TTS_UNAVAILABLE` |
| POST | `/api/v1/cards/audio` | `handler_content.go:synthesizeText()` | 任意文本合成（`text` 1..5000）；路由上挂了 `synthesizeMiddleware`（**每用户限流**，注释指明这是付费调用、必须限流） |
| GET | `/api/v1/cards/:id/front` | `handler_content.go:getFront()` | 挑战面：**绝不含 phonetic/back/ttsAudio**（防剧透） |
| GET | `/api/v1/cards/:id/back` | `handler_content.go:getBack()` | 答案面：含 `phonetic + ttsAudio`；**TTS 失败不阻塞内容**（best-effort，日志告警后照常返回） |

### 3.3 音频本体（媒体库）

`apps/api/internal/media/`：

- `service.go`：**v1 只允许 image**（`allowedImageTypes` 只含 png/jpeg/webp/gif，`http.DetectContentType` 按字节嗅探，不信文件名/请求头）；文件落盘 `{MEDIA_DIR}/{userId}/{mediaId}.{ext}`；`MaxBytes` 限制上传；**删除前检查是否被卡片引用**（`CountCardsReferencingURL`，被引用则 `ErrMediaInUse`）。
- `types.go`：`urlPrefix = "/api/v1/media/"`，`Media.URL()` = `urlPrefix + id`；`storagePath` **不出现在 JSON 契约里**。
- `service.go:OwnerOfURL()`：把 URL 反解回属主，供 cards 校验「客户端提交的 audioUrl/imagemUrl 是否属于该用户」。
- 结论：**它是「用户上传图片」的媒体库，不是发音音频缓存**。发音音频不进媒体库，走 Redis。

### 3.4 前端发音组件（React）

| 文件 | 能力 |
|---|---|
| `apps/web/src/features/study/hooks/useStudyCardAudio.ts` | 统一发音 Hook：`playUrlAudio()`（http/data URL → `new Audio(url).play()`）；非 URL 的字符串视为 **base64** 交给 `useAudioPlayer().playBase64Audio`；`autoPlay` 延迟 300ms；卸载即 `stopAudio()`；`hasAudio = ttsEnabled && (ttsAudio \|\| audioUrl)` |
| `apps/web/src/features/study/components/StudyAudioButton.tsx` | 44px+（`min-h-11`）可点区域、`aria-label="Play pronunciation"`、`aria-pressed`、播放中 `animate-pulse` |
| `apps/web/src/shared/hooks/useAudioPlayer.ts`（被上述 Hook 引用，未逐行读取） | base64 → `<audio>` 播放器封装；**标记为未逐行核验** |
| `apps/web/src/features/study/components/StudySoundToggle.tsx` | 音效总开关 |

**拼音学到的关键设计**：`audioUrl`（外链 mp3，直接 `<audio>`）与 `ttsAudio`（服务端 base64）**双通道并存，谁有播放谁**——这正是我们要的「真实录音优先、TTS 兜底」两段式，可原样移植（Auth 无关、纯前端）。

---

## 4. 学习流程 / 会话（前端）

| 文件 | 能力 |
|---|---|
| `apps/web/src/features/study/hooks/useStudySession.ts`（16.5KB） | 学习会话状态机：拉 due 列表、翻卡、评分、进度、会话结束统计 |
| `apps/web/src/features/study/components/ReviewRatingBar.tsx` | Again/Hard/Good/Easy 四档评分条 |
| `apps/web/src/features/study/components/StudySessionSummaryCard.tsx` | 会话结算卡（数量/时长/正确率） |
| `apps/web/src/features/study/components/StudyComboIndicator.tsx` | 连胜连击提示（游戏化） |
| `apps/web/src/features/study/components/StudyAutoFlipControls.tsx`、`ScalableContent.tsx`、`StudyCardImage.tsx` | 自动翻卡、内容缩放适配、配图 |
| `apps/web/src/features/cards/domain/*.ts` | 纯领域函数（`browseCatalog.ts` / `cardContent.ts` / `cardPreview.ts`，均带 `*.test.ts`）→ **纯函数 + 测试**的写法值得照搬 |

**没有的能力（必须 clean-room）**：拼写练习（听音拼写）在整个仓库不存在 —— 见 §6。

---

## 5. 前后端接口清单（cards 模块，`cards/handler.go:RegisterCardRoutes`）

```
POST   /api/v1/cards                 创建
POST   /api/v1/cards/bulk            批量创建
GET    /api/v1/cards/browse/filters  筛选项
GET    /api/v1/cards/browse          分页浏览（state/deckId/dueBefore/createdAfter/editedAfter/untaggedOnly）
GET    /api/v1/cards/due             全局到期
GET    /api/v1/cards/deck/:id/due-summary   到期摘要（含当日新卡配额）
GET    /api/v1/cards/deck/:id/export       导出
GET    /api/v1/cards/:id             详情
GET    /api/v1/cards/:id/fsrs-debug  FSRS 调试
GET    /api/v1/cards/:id/preview     复习预览（下次各评分的结果）
GET    /api/v1/cards/:id/front       挑战面（无剧透）
GET    /api/v1/cards/:id/back        答案面（含 TTS）
GET    /api/v1/cards/:id/audio       发音（base64）
POST   /api/v1/cards/audio           任意文本合成（限流）
PUT    /api/v1/cards/:id             更新
PATCH  /api/v1/cards/:id/move        移动卡组
DELETE /api/v1/cards/:id             删除
POST   /api/v1/cards/:id/review      提交复习
GET    /api/v1/decks/:id/cards       卡组下卡片
GET    /api/v1/decks/:id/cards/count 卡组计数
```

**front/back 分离 + preview 预告** 是它最好的产品设计之一：前端拿不到答案面就不会泄题；`preview` 让用户先看到「选 Again 会 1 天后再来、选 Easy 会 10 天后」再评分。

---

## 6. 拼写（Spelling）

- OpenFlashcards 全仓**无拼写练习**：`features/study/components/` 下只有翻卡、评分、拨动、统计类组件，无输入校验/拼写判定文件。
- 因此「听音辨词/听音拼写」「看中文写英文」的判定逻辑必须从 **Lexica** 移植（见主文档 §5、`docs/opensource-wordbook-mapping.md`），或按 Lexica 口径重新实现。

---

## 7. 可直接复用 / 需改造 / 不可复用（结论）

| 能力 | 判断 | 方式 |
|---|---|---|
| TTS Provider 接口 + 路由 + Redis 缓存 + 重试/熔断 | ✅ 模式直接复用 | Go → TS 重写（接口形态照搬；本项目已用 NestJS + Prisma，无 Redis 需先定缓存介质） |
| front/back 分离（防剧透）| ✅ 直接复用（设计） | 我们的 `GET /words/:id/quiz` |
| 复习前状态 `was_new` 字段 | ✅ 直接复用 | `WordReviewRecord.wasNew` |
| 乐观锁 `row_version` + 409 | ✅ 直接复用 | `UserWord.version` |
| 每日新卡配额行锁 | ✅ 直接复用 | Prisma `$transaction` + `SELECT ... FOR UPDATE`（与已落地的 completion 模块同款写法） |
| 音频双通道（外链 url / base64）前端 Hook | ✅ 直接复用+改造 | 改成「真实录音 url 优先 + 服务端 TTS 流兜底」 |
| 媒体库（上传图片、字节嗅探、引用检查、OwnerOfURL） | ⚠️ 部分复用 | 我们错题本已有 `apps/api/src/files`，只借「引用检查 + 拥有者校验」两点 |
| `fonetica`（巴西葡语可读拼写，非 IPA） | ❌ 不可用 | 我们要 **IPA**（`phonetic` 字段语义不同） |
| `front/back` 双字段卡模型 | ❌ 不可用 | 我们要 Word/词性/释义/例句多实体 |
| Deck/Module/Kanban/Letters/StudyPlan/PromptTemplate | ❌ 不引入 | 超出单词本范围（用户已明确排除课程市场/社交等） |
| Excel/CSV 导入导出（`features/cards/importExport/`） | ⚪ 暂不引入 | MVP 不需要；若以后要批量导词再回来抄 `csvValidation.ts` |
| 拼写练习 | ❌ 不存在 | 从 Lexica 取 |

> 纪律：本文件只登记**真正读过**的文件。`apps/web/src/shared/hooks/useAudioPlayer.ts` 未逐行读取；`fsrs/optimize/`（fsrs-rs 侧车优化器）未展开。

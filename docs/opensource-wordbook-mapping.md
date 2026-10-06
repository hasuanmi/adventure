# 单词本（Wordbook）开源源码级复用映射表

> 建立于 2026-10-06（单词本功能**第一阶段调研**，不写业务代码）。
> 配套文档：`docs/wordbook-phase1-research.md`（调研结论 / 发音方案 / 数据库与 API 建议）、`docs/THIRD_PARTY_NOTICES.md`（第三方声明，开发阶段更新）。
> 证据底稿：`docs/_research/openflashcards-source-map.md`、`docs/_research/lexica-source-map.md`、`docs/_research/opensource-wordbook-liozon-freedict.md`、`docs/_research/audio-pronunciation-licensing.md`。
> 与既有 `docs/opensource-mapping.md` 的关系：本表是**单词本专用**映射表；总表在其对应阶段追加一行指回本表。
> 抓取方式说明：本机 `git clone` 不可用（`github.com:443` 经 `127.0.0.1:7897` 代理失败），全部源码经 `api.github.com` / `raw.githubusercontent.com` **只读**读取；下表所有文件路径均已实际打开核对。快照 commit 记在 §三。
>
> **禁止事项（本阶段）**：不修改 Prisma schema、不修改错题本/Task/Growth/Approval/现有页面、不新增单词本业务代码、不新增 npm 依赖、不复制整个开源项目、不臆断 License 与音频授权。本文件只登记结论。

---

## 一、能力 × 来源 × 复用方式（主表）

| 功能 | 项目 | 源码文件（已实际读取） | 实现方式（源码事实） | License（代码） | 是否可直接复用 | 我们的处理方式 |
|---|---|---|---|---|---|---|
| 单词数据结构 | OpenFlashcards（HelioFernandes404） | `apps/api/internal/shared/db/sqlc/models.go`（`Card`/`Deck`/`Review`/`Medium`）、`apps/api/internal/cards/types.go` | 单表 `cards`：`front`(英文词)/`back`(译文)/`fonetica`/`audio_url`/`tts_enabled` + FSRS 状态列 + `row_version`；**一个单词一行，无词性/释义/例句实体** | MIT | ❌ 结构不可复用 | **clean-room**：按我们自己的 `Word`/`WordDefinition`/`WordExample` 建模（§八 建议）；仅借 `row_version` 乐观锁与 `was_new` 两处字段设计 |
| 复习记录 was_new | OpenFlashcards | `apps/api/internal/shared/db/sqlc/models.go`（`Review.WasNew`）、`apps/api/internal/cards/service_review.go` | 记录**复习前**状态，用于精确统计「当日新学单词数」（避免用 `elapsed_days=0` 推断） | MIT | ✅ 可复用（字段设计） | 落到 `WordReviewRecord.wasNew`，统计当日新词配额 |
| 间隔复习（FSRS） | OpenFlashcards | `apps/api/internal/shared/fsrs/fsrs.go`（`New`/`NewWithParameters`/`Next`/`Retrievability`/`MarshalCard`）、`apps/api/internal/cards/service_review.go`（`SubmitReview`/`schedulerForUser`/`newCardsQuotaForUpdate`） | 薄封装官方 `go-fsrs/v4`；四档评分 `Rating 1..4`；**每用户**权重 `User.fsrs_parameters` + `desired_retention`；调度在事务内、deck 行 `FOR UPDATE` 串行化 | MIT | ⚠️ 算法复用、代码不直搬（Go） | **改用官方 TS 实现 `ts-fsrs`**（`open-spaced-repetition/ts-fsrs`，GitHub license 字段 = MIT）；事务/行锁按 `apps/api/src/completion/completion.service.ts` 既有 Prisma 写法重写 |
| 每日新词配额（防并发超发） | OpenFlashcards | `apps/api/internal/cards/service_review.go`（`newCardsQuotaForUpdate` 注释 + `WHERE status='pending'` 同类守卫）、`apps/api/internal/shared/db/sqlc/cards.sql.go`（`countNewCardsStudiedToday`、`ROW_NUMBER() OVER (PARTITION BY (state='new'))` 下推到 SQL） | 配额检查放进**事务 + 行锁**内；分页与总数用同一 `MaxNewCards` 保证一致 | MIT | ✅ 可复用（模式） | `WordReviewService.startReview()` 用 Prisma `$transaction` + `$queryRaw FOR UPDATE`（与 P1 completion 同款） |
| 复习预览（各评分后果预告） | OpenFlashcards | `apps/api/internal/cards/service_preview.go`、`apps/api/internal/cards/handler_preview.go`、路由 `GET /cards/:id/preview` | 提交前先算出 Again/Hard/Good/Easy 各自的下次间隔，让用户在知道后果后再评分 | MIT | ✅ 可复用（产品设计） | `GET /wordbook/words/:id/review-preview`；前端评分条下方显示「1天 / 3天 / 7天 / 21天」 |
| 防剧透的题面/答案分离 | OpenFlashcards | `apps/api/internal/cards/handler_content.go`（`getFront` / `getBack`：front **绝不含** phonetic/back/ttsAudio）、`apps/web/src/features/cards/types/card.ts`（`CardFront` / `CardBack` / `ReviewResult` 三型） | 同一张卡拆成三个响应类型：挑战面 / 答案面 / 复习结果 | MIT | ✅ 可复用（契约设计） | `WordFrontDto` / `WordBackDto` 拆开；听音拼写接口只返回 `audioUrl`，**不返回拼写与释义** |
| **发音（真实录音）** | Wikimedia Commons / Wiktionary（`upload.wikimedia.org`）；官方批量渠道 `kaikki.org` | Commons 政策（只接纳允许**商用 + 再分发**的自由许可）+ Wiktextract 文档：音频字段为「name of sound file in WikiMedia Commons」，实体在 `upload.wikimedia.org`；官方口径 `Directly using a Commons file via embedding its URL ("hotlinking") is also possible, but is not recommended.`；批量下载应走 kaikki 打包音频（官方原文：逐个下载 `puts unnecessary load on Wikimedia servers`） | 逐文件 CC0/PD/CC BY/CC BY-SA 混用（实测样本含 BY-SA 3.0 / BY-SA 4.0 / BY 3.0 US，另有文件无 license 字段） | 见 §二 与 `docs/_research/audio-pronunciation-licensing.md`（含 14 项未确认） | ⚠️ 制度上可商用/可缓存/可再分发，**但必须逐文件核对 author+license**（WMF 明确不担保） | **自建「Commons 授权白名单音频库」**：批量获取 → 逐文件核对 → **原样不改动**（避免 ShareAlike 改编义务）→ 自托管 `http(s)://我们的域名`；DB 存 `source_page_url/license_name/license_url/author/attribution_text/sha256/verified_by`；hotlink 仅作应急 |
| 发音（无录音时兜底 1） | 自建 Piper TTS（rhasspy/piper 归档版 = MIT；现行 OHF-Voice/piper1-gpl = GPL-3.0） | voice 授权**逐个不同**：`en_US-ljspeech-medium` 数据集 public domain（可商用）；`en_US-lessac-medium` 为 Blizzard/Lessac 研究许可（原文排除 any commercial purpose）；`en_GB-alan-medium` 上游仅 `All Rights Reserved` | 代码：归档版 MIT；主线 GPL-3.0；**模型另行授权** | ⚠️ 仅 ljspeech 等干净 voice 可用 | ✅ 自己生成的音频可缓存/可支配；代码侧优先 MIT 归档版，GPL 主线需**进程隔离** + 法务确认 | **Fallback-1**：`TtsProvider` 的本地实现；wav 落自有存储；**禁用 lessac / en_GB-alan** |
| TTS 抽象与韧性（兜底实现骨架） | OpenFlashcards | `apps/api/internal/shared/tts/provider.go`（4 行 `Provider` 接口）、`router.go`（google/elevenlabs/tts_piper 三选一）、`tts.go`（Redis 缓存 + 指数退避 + 熔断）、`resilience.go`、`google.go`/`elevenlabs.go`/`piper.go`、`config.go`（`TTS_PROVIDER=google`、`TTS_LANGUAGE=en-US`、`TTS_VOICE_NAME=en-US-Chirp3-HD-Algenib`、`TTS_SPEAKING_RATE=0.80`、`TTS_CACHE_TTL=31536000`） | 服务端 TTS，返回 **base64 audio**；缓存 key = `sha256(providerCacheKey\|text)`，TTL **一年**；熔断 3 次失败开 30s；`/cards/audio` 路由单独挂**每用户限流**（注释：付费调用） | MIT | ✅ 可复用（接口与韧性模式） | 我们的 `TtsProvider` 接口照此形态（`name()`/`cacheKey()`/`synthesize()`），**接进来的是自建 Piper（Fallback-1）**；缓存介质按 §八 建议（Postgres/磁盘，不引入 Redis）；**限流必做**；**不照抄 `TTS_CACHE_TTL=31536000`**（云 TTS 长期缓存合规未确认） |
| 发音（无录音时兜底 2） | 浏览器 Web Speech API（`speechSynthesis`） | 平台能力；接口清单只有 `speak/getVoices/pause/resume/cancel`，**无任何返回音频字节的方法** → **明确不可缓存**；Android 旧 WebView / Opera Mini / UC 不支持 | 平台条款，非开源 | ❌ | ❌ | ❌ | **Fallback-2**：仅当白名单无音频且服务端 TTS 不可用时，UI 标注「浏览器合成语音」 |
| 发音（**明确排除**） | freeDictionaryAPI（dictionaryapi.dev）；云 TTS（Google/Azure/ElevenLabs）作缓存方案 | 仓库 LICENSE=GPL-3.0 vs package.json=ISC；线上响应带 Commons 溯源但仓库代码抓 Google/Oxford（不一致）；三家云 TTS 的「缓存/再分发」条款**均无法确认**（ElevenLabs 免费层明确禁商用） | — | ❌ | ❌ | ❌ | **不采用**：FDAPI 只可作可选便利索引（随时失败）；云 TTS 只允许「实时合成 + 不落盘」（Azure 须披露 AI 合成） |
| 发音播放（前端双通道） | OpenFlashcards | `apps/web/src/features/study/hooks/useStudyCardAudio.ts`（`playUrlAudio` → `new Audio(url)`；非 URL 字符串走 base64；`autoPlay` 延迟 300ms；卸载 `stopAudio()`）、`components/StudyAudioButton.tsx`（`aria-label="Play pronunciation"`、`aria-pressed`、播放中 `animate-pulse`）、`components/StudySoundToggle.tsx` | 同一个 Hook 里「真实录音 URL 优先 / 服务端 TTS base64 兜底」，谁有播谁 | MIT | ✅ 可复用+适配 | 移植为 `apps/web/src/hooks/use-word-audio.ts`：**Primary = 缓存音频 URL（我们自己的代理路由）→ Fallback = TTS 接口**；保留无障碍属性与自动播放延迟 |
| 听力/拼写题面 | OpenFlashcards（题型本身不存在） | 无该能力（`apps/web/src/features/study/components/` 全量目录已核对：无输入校验/拼写判定文件） | — | — | ❌ 无参考 | 拼写判定取自 Lexica（下一行） |
| **拼写练习（听音拼写）** | Lexica（lrydzkowski，v1.1.0） | `Lexica.Learning/LearningModeOperator.cs`（`ModeEnum.Spelling` 分支 @`GetQuestions`、`GetNumOfRequiredAnswersMultiplier`；`VerifyAnswer()` @约365-410）、`Lexica.Learning/Models/QuestionInfo.cs`（`GetCorrectAnswers()`）、`Lexica.Learning/Models/AnswerRegister.cs`（`AnswerRegisterValue{PreviousValue,CurrentValue}`）、`Lexica.CLI/appsettings.json`（`NumOfOpenQuestions`、`ResetAfterMistake`） | 判定口径：按**逗号**切分 → 每段 `Trim()` → 两侧 `Sort()` → `string.Join(',')` → **`InvariantCultureIgnoreCase` 整体比较**；答错则该词计数器 `Set 0`（`ResetAfterMistake=true` 时全部归零）；`OverridePreviousMistake()` = `PreviousValue + 1` | **MIT**（`Copyright (c) 2021 Łukasz Rydzkowski`） | ✅ 判定算法可直接移植 | 落 `packages/shared-types/src/wordbook.ts` 纯函数 `verifySpelling(input, accepted[])` + `apps/api/src/wordbook/wordbook.spelling.ts`；**必须补单测**（大小写/多答案顺序/首尾空白/少字母/多字母/连字符/撇号）。注意：**不要照搬它的可变单例 `CurrentQuestionInfo`**（见 Lexica 源码地图 §2 坑） |
| 拼写错误记录 | Lexica | `Lexica.Database/Services/LearningHistoryService.cs` + `lexica.db` 表 `answer`（`question / question_type / answer / proper_answers / is_correct`，`README.md` §Database） | 只记录「这道题答错」，**没有词级错词表** | MIT | ⚠️ 概念参考 | 我们需要**词级**错词记录：`WordSpellingAttempt` + `UserWord.spellingErrorCount`（§八）；SQLite 单表结构不移植 |
| 发音缓存（服务端磁盘目录约定 + HIT/MISS） | Liozon/OpenFlashcards | `src/utils/tts-cache.js`（`data/{userId}/tts/{lang}/spd{pct}/{id}.mp3`，命中/未命中分别计数）、`src/utils/tts-generate.js`（`wordDisplay`） | 服务端 TTS 结果按「用户/语言/语速/词」分目录落盘，命中即不再合成 | **Apache-2.0**（版权人未署名） | ⚠️ 可复用（目录约定 + 命中统计） | TTS 缓存目录与命中统计照此约定；**缓存前置条件是 TTS 厂商 ToS 允许缓存**（见 §二） |
| 掌握度计数（几次算掌握） | Liozon/OpenFlashcards | `src/routes/api.js:4-30`（`wordMaxProgress` / `phraseMaxProgress`，50–200 次正确）、`src/routes/api.js:31`（`normConj`）、判定 `src/routes/api.js:983-1003` + `public/js/pages/train.js:1136,1210,1284-1297`（`reconstructed.trim().toLowerCase() === targetWord.trim().toLowerCase()`） | 拼写判定 = **仅 trim + 小写**后完全相等（标点/拼写零容错）；掌握 = 累计正确到阈值；**无任何间隔复习**（`spaced/Leitner/SM-2/nextReview/ease` 全文 0 命中） | **Apache-2.0**（版权人未署名） | ⚠️ 判定口径可参考、阈值不可照搬 | 阈值改为 3–5 次（§八 建议）；判定仍以 Lexica 口径为主（支持多答案） |
| 学习流程（计数器推进） | Lexica | `LearningModeOperator.cs`：每轮随机化取**前 7 个**（`GetQuestions(randomizeEachIteration:true, pieceSize:7)`）、闭合题优先于开放题、同词不连续问（`IsQuestionRepeated`）、闭合题 4 选项（正确项不在选项中则随机替换一项） | 逐词多计数器 + 达标即退出 | MIT | ✅ 模式复用（简化） | MVP：单轮取 N 词、每题必答、答对 +1 答错归零、达到 `requiredCorrect` 出列（§七 MVP） |
| 单词详情展示 | OpenFlashcards + Lexica | OpenFlashcards `apps/web/src/features/study/components/CardBackDisplay.tsx`、`CardFrontDisplay.tsx`、`ScalableContent.tsx`、`StudyCardImage.tsx`；Lexica `Entry.Words` / `Entry.Translations` 多值数组 | 「正面只有词/图，背面才给音标+释义」的翻卡呈现 | MIT（两者） | ✅ 可复用（布局模式） | `WordDetailPage`：IPA + 词性徽章 + 中文释义 + 例句 + 发音按钮；沿用「先挑战后揭示」结构 |
| 音标（IPA） | **无可用来源** | OpenFlashcards `apps/web/src/features/cards/types/card.ts:12` 明确写 `phonetic?: string // Brazilian-readable phonetics (NOT IPA)` | 它的 fonetica 是葡语可读拼写，**不是 IPA** | — | ❌ 不可复用 | IPA 来自词典数据源（实测 freeDict `phonetic: "/ædˈvɛnt͡ʃɚ/"` 即 IPA）；缺 IPA 时留空**不猜** |
| 例句 | Free Dictionary API（实测） | 实测响应 `meanings[].definitions[].example`（如 `"A life full of adventures."`） | 并非每条 definition 都有 example；需要按 `partOfSpeech` 归并、去重、截断；**必须保留 `sourceUrls`（溯源到 Wiktionary 词条）** | ⚠️ 授权无法确认（服务层），须署名 | ⚠️ 数据可用、授权需 attribution | 服务端抓取 → 归一化 → 落 `WordExample`，**保留 `sourceUrl`**（可回溯词条） |
| 词性 / 释义 | Free Dictionary API（实测） | 实测响应 `meanings[].partOfSpeech`（`noun`/`verb`/…）、`definitions[].definition` | 在线响应声明源为 Wiktionary（`sourceUrls`），实为**英文**释义、多义项；其**仓库快照代码**的数据源是 Google 词典（两者不一致） | ⚠️ 授权无法确认（服务层），须署名 | ⚠️ 同上 | `WordDefinition{partOfSpeech, definitionEn}`；中文释义不在该 API（见报告 §八 建议） |
| 复习列表 / 会话状态机 | OpenFlashcards | `apps/web/src/features/study/hooks/useStudySession.ts`（16.5KB）、`useStudySession.test.ts`（13KB）、`components/ReviewRatingBar.tsx`、`StudySessionSummaryCard.tsx`、`StudyComboIndicator.tsx` | 会话状态 + 评分 + 结算统计，且**带测试** | MIT | ✅ 可复用（模式） | `useWordReviewSession.ts`（拉 due 列表 → 出题 → 评分 → 结算） |
| 学习进度 | OpenFlashcards | `apps/api/internal/cards/handler_stats.go`、`apps/internal/decks/handler_stats.go`、`sqlc` 的 `countUserCardsByState` / `deckStatsByUser`（new/learning/review 计数） | 按状态聚合计数 | MIT | ✅ 可复用（SQL 思路） | `GET /wordbook/stats`（新词/学习中/已掌握/今日已学/待复习）→ Prisma `groupBy` |
| 媒体所有权校验 | OpenFlashcards | `apps/api/internal/media/service.go`（`OwnerOfURL`、`CountCardsReferencingURL`、`http.DetectContentType` 字节嗅探、删除前引用检查） | 客户端提交的 URL 必须反解到本人媒体，否则 `MEDIA_NOT_FOUND` | MIT | ⚠️ 部分复用 | 借「引用检查 + 拥有者校验」两点；音频文件本身**不入我们的媒体库**（授权未确认，见 §二） |
| 批量导入 | OpenFlashcards | `apps/web/src/features/cards/importExport/utils/csvValidation.ts`、`hooks/useDeckCardsImport.ts` | CSV 列映射 + 校验 | MIT | ⚪ MVP 不做 | 若二期要「老师批量发词表」再回来读这两个文件 |

---

## 二、License / 商业使用结论（代码 ≠ 数据 ≠ 音频）

> **总原则（本项目既有纪律）**：代码 License 允许 ≠ 项目里的数据/音频允许。下表把三者分开。

| 资产 | 类型 | License / 授权状态 | 可商用 | 可修改/复制代码 | 需保留声明 | 我们的处理 |
|---|---|---|---|---|---|---|
| OpenFlashcards（HelioFernandes404） | 代码 | **MIT**（`LICENSE`，`Copyright (c) 2026 Helio Fernandes and contributors`） | ✅ | ✅ | ✅ 保留版权 + LICENSE 片段；在复用文件头写来源注释 | 复用其**模式**（TTS 接口/韧性、front-back 契约、配额守卫、双通道播放） |
| Lexica（lrydzkowski） | 代码 | **MIT**（`LICENSE`，`Copyright (c) 2021 Łukasz Rydzkowski`） | ✅ | ✅ | ✅ 同上 | **直接移植 `VerifyAnswer` 判定口径**（改 TS 纯函数 + 单测），文件头保留版权声明 |
| Liozon/OpenFlashcards | 代码 | **Apache-2.0**，但 LICENSE 内版权人是**未填模板**（`Copyright [yyyy] [name of copyright owner]`），无 NOTICE；上游 `alexbokos/open.flashcards` 同为 Apache-2.0（派生链一致） | ✅ | ✅ | ✅ 附 LICENSE 副本 + 署名（只能署项目名）+ 修改文件加"已修改"声明；**无商标授权** | 只借「服务端 TTS 磁盘缓存目录 + HIT/MISS」与少量纯函数；**不引入其间隔复习**（不存在） |
| OpenFlashcards 的 `fonetica` / 卡内容 | 用户数据 | 用户自建内容，仓库不含词库数据文件 | — | — | — | 不涉及 |
| Lexica 抓取的词典音频 | 音频 | **不是 MIT**：`README.md` §Technicalities 原文提示「It is up to a user which dictionary will be used. You have to keep in mind that while choosing any web dictionary you should take into consideration legal restrictions connected with copyright.」；代码默认 CSS 选择器指向剑桥词典结构，配置项却**留空**由用户自填 | ❌ 不可商用（未获授权） | — | — | **禁止移植**「抓商业词典 + 缓存 mp3」这条链路 |
| **发音音频 · 自托管白名单库（推荐 Primary）** | 音频 | Commons 只接纳允许**商用 + 再分发**的自由许可（政策原文硬条件：`Commercial use of the work must be allowed.` / `Republication and distribution must be allowed.`）；**逐文件**许可与作者不同（CC0/PD/CC BY/CC BY-SA 混用）；WMF 明确**不担保**授权正确性 | ✅（须满足该文件许可义务） | — | ✅ **必须**：原作者署名（不是上传者）+ 许可名称与链接 + 标明是否修改 | 见 §二「发音落地三原则」+ `docs/_research/audio-pronunciation-licensing.md`；**原样不改动**以避免 ShareAlike 改编义务 |
| Commons 直链（hotlink） | 音频 | Commons 官方口径原文：`Directly using a Commons file via embedding its URL ("hotlinking") is also possible, but is not recommended.` | ⚠️ | — | ✅ 同上 | 只作**应急补充**，不作唯一主链路 |
| freeDictionaryAPI 仓库本身 | 代码 | **自相矛盾**：`LICENSE` 是 **GPL-3.0 全文**，`package.json` 写 `"license":"ISC"` → **无法确认**；仓库快照的数据来源是 Google 词典回调 + `ssl.gstatic.com` 的 Oxford 音频（见 `_research/opensource-wordbook-liozon-freedict.md`） | ❌ 无法确认 | ❌ **不得并入本项目** | — | **代码一行都不复制**；只调用其公开 HTTP 接口（且不作唯一来源） |
| dictionaryapi.dev 服务 | 服务 | 第三方免费服务，仓库内**未见 SLA / 商用许可声明**；实测**在线响应**已带 Wiktionary/Commons 溯源与 `license` 字段（与其仓库快照的数据来源不一致）；实测**许可字段三种混用**，个别条目**无 license 字段** | ⚠️ **无法确认** | — | ⚠️ 须署名 | 服务端调用 + 超时 + 缓存 + **TTS 兜底**；不把它当唯一来源（实测覆盖率/可用性不足，见 §二「dictionaryapi.dev 实测」） |
| Piper（TTS fallback 1） | 代码 + 模型 | 归档版 `rhasspy/piper` = **MIT**（已 archived）；现行主线 `OHF-Voice/piper1-gpl` = **GPL-3.0**（根目录无 LICENSE 文件，靠 README 声明）；**voice 逐个授权**：`en_US-ljspeech-medium` 数据集 public domain ✅、`en_US-lessac-medium` Blizzard/Lessac 研究许可（原文排除 any commercial purpose）❌、`en_GB-alan-medium` 上游仅 `All Rights Reserved` ❌ | ⚠️ 仅干净 voice 可商用 | — | — | **Fallback-1**：只用可商用 voice；代码侧优先 MIT 归档版，GPL 主线需**进程隔离** + 法务确认；模型体积示例 `en_US-lessac-medium.onnx = 63,201,294 B`；**CPU 实时率本次未取得（无法确认）** |
| 云 TTS（Google / ElevenLabs / Azure） | 服务 | **「缓存到服务器 / 再分发音频」三家均无法确认**：Google（归档 2016 版 Service Specific Terms **无 TTS 小节**）、Azure（官方 FAQ 未涉及，仅有社区二手说法，且有**披露 AI 合成**义务）、ElevenLabs（ToS §1(c)：免费层 `may only use the Services for non-commercial purposes`） | ⚠️ 付费层倾向可商用、免费层禁商用 | — | — | **不作「缓存 + 再分发」方案**；若必须用：**只实时合成 + 不落盘**（Azure 须披露） |
| 浏览器 Web Speech API | 平台能力 | 接口清单仅 `speak/getVoices/pause/resume/cancel`，**无任何返回音频字节的方法** → **明确不可缓存**；caniuse 全球约 95.91%，**Android Browser / 旧 WebView / Opera Mini / UC 不支持**（与本项目移动端 WebView 直接相关） | ⚠️ 视平台 | — | — | **Fallback-2**：设备侧最后兜底，UI 标注「浏览器合成语音」；合成是否需联网**无法确认** |

### 发音落地三原则（写进开发规范）

1. **能"链"就优先"链"，但要"存"就必须走完整许可义务**：只把音频 URL 存进数据库是**引用**；下载到自己服务器是**再分发**。Commons 的文件在制度上允许再分发（只收允许商用的自由许可），所以**自托管是可选项**——前提是逐文件核对 + 署名 + 原样不改动。
2. **要"存"先逐文件核 License**：每个入库音频必须有 `author（原作者，不是上传者）/ license_name / license_url / source_page_url / 是否修改`；**WMF 明确不担保授权正确性**，所以核对责任在我们，必须留 `verified_by + fetched_at`。
3. **不改动音频文件**：裁剪/降噪/变速再发布可能触发 CC BY-SA 的 ShareAlike 改编义务；若必须修改，则该改编音频按同许可发布并标注修改。

### dictionaryapi.dev 实测（2026-10-06，本轮亲自复现 → 决定它能否当主来源）

| 请求 | 结果 |
|---|---|
| `/entries/en/adventure` | **200**：IPA `/ædˈvɛnt͡ʃɚ/`、`-us.mp3` + `-ca.mp3`、`sourceUrl` → Commons、`license BY-SA 3.0`、`sourceUrls` → Wiktionary |
| `/entries/en/beautiful` | **200**：IPA `/ˈbjuːtɪfəl/`、`-uk.mp3`（`BY 3.0 US`）+ `-us.mp3`（`BY-SA 3.0`） |
| `/entries/en/colour` | **200**：`phonetics` 里**只有 audio 没有 IPA 文本**、`-au.mp3`（`BY-SA 4.0`） |
| `/entries/en/apple`（重试 2 次） | **404** |
| `/entries/en/water` | **404** |
| `/entries/en/color`（美式拼写） | **404**（`colour` 反而 200 → 变体覆盖不全） |
| `/entries/en/honor`、`/entries/en/adventures` | **522**（Cloudflare 回源超时） |
| `/entries/en/xyzzyplugh`（不存在的词） | **522**（错误语义不一致：该 404 的返回 5xx） |

**结论**：它的**在线响应**确实带 Wiktionary/Commons 溯源与 License 字段，但①覆盖率与可用性不足以做主来源（常见词 404/522）；②其**开源仓库快照的数据来源是 Google 词典 + `ssl.gstatic.com`**，与在线响应不一致；③仓库许可 GPL-3.0 与 package.json 的 ISC 冲突。→ **降级为可选便利层**，Primary 走 Commons/Wiktionary 直连，见 `docs/wordbook-phase1-research.md` §3.3。

---

## 三、调研快照（可复现）

| 项目 | 快照 | LICENSE 原文版权行 |
|---|---|---|
| HelioFernandes404/openflashcards | `HEAD = cb94738225264bf18c3df1e0cc338aa814794b20` | `Copyright (c) 2026 Helio Fernandes and contributors` |
| lrydzkowski/Lexica | `HEAD = c1b7770154a8a2420783df6724ae8852f92a4fdb` | `Copyright (c) 2021 Łukasz Rydzkowski` |
| Liozon/OpenFlashcards | `HEAD`（根 `LICENSE` 11357B 全文） | **Apache-2.0**，但版权行是未填模板：`Copyright [yyyy] [name of copyright owner]`（**版权人姓名无法确认**）；上游 `alexbokos/open.flashcards` 同为 Apache-2.0 |
| meetDeveloper/freeDictionaryAPI | `HEAD`（`LICENSE` = GPL-3.0 全文；`package.json` = `"license":"ISC"`） | **自相矛盾 → 无法确认**，按最保守 GPL-3.0 处理 |
| open-spaced-repetition/ts-fsrs | GitHub API `license.spdx_id = MIT`（805 stars，`main`） | 见仓库 `LICENSE` |

> 开发阶段若实际读取与上表不一致，**更新本表并记录差异**（沿用 `docs/opensource-mapping.md` 的维护规则）。

---

## 四、未采用能力记录（禁止静默绕过）

| 来源能力 | 原用途 | 未采用 | 原因 | 替代 |
|---|---|---|---|---|
| OpenFlashcards `Deck` / `Module` / `KanbanCard` / `Letter` / `StudyPlan` / `PromptTemplate` | 卡组/模块/看板/歌词学习/学习计划/提示词模板 | ✅ 未采用 | 用户明确排除课程市场/社交/多客户端等；单词本只需「一个孩子的单词本」 | 单一 `UserWord` 列表 + 学科/来源标签 |
| OpenFlashcards `fonetica` 字段语义 | 音标 | ✅ 未采用 | 源码注释明确「NOT IPA」（`card.ts:12`） | `WordPronunciation{ipa, accent}` |
| OpenFlashcards Redis TTS 缓存 | 发音/TTS 缓存 | ⚠️ 未采用 Redis | ① 当前 `docker-compose.yml` **只有 postgres + api + web，无 Redis**，不新增基础设施；② 其 `TTS_CACHE_TTL=31536000`（一年）用于**云 TTS 输出**，而三家云 TTS 的「缓存/再分发」条款均**无法确认**（`docs/_research/audio-pronunciation-licensing.md` §3.6） | 自建 Piper 的 wav 落自有存储 + `tts_cache` 表；接口保持可换后端 |
| OpenFlashcards Excel/CSV 导入导出 | 批量建词 | ✅ MVP 未采用 | MVP 不需要 | 二期评估 |
| OpenFlashcards `fsrs/optimize/`（fsrs-rs 侧车） | 个人化 FSRS 权重训练 | ✅ 未采用 | 需要额外二进制/训练数据量，MVP 用默认权重 | 直接 `ts-fsrs` 默认参数；字段先留 `fsrsCardJson` 便于升级 |
| OpenFlashcards `media` 库（图片上传） | 卡片配图 | ⚠️ 部分未采用 | 我们错题本已有 `apps/api/src/files`；单词本 MVP 无配图需求 | 复用既有 files 模块（若二期要配图） |
| OpenFlashcards 整项目作为依赖 | — | ✅ 禁止 | 单体 Go+Vite 应用，无法作为库引入；整搬违反本项目纪律 | 只做源码级模式移植 + 保留声明 |
| Lexica Cambridge 式词典抓取 | 发音获取 | ✅ **禁止** | 无授权 + 违反目标站 ToS | 使用有明示授权的音频源（§三 调研结论） |
| Lexica `.NET/SQLite/NAudio` 运行时 | 播放与存储 | ✅ 未采用 | 技术栈不兼容（NestJS/React/Expo/Postgres） | 浏览器 `<audio>` + RN 播放器 + Prisma |
| Lexica `CurrentQuestionInfo` 可变单例 + `yield` 迭代器 | 出题推进 | ✅ 未采用（实现方式） | 源码地图 §2 已证：`yield` 后会话状态被覆盖，消费方必须"立即判定"，是易错设计 | 纯函数 + 显式传参（`verifySpelling(input, accepted)`、`buildSession(words, cfg)`） |
| wrong-notebook / huahuastudy | 单词本 | ✅ **禁止**（用户指示） | 老人项目只能作 UI/产品历史参考，**不能引入代码** | 单词本按本表独立实现 |

---

## 五、执行清单（开发阶段强制，沿用 `docs/opensource-mapping.md` 第三节流程）

1. 按 §一 的「源码文件」逐个打开核对（Go/C# 代码**只读**，不复制整文件）；
2. 每个移植点写测试：`verifySpelling`（大小写/多答案/空白/漏字母/多字母/连字符）、FSRS 调度（四档评分的间隔单调性）、配额并发（两个并发请求不能超发）；
3. 被复用文件头写来源注释块：
   ```
   // 来源：<repo>（<path>），MIT License
   // Copyright (c) <year> <author>
   // 本项目内适配说明：<简述>
   ```
4. 同步更新 `docs/THIRD_PARTY_NOTICES.md`：新增 **OpenFlashcards（MIT）**、**Lexica（MIT）**、**Liozon/OpenFlashcards（Apache-2.0，版权人未署名 → 只能署项目名 + 修改文件加"已修改"声明 + 附 LICENSE 副本 + 不得用其名称/图标作品牌）**；若引入 `ts-fsrs`/Piper 再追加；
5. 音频来源逐个登记 `file_name / sourcePageUrl / licenseName / licenseUrl / author（原作者，不是上传者）/ isModified / sha256 / verifiedBy / fetchedAt`，并渲染 `attributionText`（见 §二 三原则 + `docs/_research/audio-pronunciation-licensing.md` §4.4 模板）；
6. 模块完成后回填本表「我们的处理方式」列的实际落点文件。

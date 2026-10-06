# 单词本（Wordbook）第一阶段调研报告

> 阶段定位：**只做「调研 + 源码阅读 + License 核查 + 文档」**。不写业务代码、不改 Prisma schema、不改错题本/Task/Growth/Approval、不改现有页面、不新增 npm 依赖。
> 配套文档：
> - 源码级复用矩阵（主交付物）：`docs/opensource-wordbook-mapping.md`
> - 证据底稿：`docs/_research/openflashcards-source-map.md`、`docs/_research/lexica-source-map.md`、`docs/_research/opensource-wordbook-liozon-freedict.md`、`docs/_research/audio-pronunciation-licensing.md`
> - 既有规范：`docs/opensource-mapping.md`、`docs/THIRD_PARTY_NOTICES.md`
> 抓取方式：本机 `git clone` 不可用（`github.com:443` 经 `127.0.0.1:7897` 代理失败），全部源码经 `api.github.com` / `raw.githubusercontent.com` **只读**读取；外部接口结论来自**本轮实测**（时间戳见 §三）。

---

## 一、项目调研表（要不要抄、能抄多少）

| 项目 | 类型 / 技术栈 | 代码 License | 与本项目的匹配度 | 结论 |
|---|---|---|---|---|
| **HelioFernandes404/openflashcards** | Go(Gin+pgx+sqlc+PG) + React/TS 单体；自带 FSRS / TTS(Google·ElevenLabs·Piper) / Redis 缓存 / 媒体库 | **MIT**（`Copyright (c) 2026 Helio Fernandes and contributors`） | **能力高、结构低**：它的 TTS 抽象、front/back 契约、并发配额守卫、双通道播放正是我们要的；但它的数据模型是「通用翻卡（front=词 / back=译文 / fonetica 非 IPA）」，**没有词性/中文释义/例句实体**，也没有拼写练习 | ✅ 抄模式（4 类能力）+ ❌ 不抄数据结构 |
| **lrydzkowski/Lexica** | .NET 6 C# 控制台（Windows 专属）+ SQLite + NAudio；三种学习模式（Spelling / OnlyOpen / Full） | **MIT**（`Copyright (c) 2021 Łukasz Rydzkowski`） | **拼写判定口径 + 学习推进规则可以直接抄**（`VerifyAnswer` = 逗号切分→Trim→排序→忽略大小写整体比较）；发音链路是「抓第三方网页词典并缓存 mp3」，**代码 MIT 但音频不是**，作者本人在 README 里提示版权风险 | ✅ 抄拼写判定与推进规则；❌ 不抄发音抓取链路、不抄 .NET 运行时 |
| **Liozon/OpenFlashcards** | Node/Express + 前端 js；words/phrases 数据、TTS、闪卡训练 | **Apache-2.0**，但 **LICENSE 内版权人是未填模板**（`Copyright [yyyy] [name of copyright owner]`），无 NOTICE；上游 `alexbokos/open.flashcards` 同为 Apache-2.0，派生链一致 | 中：有「服务端 TTS 缓存（`data/{userId}/tts/{lang}/spd{pct}/{id}.mp3` + HIT/MISS）」与「掌握度计数（50–200 次正确）」值得借；**没有任何间隔复习算法**（`spaced/Leitner/SM-2/nextReview/ease` 全文 0 命中），README 声称的 TTS via Web Speech API 与代码不符 | ⚠️ 仅架构借鉴 + 少量纯函数移植；**版权人姓名无法确认**，署名只能署项目名 |
| **meetDeveloper/freeDictionaryAPI** | Node/Express 服务 + 前端；提供 `api.dictionaryapi.dev` | **仓库自相矛盾**：`LICENSE` 是 **GPL-3.0** 全文，`package.json` 写 `"license":"ISC"` → **无法确认**，按最保守当 GPL-3.0 处理 | 它只是**我们调用外部 HTTP 接口的第三方服务**，不是要并入的代码 | ✅ 只调用接口；❌ **代码一律不并入**（GPL 风险）；⚠️ 服务可靠性见 §三 |
| **Wiktionary / Wikimedia Commons** | 词条 + 真人发音音频 | 词条文本 **CC BY-SA 3.0/4.0**（逐页/逐文件不同）；音频**逐文件不同**（CC BY-SA 3.0/4.0、CC BY 3.0 US、CC0、PD 等混用） | 唯一有**明确、可核查**授权链的免费真人发音来源；**Commons 只接纳允许商用与再分发的自由许可** | ✅ 作为**真实录音**来源；推荐**自托管白名单**（需逐文件核对 + 署名 + 原样不改动）；hotlink 官方不推荐 |
| **open-spaced-repetition/ts-fsrs** | TypeScript 的 FSRS 官方实现 | **MIT**（GitHub API `license.spdx_id = MIT`） | 直接解决「间隔复习」——不要自己写算法 | ✅ 直接作为依赖引入（唯一需要新增的运行时依赖） |

---

## 二、License / 商业使用结论（代码 ≠ 数据 ≠ 音频）

### 2.1 逐项目结论

| 项目 | 允许商用 | 允许修改 | 允许复制代码 | 必须保留 | 第三方/数据额外风险 |
|---|---|---|---|---|---|
| HelioFernandes404/openflashcards（MIT） | ✅ | ✅ | ✅ | 版权声明 + LICENSE 副本 | 它**不含**词库/音频数据；Redis/Postgres/Google/ElevenLabs 是**服务**，各有自己的条款 |
| Lexica（MIT） | ✅ | ✅ | ✅ | 版权声明 + LICENSE 副本 | ⚠️ **它抓取的音频不受 MIT 覆盖**；README 明确提示版权风险 |
| Liozon/OpenFlashcards（Apache-2.0） | ✅ | ✅ | ✅（需保留 LICENSE、署名、修改声明、无商标授权） | LICENSE + NOTICE（无）+ 修改标注 | ⚠️ **版权人姓名未填**；代码中的 TTS 依赖 Google `translate_tts(client=tw-ob)` 与 Edge Read Aloud，**服务授权无法确认** |
| meetDeveloper/freeDictionaryAPI | ❌ 无法确认（GPL vs ISC 冲突） | — | ❌ 不并入 | — | 数据来源在仓库快照中是 Google 词典回调 + `ssl.gstatic.com` 的 Oxford 音频，**无任何再分发/商用依据**；`english.txt`（2.6MB）许可也未标 |
| Wiktionary 词条文本 | ⚠️ CC BY-SA 允许商用，但 **ShareAlike + 署名** | ✅ | ✅ | 署名 + License 链接 + 修改标注 | 逐页授权可能不同 |
| Wikimedia Commons 发音音频 | ⚠️ 同上（实测样本含 `BY-SA 3.0` / `BY-SA 4.0` / `BY 3.0 US`） | ✅ | ✅ | 署名 + License + 原文件链接 | **逐文件**授权不同，必须逐个读文件页 |
| ts-fsrs（MIT） | ✅ | ✅ | ✅ | 版权声明 | 无 |

### 2.2 三条铁律（写进开发规范）

1. **MIT/Apache 只覆盖代码**：OpenFlashcards/Lexica 是 MIT，但它们**用到/抓到的音频、词库、外部服务**各有独立授权，不能因为项目是 MIT 就假定数据可用。
2. **URL ≠ 文件**：把第三方 `audio` URL 存进我们数据库并让用户浏览器去取，是**引用**；下载到自己服务器再对外提供，是**再分发**，两者法律含义不同，必须分开决定。
3. **无法确认一律不做**：任何一处授权「查不到明确条款」，就当**不可用**，改走有明确条款的来源，并在 `docs/THIRD_PARTY_NOTICES.md` 记录。

---

## 三、发音方案对比（本阶段最高优先级）

### 3.1 「免费 / 开源 / 可商用 / 可缓存 / 可再分发」五件事分开看

| 来源 | 真人 or TTS | 免费 | 开源 | 可商用 | 可缓存到自建服务器 | 可重新分发（音频文件本体） | 需要 attribution | 实测/取证结论 |
|---|---|---|---|---|---|---|---|---|
| **Wikimedia Commons / Wiktionary 发音音频**（`upload.wikimedia.org`） | **真人录音为主**（Commons 上也存在合成音频，**无法逐文件确认**） | ✅ | ⚠️ 音频是自由许可**内容**，不是"开源代码" | ✅ **Commons 只接纳允许商用的许可**（政策硬条件 `Commercial use of the work must be allowed.`） | ✅（这正是自托管方案） | ✅（政策硬条件 `Republication and distribution must be allowed.`） | ✅ **必须**（原作者 + 许可名称与链接 + 标明是否修改）；CC0/PD 除外 | 制度层面「可商用/可缓存/可再分发」成立；**但必须逐文件核对**，且 **WMF 明确不担保授权正确性** |
| **Commons 音频 · 我们下载后自托管（推荐 Primary）** | 同上一行 | ✅ | — | ✅ | ✅ | ✅（本方案） | 同上一行，并在产品内提供来源/许可说明 | **原样不改动**（避免 ShareAlike 改编义务）；播放用自有 URL；**hotlink 官方"不推荐"** |
| **freeDictionaryAPI（api.dictionaryapi.dev）** | 真人（镜像 Commons 录音） | ✅ | ❌ 仓库 License 自相矛盾（GPL-3.0 vs ISC） | ❌ **无法确认**（仓库代码抓 Google/Oxford，与线上响应不一致） | ❌ 无依据 | ❌ 无依据 | 线上响应带 `sourceUrl` + `license` 字段（实测三种混用，个别条目无 license） | ⚠️ **不可作产品级依赖**，见 §3.2 |
| **Piper TTS**（归档版 `rhasspy/piper` = MIT；主线 `OHF-Voice/piper1-gpl` = GPL-3.0） | TTS（神经语音，本地推理） | ✅ | ⚠️ 代码分版本；**模型另行授权** | ⚠️ **仅干净 voice**：`en_US-ljspeech-medium`（LJSpeech public domain）✅；`en_US-lessac-medium`（Blizzard/Lessac 研究许可，原文排除 any commercial purpose）❌；`en_GB-alan-medium`（上游仅 `All Rights Reserved`）❌ | ✅ 自建可缓存（自己生成的音频） | ✅ 自己生成的可自由支配 | 视 voice 授权 | **Fallback-1**；`en_US-lessac-medium.onnx` 约 63,201,294 B；**官方 CPU 实时率本次未取得（无法确认）** |
| **Google Cloud TTS** | TTS | ❌ 付费（免费额度数值本次未取证） | ❌ | ⚠️ 倾向可商用（商业条款） | ❌ **无法确认**（归档 2016 版 Service Specific Terms 无 TTS 小节） | ❌ **无法确认** | — | OpenFlashcards 的默认方案（`en-US-Chirp3-HD-Algenib`，语速 0.8，TTL 一年）→ **不照抄** |
| **ElevenLabs** | TTS | ❌ 付费 | ❌ | ⚠️ **免费层明确禁商用**（ToS §1(c) `may only use the Services for non-commercial purposes`）；付费层可商用 | ❌ **无法确认**（仅明确 Output 可下载后站外使用） | ❌ **无法确认** | — | 不作缓存/再分发方案 |
| **Azure AI Speech** | TTS | ❌ 付费 | ❌ | ⚠️ 倾向可商用（原文未取得） | ❌ **无法确认**（官方 FAQ 未涉及） | ❌ **无法确认** | ✅ **有明确义务**：必须披露「AI 合成语音」 | 只可实时合成、不落盘 |
| **浏览器 Web Speech API**（`speechSynthesis`） | TTS（系统/云端混合） | ✅ | 平台能力 | ⚠️ 视平台/设备 | ❌ **接口无任何返回音频字节的方法 → 明确不可缓存** | ❌ | — | **Fallback-2**；caniuse 全球约 95.91%，但 **Android Browser / 旧 WebView / Opera Mini / UC 不支持**（本项目移动端 WebView 直接相关）；是否需联网**无法确认** |
| **Lexica 式「抓商业网页词典 + 缓存 mp3」** | 真人 | — | — | ❌ | ❌ | ❌ | — | **禁止**（无授权 + 违反目标站 ToS） |

### 3.2 freeDictionaryAPI 的实测可靠性（本轮亲自复现，2026-10-06）

| 请求 | 结果 |
|---|---|
| `GET /api/v2/entries/en/adventure` | **200**，含 IPA `/ædˈvɛnt͡ʃɚ/`、美音 `-us.mp3` + 加音 `-ca.mp3`、`sourceUrl` 指向 `commons.wikimedia.org`、`license{name:"BY-SA 3.0"}`、`sourceUrls:["https://en.wiktionary.org/wiki/adventure"]` |
| `GET /api/v2/entries/en/beautiful` | **200**，IPA `/ˈbjuːtɪfəl/`，`-uk.mp3`（license `BY 3.0 US`）+ `-us.mp3`（`BY-SA 3.0`），sourceUrls = Wiktionary |
| `GET /api/v2/entries/en/colour` | **200**（注意：`phonetic` 数组里**只有 audio、没有 IPA 文本**），`-au.mp3` license `BY-SA 4.0` |
| `GET /api/v2/entries/en/apple` | **404**（重试两次仍 404） |
| `GET /api/v2/entries/en/water` | **404** |
| `GET /api/v2/entries/en/color` | **404**（美式拼写缺词条；`colour` 反而 200） |
| `GET /api/v2/entries/en/honor` | **522**（Cloudflare 回源超时） |
| `GET /api/v2/entries/en/adventures` | **522** |
| `GET /api/v2/entries/en/xyzzyplugh`（乱码词） | **522**（不存在的词返回 5xx 而非 404） |

**结论（必须写进设计）**：
- 该服务的**在线响应**确实带 Wiktionary/Commons 溯源与 License 字段（与本轮实测一致）；
- 但其**开源仓库快照的代码**是从 Google 词典回调取释义、音频字段来自 `e.oxford_audio`（README 示例主机 `//ssl.gstatic.com`）→ **同一个 api.dictionaryapi.dev 域名，仓库代码与线上响应已经不一致**（两套数据都不可控、无法作为授权依据）；
- 仓库自身许可 **GPL-3.0（LICENSE 文件）vs ISC（package.json）冲突** → 代码**一行都不能并入**（专项报告 §2.1）；
- 覆盖率与可用性**不可依赖**：常见词 404、部分词 522、美式拼写缺词条、有的词条只有 audio 没有 IPA；
- 因此：**不把它作为 Primary**，更不作为唯一数据源；即使使用也必须「超时 + 缓存 + 每次都走 TTS/兜底」，且**只把它当便利索引**，权利依据始终回到 Commons 文件页。

### 3.3 明确回答：「如果我们现在开始开发，发音到底怎么解决？」

> **Primary（真实录音 · 建议自托管）**
> **建立一个「Commons 授权白名单音频库」：从 Commons/Wiktionary 的真人发音音频中**批量获取**（优先官方打包渠道 `kaikki.org` 的音频包，而不是逐词抓 Wikimedia，官方明确要求不要逐词抓），**逐文件核对 author + license**，**原样不改动**地存到我们自己对象存储（不改动 = 不触发 CC BY-SA 的 ShareAlike 改编义务），数据库记录：`file_name / source_page_url / license_name / license_url / author / attribution_text / sha256 / fetched_at / verified_by`；播放使用我们**自己的 URL**。
> - 美式/英式：按 `En-us-*` / `En-uk-*` 分别归入 `WordPronunciation.accent`；
> - IPA：同源取 `phonetic` 文本（**不是每条都有**，缺就留空，不猜）；
> - 授权：Commons **只接纳允许商用与再分发的自由许可**（CC0/PD/CC BY/CC BY-SA），因此「可商用 + 可缓存 + 可再分发」在制度层面成立；**义务**是逐文件署名 + 注明许可 + 标明是否修改，且 **WMF 明确不担保授权正确性**（所以必须我们自己核对）；
> - **Commons 直链（hotlink）只作应急补充**：官方原文「Directly using a Commons file via embedding its URL ("hotlinking") is also possible, but is not recommended.」——**不作唯一主链路**；
> - 若某文件页许可/作者读不清 → 该条不进白名单，直接走 Fallback。

> **Fallback-1（白名单里没有这个词的录音时）：服务端自建 Piper TTS**
> - **必须选授权干净的 voice**：`en_US-ljspeech-medium`（数据集 public domain）可用；**禁用 `en_US-lessac-medium`**（Blizzard/Lessac 研究许可，原文明确排除 any commercial purpose）与 **`en_GB-alan-medium`**（上游 `Copyright 2022 Mycroft AI / All Rights Reserved`）；
> - 代码侧优先锁定 **MIT 的归档版 `rhasspy/piper`**；现行主线 **`OHF-Voice/piper1-gpl` 是 GPL-3.0**，若要使用必须做**进程隔离边界**（独立服务、网络调用）并先做法务确认；
> - 生成的 wav 落我们自己的存储缓存（自己生成的内容自己可支配）。

> **Fallback-2（最末端 · 零成本兜底）：客户端 `speechSynthesis`**
> - 接口里**没有**任何返回音频字节的能力 → **明确不可缓存**；各端音色/可用性不一致（Android Browser / 旧 WebView / Opera Mini / UC **不支持**，与本项目移动端 WebView 直接相关）；UI 上标注「浏览器合成语音」。

> **明确排除（本轮已取证，不得使用）**
> - **freeDictionaryAPI 作音频来源**：仓库许可 GPL-3.0 vs ISC 冲突、线上响应与仓库代码数据源不一致 → 商用授权**无法确认**；实测覆盖率/可用性不足（§3.2）；
> - **云 TTS 作「缓存 + 再分发」方案**：Google / Azure / ElevenLabs 关于「缓存到服务器 / 再分发音频」的条款**均无法确认**（ElevenLabs 免费层还明确禁商用）→ 若一定要用，**只能「实时合成 + 不落盘」**，Azure 还须履行「AI 合成语音」披露义务；
> - **lessac / en_GB-alan 两个 Piper voice**；
> - **Lexica 式抓商业词典并缓存 mp3**（无授权 + 违反目标站 ToS）。
>
> **上线前必做**：① 在**可联网环境**复核 Wikimedia 现行 ToU 与每个音频的文件页 `author/license`（本环境无法直连 `*.wikimedia.org`，专项核查用的是归档证据，已标注抓取日期）；② `docs/THIRD_PARTY_NOTICES.md` 增加音频/词典条目；③ 前端「关于/致谢」页展示 `attribution_text` 与 License 链接。
>
> **尚未确认项（14 项）**：见 `docs/_research/audio-pronunciation-licensing.md` §五（含云 TTS 现行条款、Piper CPU 性能、是否有授权干净的 en_GB 可商用 voice、Web Speech 各端是否需联网等）。

---

## 四、哪些代码可以直接复用

> 详细到文件/函数的映射见 `docs/opensource-wordbook-mapping.md` §一。这里只列"抄什么、抄到哪"。

| # | 复用内容 | 来源（文件） | 落点（本项目） | 方式 |
|---|---|---|---|---|
| 1 | **拼写判定口径**：逗号切分 → Trim → 排序 → 忽略大小写整体比较；答错计数器归零；`OverridePreviousMistake` | Lexica `Lexica.Learning/LearningModeOperator.cs`（`VerifyAnswer`）、`Models/QuestionInfo.cs` | `packages/shared-types/src/wordbook.ts`（纯函数 `verifySpelling`）+ `apps/api/src/wordbook/wordbook.spelling.ts` | 算法移植（MIT，保留声明）+ 单测 |
| 2 | **学习推进规则**：随机化取 N 词、闭合题优先、同词不连问、达标记为完成 | Lexica `LearningModeOperator.cs` | `WordReviewService`（简化版） | 模式复用 |
| 3 | **TTS Provider 抽象 + 路由 + 缓存 key + 重试/熔断 + 限流** | OpenFlashcards `internal/shared/tts/{provider,router,tts,resilience}.go`、`config.go` | `apps/api/src/tts/`（新建模块，接口挂 `TtsProvider`） | 接口与韧性模式移植；缓存介质改为 Postgres/磁盘 |
| 4 | **front/back 契约（防剧透）+ 复习预览** | OpenFlashcards `cards/handler_content.go`（`getFront`/`getBack`）、`service_preview.go`、`types/card.ts` | `WordFrontDto` / `WordBackDto` / `ReviewPreviewDto` | 契约设计复用 |
| 5 | **FSRS 调度 + 每用户参数 + 四档评分** | OpenFlashcards `shared/fsrs/fsrs.go`（封装官方库） | `apps/api/src/wordbook/wordbook.scheduler.ts`，底层用 **`ts-fsrs`（MIT）** | 换语言、同算法 |
| 6 | **并发配额守卫**（事务内行锁 + 只读预判 + 冲突 409） | OpenFlashcards `cards/service_review.go` | 与既有 `apps/api/src/completion/completion.service.ts` 同款 Prisma 写法 | 模式复用（本项目已有先例） |
| 7 | **`was_new` 复习前状态字段** | OpenFlashcards `models.go` / `service_review.go` | `WordReviewRecord.wasNew` | 字段设计复用 |
| 8 | **音频双通道前端 Hook** | OpenFlashcards `useStudyCardAudio.ts`、`StudyAudioButton.tsx` | `apps/web/src/hooks/use-word-audio.ts` | 移植+适配（URL 优先 / TTS 兜底） |
| 9 | **会话状态机 + 结算卡 + 评分条** | OpenFlashcards `useStudySession.ts`、`ReviewRatingBar.tsx`、`StudySessionSummaryCard.tsx` | `useWordReviewSession.ts` + 组件 | 模式复用 |
| 10 | **学习进度聚合 SQL 思路** | OpenFlashcards `sqlc`（`countUserCardsByState` / `deckStatsByUser`） | `GET /wordbook/stats`（Prisma `groupBy`） | 思路复用 |
| 11 | **服务端 TTS 磁盘缓存目录约定** `data/{userId}/tts/{lang}/spd{pct}/{id}.mp3` + HIT/MISS | Liozon `src/utils/tts-cache.js` | 我们的 TTS 缓存目录结构 | 目录约定借鉴 |
| 12 | **掌握度计数（50–200 次正确）** | Liozon `src/routes/api.js:4-30`（`wordMaxProgress` / `phraseMaxProgress`） | 可作 `UserWord.requiredCorrect` 的默认档参考 | 数值参考（非强制） |

---

## 五、哪些必须 clean-room 重写

| 能力 | 为什么不能抄 | 我们要怎么做 |
|---|---|---|
| **单词数据模型**（Word / 词性 / 中文释义 / 例句 / IPA） | 三个开源项目的模型都不匹配：OpenFlashcards 是 `front/back/fonetica(非IPA)` 双字段卡；Lexica 是「词,词 ; 译,译」文本行；Liozon 是整 JSON 文件 | 自研建模（§八），字段语义只做概念映射 |
| **中文释义** | 三个项目全无中文；dictionaryapi.dev 只给英文（Wiktionary 派生） | 两段式：① 人工/家长手动填写（MVP 必须支持）；② 二期用**本项目现有 AI 模块**（`.env` 已配 `AI_BASE_URL=https://api.deepseek.com` / `AI_MODEL=deepseek-flash`，`apps/api/src/ai`）生成中文释义并**落库缓存**（同类词不重复调用）。AI 提词/自动解析**本阶段不做** |
| **词典聚合与归一化** | 三家实现都不做「多源合并 + 去重 + 词形还原 + 失败降级」 | 自研 `WordDictionaryService`：源适配器 + 超时 + 缓存 + 降级链（真实录音 → TTS → 客户端兜底），并把 `sourceUrl/license` 原样落库 |
| **音标（IPA）** | OpenFlashcards 明确非 IPA；Lexica 无音标 | 只从带 IPA 的源取，缺则留空；**不自己拼读音标** |
| **词形还原 / 词条匹配** | 实测美式拼写（`color`/`honor`）查不到，英式（`colour`）能查到 → 需要变体映射 | 自研变体表（美式↔英式）+ 大小写/连字符归一；搞不定就退回人工填写 |
| **拼写判定的产品规则** | Lexica 的判定是「整体字符串完全相等（忽略大小写）」，对小学生**过严**（标点/空格/大小写/英美拼写全部零容错） | clean-room 设计规则并**产品拍板**：归一化（去首尾空格、统一小写、去连字符/撇号差异、可选英美变体互为正确）+ 是否允许 1 个字母误差（建议 MVP：**不允许编辑距离容错**，但允许大小写/空白/变体差异；错因分类记录） |
| **复习调度**（间隔复习） | Liozon 完全没有；Lexica 只有计数器 | 自研 `UserWord` 状态 + **`ts-fsrs`（MIT）** 调度；不做 fsrs-rs 权重训练 |
| **错词记录（词级）** | Lexica 只记「题目答错」，无错词表 | 自研 `WordSpellingAttempt` + `UserWord.spellingErrorCount` |
| **UI / 页面** | 三个项目都不是我们的像素风格；且用户禁止引入旧项目代码 | 沿用本项目既有 Tailwind/像素 UI 与组件，**只借交互结构**（挑战→揭示→评分） |
| **服务端 TTS 提供方** | OpenFlashcards 的 Google/ElevenLabs 是它的账号与默认值；Piper 需要自建服务 | 自研 `TtsProvider` 实现 + 配置项；厂商可替换（含"不缓存"模式） |

---

## 六、推荐技术方案

```
Web(React) ──┐
Mobile(Expo)─┼─► NestJS API（apps/api）
             │      ├─ wordbook 模块：Word / UserWord / Review / Spelling
             │      ├─ wordbook.dictionary：外部词典聚合（超时+缓存+降级）
             │      ├─ wordbook.pronunciation：音频解析（Commons 直连 → 台账落库）
             │      ├─ tts 模块：Provider 抽象（云 TTS / 自建 Piper / 不缓存模式）
             │      └─ ai 模块（已存在）：仅用于「生成中文释义」的二期增强
             └─► PostgreSQL + Prisma（唯一持久层；不引入 Redis）
```

| 决策 | 内容 | 理由 |
|---|---|---|
| 算法依赖 | 新增 **`ts-fsrs`（MIT）** | 官方 TS 实现，避免自己写间隔复习算法；OpenFlashcards 用的就是同族官方库 |
| 发音 | **Primary = Commons 真人录音（hotlink + 台账）**；**Fallback = 服务端 TTS（缓存放我们自己磁盘/DB）** | §3.3 |
| 缓存 | **不引入 Redis**：用 `Word`/`WordPronunciation` 表 + `tts_cache` 表/磁盘文件 | 当前 `docker-compose.yml` 只有 postgres/api/web；OpenFlashcards 的 Redis 只是它自己的选择 |
| 数据来源 | 服务端聚合（**不在前端直连第三方**） | 规避 CORS、可做超时/缓存/降级/限流，且**第三方条款变化只影响服务端** |
| 中文释义 | MVP 人工填写，二期 AI 生成并落库 | 现有 AI 模块可用；用户明确「本阶段不做 AI 自动提词」 |
| 归属 | 沿用 `familyId` + `childId` + `createdBy` | 与错题本/Task 完全一致的隔离口径 |
| 自动加入单词本 | 只做**技术方案预留**（§九），不开发 | 用户明确本阶段不开发 |

---

## 七、推荐的 MVP 功能范围

用户列的 14 项，按「必须先有闭环 / 可延后」切分：

**MVP 必做（V1）**
1. 手动加入单词（含：单词、IPA、词性、中文释义、例句、发音）
2. 自动补全：输入单词 → 调词典聚合 → 回填 IPA / 词性 / 英文释义 / 例句 / **发音 URL**（中文释义可留空由家长填）
3. 单词列表 + 单词详情
4. 单词发音（Primary/Fallback 双通道）
5. 背单词（翻卡：正面词+发音 → 背面 IPA/词性/释义/例句）
6. **听音拼写**（`verifySpelling` + 音频）
7. **看中文写英文**（同一判定函数，方向相反）
8. 拼写错误记录（词级：错误次数、最后一次错误答案、最后一次时间）
9. 学习进度（新词 / 学习中 / 已掌握 / 今日已学 / 待复习）
10. 间隔复习（`ts-fsrs` 四档评分 + 到期列表）

**MVP 可省（V1.x 再补）**
- 自动加入单词本（从错题/Task 一键加入）→ 本阶段只出方案（§九）
- 多词本/学科分组、标签、批量导入 CSV
- 「听音辨词」的选择题形式（`听音 → 4 选 1`）→ 可复用 Liozon/OpenFlashcards 的选择题结构

**明确不做（沿用用户指示）**
社交 / 排行榜 / 课程市场 / 付费词库 / 多语言 / AI 聊天 / AI 作文 / 教师独立客户端 / 家长独立客户端 / RBAC / 通知中心；不设计 Teacher/Parent/Student 三套客户端。

---

## 八、数据库建议（**本阶段不改 schema**，只给建议）

按本项目既有约定（`gen_random_uuid()` + `@map` snake_case + `familyId` 隔离 + 软删 `deletedAt` + VARCHAR+应用层白名单），建议 **7 张表**，但**分两批上**：

### 8.1 建议的实体与关键字段

| 表 | 作用 | 关键字段（建议） | 来源依据 |
|---|---|---|---|
| `words` | 词条主表（**跨用户共享的词库缓存**） | `id, lemma(唯一), lemmaNorm, lang('en'), phoneticIpa, sourceId, sourceUrl, licenseName, licenseUrl, fetchedAt, createdAt, updatedAt` | 需要缓存词典结果；`sourceUrl/licenseName` 是 §二 三原则的落地 |
| `word_pronunciations` | 一个词的多个发音（**含完整授权台账**） | `id, wordId, accent('us'|'uk'|'au'), audioUrl（我们自托管用 selfHostedUrl；未自托管时存原 URL）, selfHostedUrl, storagePath, fileSha256, bytes, source('commons'|'tts_piper'|'tts_cloud'), sourcePageUrl, licenseName, licenseUrl, author, attributionText, isModified(false), isPrimary, verifiedBy, fetchedAt, createdAt` | 实测一条词条可同时有 `-us/-uk/-ca` 多条音频且**许可各不相同**（BY-SA 3.0 / BY-SA 4.0 / BY 3.0 US）→ 必须拆表；授权字段来自 `docs/_research/audio-pronunciation-licensing.md` §4 的建议列 |
| `word_definitions` | 词性 + 释义（中/英） | `id, wordId, partOfSpeech, definitionEn, definitionZh, sortOrder, sourceUrl` | 一个词多词性多义项；中文归此表 |
| `word_examples` | 例句 | `id, wordId, definitionId?, exampleEn, exampleZh, sourceUrl, sortOrder` | freeDict/Wiktionary 的 `definitions[].example` 并非每条都有 |
| `user_words` | 「这个孩子把这个词加进了单词本」+ 学习状态（**FSRS 状态放这里**） | `id, familyId, childId, wordId, createdBy, source('manual'|'wrong_question'|'task'), sourceRefId, state('new'|'learning'|'review'|'relearning'), dueAt, lastReviewAt, reps, lapses, stability, difficulty, fsrsCardJson, requiredCorrect, correctCount, spellingErrorCount, masteredAt, deletedAt, createdAt, updatedAt`，`@@unique([childId, wordId])` | OpenFlashcards `Card`（FSRS 列 + `state` + `was_new` 思路）+ Lexica 计数器（`requiredCorrect`/`correctCount`） |
| `word_review_records` | 每次复习留痕 | `id, familyId, childId, userWordId, mode('flashcard'|'listen_spell'|'zh_to_en'), rating(1..4), answerText, isCorrect, wasNew, scheduledDays, elapsedDays, durationMs, reviewedAt` | OpenFlashcards `reviews` 表（含 `was_new`、`scheduled_days`、`elapsed_days`）+ Lexica `answer` 表（`question/answer/proper_answers/is_correct`） |
| `word_spelling_attempts` | 拼写错误明细（错词记录的本体） | `id, familyId, childId, userWordId, input, expected, normalizedInput, normalizedExpected, isCorrect, errorKind('missing_letter'|'extra_letter'|'wrong_order'|'case'|'variant'|'unknown'), createdAt` | Lexica 只记「答错」，**词级错因分类是我们 clean-room 增加的价值** |

> **是否真的需要 7 张表？** 如果 MVP 想更小：`word_examples` 可以先并入 `word_definitions.exampleEn/exampleZh`；`word_spelling_attempts` 可以先只保留 `user_words.spellingErrorCount + lastWrongInput`。**建议先上 5 张**（`words`、`word_pronunciations`、`word_definitions`、`user_words`、`word_review_records`），把例句列挂到 definitions 上；等真正需要"错因分析"再拆 `word_spelling_attempts`。
> **不要**因为看到 `WordPronunciation` 这种名字就立刻建表——它是因为**实测一个词有多条音频且授权不同**才被论证出来的，不是为了对称好看。

### 8.2 需要产品拍板的 4 个点
1. 词库是**全局共享**（`words` 无 familyId，任何孩子查过的词都进公共池）还是**每个家庭隔离**？建议全局共享 + 只缓存公共词典数据，**用户输入的中文释义按家庭/孩子隔离**（否则会串味）。
2. `requiredCorrect`（几次算掌握）默认值：参考 Liozon 的 50–200 次太极端，建议 **3–5 次**（配合 FSRS）。
3. 是否允许「家长修改词典自动抓取的中文释义」→ 需要 `definitionZhSource('ai'|'manual'|'dictionary')`。
4. 音频自托管策略：**是否自托管**（推荐，但要逐文件核对 + 署名 + 原样不改动）、白名单库的容量上限与淘汰规则、以及是否需要"定期校验失效音频"的后台任务（若走 hotlink 则必须校验；自托管则改为校验我们自己存储的 `sha256`）。

---

## 九、「自动加入单词本」技术方案（本阶段只调研、不开发）

目标场景（用户描述）：孩子完成英语任务/错题时点「加入单词本」→ 系统自动查询单词/IPA/音频/释义/词性/例句并保存。

**技术链路（预留接口，不实现）**：
```
[错题/任务页面] --点击「加入单词本」--> POST /wordbook/words:fromText { text, source:'wrong_question', sourceRefId }
   → 服务端：文本清洗（去标点/取词形）→ 查 words 表命中？
        ├ 命中 → 直接建 user_words（幂等：@@unique([childId, wordId])）
        └ 未命中 → WordDictionaryService.resolve(lemma)
              ├ 词典聚合（英文释义/词性/例句/IPA）  ← Primary
              ├ WordPronunciationResolver（Commons 录音）← Primary 发音
              └ 失败/缺失 → 标记 needsTts=true，前端播放时走 TTS Fallback
          → 事务写 words + word_pronunciations + word_definitions(+examples) + user_words
          → 返回 WordDetailDto（含 needsManualZh 标记，提示家长补中文释义）
```
**关键设计点**：
- **幂等**：同一个孩子同一个词只允许一条 `user_words`（唯一约束），重复点击返回既有记录；
- **不阻塞**：外部词典/TTS 超时不得让「加入单词本」失败——先落 `words(lemma)` + `user_words`，其余字段标 `pending` 异步补；
- **来源可溯**：`user_words.source + sourceRefId`（错题 id / 任务 id），便于「这个词是从哪道错题来的」；
- **不做 AI 自动提词**（用户明确）：从文本里抽单词的第一步若要多词识别，MVP 由用户手动选词/输入。

---

## 十、API 建议

沿用本项目既有风格（`/api/...`、JWT、`familyId` 隔离、错误体统一）。建议：

### 10.1 单词与词库

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/wordbook/words/lookup?q=adventure` | **查词预览（不落库）**：返回 IPA / 词性 / 英文释义 / 例句 / `pronunciations[]`（含 `audioUrl/accent/license/attribution`）/ `needsManualZh`；前端用它做「加入前预览」 |
| POST | `/wordbook/words` | 手动新增（可直接传中文释义/自定义字段），幂等返回既有词条 |
| POST | `/wordbook/words:fromText` | 「加入单词本」入口（§九），带 `source/sourceRefId`，幂等 |
| GET | `/wordbook/words/:id` | 词详情（`WordDetailDto`） |
| PATCH | `/wordbook/words/:id` | 修改（含家长补中文释义）——**只允许改本家庭/孩子可见部分** |
| GET | `/wordbook/my-words` | 我的单词本列表（分页/筛选：state、source、有无拼写错误、备考标签） |
| DELETE | `/wordbook/my-words/:userWordId` | 从我的单词本移除（软删 `deletedAt`） |
| GET | `/wordbook/stats` | 学习进度聚合（新词/学习中/已掌握/今日已学/待复习） |

### 10.2 发音

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/wordbook/words/:id/audio?accent=us` | **我们自己的发音入口**：① 有授权录音 → 302 到音频 URL（或返回 `{url, attribution}`）；② 无 → 走 TTS 返回音频流；③ 全失败 → `{fallback:'client_speech_synthesis'}` 让前端用 `speechSynthesis` |
| GET | `/wordbook/audio/:pronunciationId` | 单条发音的元数据 + 播放地址（含 attribution，供 UI 显示「来源」） |
| **限流** | — | 触发 TTS 的端点必须按用户限流（借鉴 OpenFlashcards `synthesizeMiddleware` 注释：付费调用不可无界） |

### 10.3 复习与拼写

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/wordbook/review/due?limit=` | 到期列表（**front 面，无剧透**） |
| GET | `/wordbook/review/:userWordId/preview` | 四档评分各自的下次间隔（借鉴 OpenFlashcards `GET /cards/:id/preview`） |
| POST | `/wordbook/review/:userWordId` | 提交评分 `{rating:1..4, mode, durationMs}`；服务端 `ts-fsrs` 调度，返回新 state/due |
| GET | `/wordbook/spelling/session?size=10` | 生成听音拼写题（**只返回 audioUrl + userWordId，不含答案**） |
| POST | `/wordbook/spelling/:userWordId/answer` | 提交拼写 `{input}` → 返回 `{isCorrect, normalized, correctAnswer, errorKind, nextDue}`；判定用共享纯函数 `verifySpelling`（前后端同源，防漂移） |
| GET | `/wordbook/spelling/mistakes` | 错词列表（按 `spellingErrorCount` 排序） |

### 10.4 契约设计要点（来自 OpenFlashcards 的可复用经验）
1. **front/back 分离**：列表/题目接口**绝不返回答案字段**；
2. **判定函数放 `packages/shared-types`**（前后端同一份 `verifySpelling`），避免"前端判对、后端判错"；
3. **发音响应带 attribution 字段**（`licenseName/licenseUrl/sourceUrl`），前端可点开「关于这个发音」；
4. **幂等键**：`(childId, wordId)` 唯一；复习提交带 `userWordId` + 客户端请求 id 防重复计分。

---

## 十一、本阶段的边界与遗留

**已完成**：开源项目源码级调研（4 个仓库 + ts-fsrs）、License 核查、发音方案对比与实测、复用矩阵、数据库/API 建议、文档落盘。

**未做（明确留白）**：
- 未改 `apps/api/prisma/schema.prisma`（未新增任何 model/迁移）；
- 未改错题本 / Task / Growth / Approval / 任何现有页面；
- 未新增单词本业务代码、未安装任何 npm 包；
- 未实现 AI 自动提词（用户明确排除）；
- **未下载任何第三方音频**——方案里包含「自托管白名单音频库」，但**必须先在可联网环境逐文件核对 author/license 后**才能执行（本环境无法直连 `*.wikimedia.org`，专项核查用的是归档证据，已标注抓取日期）。

**待用户确认后才能进入开发的问题**：
1. 发音 Primary/Fallback 是否按 §3.3 定案（关键选择：**自托管「Commons 授权白名单音频库」**（推荐，可商用/可缓存/可再分发，但需逐文件核对 + 署名 + 原样不改动）还是**仅 hotlink Commons 直链**（Commons 官方不推荐作主链路））；
2. 词库是全局共享还是家庭隔离（§八 拍板点 1）；
3. `requiredCorrect`（几次算掌握）与拼写判定容错度（是否允许大小写/空白/英美变体之外的差异）；
4. 中文释义来源：MVP 纯人工，还是允许接入现有 AI 模块生成（AI 已配置可用）；
5. 自建 Piper 作为 Fallback-1 是否现在就引入（代码侧要用 MIT 归档版还是接受 GPL-3.0 主线的进程隔离方案）。

# 单词本调研 · 开源源码级侦察：Liozon/OpenFlashcards + meetDeveloper/freeDictionaryAPI

> 供 `docs/opensource-wordbook-mapping.md` 引用。所有结论均附证据 URL + 原文引用；无法确认的项一律写「无法确认」，不写「应该可以」。

## 0. 证据口径与方法（先读，关系到行号可信度）

| 项 | 值 |
|---|---|
| 抓取方式 | 仅 `web_fetch`（`raw.githubusercontent.com` / `api.github.com` / `registry.npmjs.org`）。**未 git clone**、**未安装依赖**、未写入除本文件外的任何文件。 |
| Liozon/OpenFlashcards 快照 | `HEAD` = `5082cff24334658d139a7304f8a5c3d39adebe2e`（`https://api.github.com/repos/Liozon/OpenFlashcards/git/trees/HEAD?recursive=1`，`"truncated":false` → 文件清单完整） |
| freeDictionaryAPI 快照 | `HEAD` = `4f274a853dd7a352aa2a349d1b92624ff18a36a8`（同上 API，`"truncated":false`） |
| 本机直连状态 | `pwsh` 直连失败：`Invoke-WebRequest https://raw.githubusercontent.com/...` → `基础连接已经关闭: 接收时发生错误`；`HTTP_PROXY/HTTPS_PROXY/ALL_PROXY` 均为空 → 确认只能用 `web_fetch`。 |

**行号来源与校准（重要）**：`raw` 抓取本身不带行号。两个大文件（`src/routes/api.js`、`public/js/pages/train.js`）的抓取结果被 harness 落盘到临时副本，副本带行号，但**副本前 4 行是 harness 头部**（`Fetched … (HTTP 200)` / 空行 / `External web content follows…` / 空行）。

校准证据：副本第 5 行 = `'use strict';` = `api.js` 真实第 1 行；副本字节数 79507 / 83177，对应 GitHub blob 大小 79331 / 82994（差值来自非 ASCII 字符重编码，不是增删行，且两个文件行数 1920 / 1855 均无 CRLF）。
→ 因此本文中 `api.js` 与 `train.js` 的**真实行号 = 副本行号 − 4**，已逐条换算并交叉锚定到函数名。
其余文件（`tts-cache.js`、`tts-generate.js`、`tts.js`、`dictionary.js`、`app.js`、`utils.js`、`errors.js`、`package.json`、`LICENSE`）未落盘，**行号未获取** → 只给「文件 + 函数/符号 + 原文片段」，不给猜测行号。

---

# 一、Liozon/OpenFlashcards

- 仓库：<https://github.com/Liozon/OpenFlashcards>
- 证据树：<https://api.github.com/repos/Liozon/OpenFlashcards/git/trees/HEAD?recursive=1>

## 1.1 License 结论

**结论：Apache License 2.0（许可证类型可确认）；但版权人无法确认（LICENSE 内无任何署名）。可商用（Apache-2.0 无任何非商业限制）。**

证据 1 —— 根 `LICENSE` 文件存在（11357 字节），全文为 Apache-2.0 标准文本：

> `https://raw.githubusercontent.com/Liozon/OpenFlashcards/HEAD/LICENSE`
> `                                 Apache License` / `                           Version 2.0, January 2004`

证据 2 —— **附录仍是未填写的模板占位符**（原文引用，即"版权行"位置的内容）：

```
   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  ...

   Copyright [yyyy] [name of copyright owner]
```

→ 全文**没有**出现作者名/年份/机构名。因此"版权行原文"= 上述占位符本身；**版权人姓名：无法确认**。

证据 3 —— 商用授权原文（Apache-2.0 §2）：

```
   2. Grant of Copyright License. ... each Contributor hereby grants to You a
      perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of, publicly
      display, publicly perform, sublicense, and distribute the Work and such
      Derivative Works in Source or Object form.
```

证据 4 —— 仓库根**没有 NOTICE 文件**（文件清单完整，根目录仅 `.dockerignore`/`.env.example`/`.gitignore`/`Dockerfile`/`EXAM_MODE_PLAN.md`/`LICENSE`/`README.md`/`build-and-export.sh`/`images/`/`package-lock.json`/`package.json`/`public/`/`scripts/`/`src/`）→ Apache-2.0 §4(d) 的 NOTICE 传递义务不触发。

证据 5 —— `package.json` **没有 `license` 字段**（原文见 §1.7），与 LICENSE 文件不冲突（以文件为准），但属仓库自身元数据不完整。

证据 6 —— 派生链已核实：README 末尾原文

> `This project is based on the work of [Alex Bokos](https://github.com/alexbokos) with [open.flashcards](https://github.com/alexbokos/open.flashcards)`

GitHub API 对上游的 License 判定：`"license":{"key":"apache-2.0","name":"Apache License 2.0","spdx_id":"Apache-2.0"}`，`"language":"Java"`，`"pushed_at":"2018-06-30T13:07:42Z"`（<https://api.github.com/repos/alexbokos/open.flashcards>）→ 上游 Apache-2.0 → 下游 Apache-2.0，**链条一致，无冲突**。

**合规义务（若复用，写进 `docs/THIRD_PARTY_NOTICES.md`）**：① 随分发附 Apache-2.0 LICENSE 副本；② 保留版权/署名声明（此处只能署仓库与上游项目名，因版权人姓名缺失）；③ 对修改过的文件加"已修改"显著声明（§4(b) 原文 `You must cause any modified files to carry prominent notices stating that You changed the files`）。
**注意**：Apache-2.0 §6 明确**不授予商标权**（原文 `This License does not grant permission to use the trade names, trademarks, service marks, or product names of the Licensor`）→ 不得使用 "OpenFlashcards" 名称/图标作为本项目品牌。

## 1.2 README 声明的技术栈与功能

证据：`https://raw.githubusercontent.com/Liozon/OpenFlashcards/HEAD/README.md`

功能原文（逐条）：

- `* Focus on what matters: your vocabulary, words and phrases`
- `* **Word practice** practice words based on your word bank`
- `* **Phrases** practice phrase reconstruction`
- `* **Words writing** write words letter by letter, with TTS audio (easy mode) or without it (hard mode)`
- `* **Optional "Definition" field** on every word, to add context or a use case for the word`
- `* **Mixed practice** using filters and word types`
- `* **Text-to-speech** via Web Speech API` ← **与代码不符，见 §1.4**
- `* **Data stored in local JSON files** no database required and easy backup`
- `* **Single Docker container** all in one solution`

数据落盘结构原文：

```txt
config/
  users.json                             ← All users (bcrypt-hashed passwords)
data/
  {userId}/
    config.json                          ← User prefs (languages, dark mode…)
    Words_{userId}_{langCode}.json       ← Word bank for this language
    Sentences_{userId}_{langCode}.json   ← Phrase bank for this language
```

技术栈（由文件清单与依赖实测）：Node.js + Express 5（`src/server.js`、`src/routes/*.js`）+ **无框架、无构建的静态前端**（`public/js/app.js` hash 路由 + `public/js/pages/*.js` 原生 DOM）+ PWA/离线（`public/sw.js`、`public/service-worker.js`、`public/js/offline-db.js`、`public/js/offline.js`）+ Docker（`Dockerfile`、`build-and-export.sh`）。
另有设计文档 `EXAM_MODE_PLAN.md`（考试模式实施计划），其中记录了 `public/js/pages/train.js` 的既有能力名：`renderWordQuiz` / `renderPhraseQuiz` / `renderWritingQuiz`，以及"Writing (letter-bank spelling)"（字母库拼写，非自由输入）——与我读到的代码一致（§1.5）。

## 1.3 数据模型（读代码，非 README）

**word 对象**（`src/routes/api.js` `POST /api/words`，真实行 **702–736**）：

```js
// POST /api/words
router.post('/words', (req, res) => {
  const { lang, type, literal, translation, definition, article, infinitive, conjugation, declensions, verbGroup, labels, verbConjugationTranslation } = req.body;
  if (!lang || !type || !literal || !translation)
    return res.status(400).json({ error: 'lang, type, literal, translation required.' });
  if (!TYPES.includes(type))
    return res.status(400).json({ error: `type must be one of: ${TYPES.join(', ')}` });

  const words = getWords(userId(req), lang);
  if (words.find(w => w.id === literal))          // ← 注意：按 literal 判重（不是按 id）
    return res.status(409).json({ error: 'Word already exists.' });

  const word = {
    id: randomUUID(),
    type,
    literal: literal.trim(),
    translation: translation.trim(),
    definition: definition ? definition.trim() : '',
    langCode: lang,
    progress: 0,
    maxProgress: wordMaxProgress(literal, infinitive),
    createdAt: new Date().toISOString()
  };
  if (type === 'noun') word.article = article ? article.trim() : '';
  if (type === 'verb') {
    word.conjugation = conjugation || {};
    if (verbGroup !== undefined) word.verbGroup = verbGroup;
  }
  if (declensions !== undefined) word.declensions = declensions;
  if (labels !== undefined) word.labels = labels;
  if (verbConjugationTranslation !== undefined) word.verbConjugationTranslation = verbConjugationTranslation;
```

字段列表（word）：`id` / `type` / `literal` / `translation` / `definition` / `langCode` / `progress` / `maxProgress` / `createdAt`，条件字段 `article`(noun) / `conjugation`+`verbGroup`+`infinitive`(verb) / `declensions` / `labels` / `verbConjugationTranslation`；另有 `updatedAt`（PUT 时写）、`helpNote`、`text`、`notebookLinks`（见下述白名单与链接逻辑）。

类型枚举（真实行 **144**）：

```js
const TYPES = ['noun', 'verb', 'adjective', 'adverb', 'other', 'phrase'];
```

PUT 可更新字段白名单（真实行 **747**）：

```js
  ['type', 'translation', 'definition', 'article', 'infinitive', 'conjugation', 'declensions', 'verbGroup', 'literal', 'labels', 'verbConjugationTranslation', 'progress', 'maxProgress', 'text', 'helpNote'].forEach(k => {
    if (req.body[k] !== undefined) w[k] = req.body[k];
  });
```

**phrase 对象**（`src/routes/api.js` `POST /api/phrases`，真实行 **835–857**）：

```js
  const phrase = {
    id: randomUUID(),
    type: type || 'phrase',
    langCode: lang,
    text: text.trim(),
    translation: translation.trim(),
    helpNote: helpNote ? helpNote.trim() : '',
    labels: labels || [],
    progress: 0,
    maxProgress: phraseMaxProgress(text),
    createdAt: new Date().toISOString()
  };
```

→ phrase 字段：`id/type/langCode/text/translation/helpNote/labels/progress/maxProgress/createdAt`（**没有 definition、没有 article**）。

**学习状态字段（关键）**：只有整型 `progress` 与 `maxProgress`，**没有** `lastSeen`/`nextReview`/`dueAt`/`interval`/`ease`/`timesCorrect`/`timesWrong`（负向证据见 §1.6）。

**掌握度阈值 = 纯函数**（`src/routes/api.js` 真实行 **4–30**），原文：

```js
function wordMaxProgress(literal, infinitive) {
  const minProgressValue = 50;
  const maxProgressValue = 200;
  const coefficient = 5; // Increase to make longer words/phrases harder; decrease to flatten the curve
  const str = (infinitive && infinitive.trim()) ? infinitive.trim() : (literal || '');
  const n = str.length;
  return Math.max(minProgressValue, Math.min(maxProgressValue, Math.round(minProgressValue + Math.sqrt(n) * coefficient)));
}

function phraseMaxProgress(text) {
  const minProgressValue = 50;
  const maxProgressValue = 200;
  const wordCountCoefficient = 10;
  const lengthCoefficient = 8;
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const avgWordLength = wordCount > 0 ? words.reduce((sum, word) => sum + word.length, 0) / wordCount : 0;
  const score = minProgressValue + wordCount * wordCountCoefficient + avgWordLength * lengthCoefficient;
  return Math.max(minProgressValue, Math.min(maxProgressValue, Math.round(score)));
}
```

→ 即"一个词要答对 50–200 次算掌握"，随词长/短语词数递增。统计口径（真实行 **1096–1103**）：`mastered = words.filter(w => (w.progress||0) >= (w.maxProgress || wordMaxProgress(...)))`。

**动词变位结构**（两层，时态 → 人称 → 条目），归一化函数 `normConj` 在仓库内被复制了三份（`src/routes/api.js` 真实行 **31**、`src/utils/tts-generate.js`、`public/js/pages/train.js` 第 1–6 行），原文：

```js
// Normalize a conjugation entry: string → {form, translation}
function normConj(entry) {
  if (!entry) return { form: '', translation: '' };
  if (typeof entry === 'string') return { form: entry, translation: '' };
  return { form: entry.form || '', translation: entry.translation || '' };
}
```

变位参与出题（`buildQuizQuestion`，真实行 **56**）：`conjWithTranslation.length > 0 && Math.random() < 0.30` → 30% 概率用"人称+变位形式"出题（`quizPronoun` / `quizTenseIdx` 随题目下发）。

## 1.4 TTS：**不是 Web Speech API**（README 与代码不符）

**实际方案 = 服务端代理 + 第三方非官方 TTS + 服务端磁盘缓存 + 客户端 IndexedDB 兜底 + Web Speech 仅作最终 fallback。**

证据 A —— `src/utils/tts-generate.js` `bufferTTS(text, langCode, speed)` 原文（首选 **Google 翻译的未公开 TTS 端点**）：

```js
async function bufferTTS(text, langCode, speed) {
  const lc = langCode.toLowerCase();

  if (speed <= 1.0) {
    try {
      const sp  = speed !== 1.0 ? '&ttsspeed=' + speed.toFixed(2) : '';
      const url = 'https://translate.google.com/translate_tts?ie=UTF-8&tl=' +
        encodeURIComponent(lc) + '&q=' + encodeURIComponent(text) +
        '&client=tw-ob' + sp;
      return await new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => {
```

同一函数在 `speed > 1.0` 或 Google 失败时回落到 **msedge-tts**（`src/routes/api.js` 真实行 **377** 起的同名 `bufferTTS`，注释原文 `Tries Google first for speed ≤ 1.0, falls back to Edge TTS on failure.`）。

证据 B —— 路由与缓存（`src/routes/api.js`）：`GET /api/tts` 真实行 **427**，`GET /api/tts/cache` **486**，`DELETE /api/tts/cache/item` **493**，`DELETE /api/tts/cache` **505**，`POST /api/tts/generate`（SSE 批量预生成）**542**。缓存命中分支原文：

```js
    const cached = getCached(uid, lang, numSpeed, itemId);
    if (cached) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.setHeader('X-TTS-Cache', 'HIT');
      return require('fs').createReadStream(cached).pipe(res);
    }
```

证据 C —— 磁盘缓存布局（`src/utils/tts-cache.js`，文件头注释原文）：

```js
// tts-cache.js  –  Disk cache for TTS audio files
// Layout: data/{userId}/tts/{langCode}/{speedKey}/{itemId}.mp3
//   speedKey = "n{speed_as_int_pct}" e.g. "n100" for 1.0x, "n24" for 0.24x
//   itemId   = word/phrase UUID passed by the client (or a hash of the text)
```

⚠️ **同一文件内注释与代码不一致（以代码为准）**：

```js
function ttsDir(userId, langCode, speed) {
  const speedKey = 'spd' + Math.round(speed * 100);   // ← 实际是 "spd100"，不是注释里的 "n100"
  return path.join(DATA_DIR, userId, 'tts', langCode, speedKey);
}
```

无 UUID 时的 key 回退（`textHash`，原文）：`crypto.createHash('sha1').update(text).digest('hex').slice(0, 16)`。
可复用 API 面：`getCached / saveCachedBuffer / pipeToCache / purgeCache / cacheStats / deleteItem / deleteItemAllSpeeds`（`module.exports` 原文）。

证据 D —— 客户端（`public/js/tts.js`）：主链路是 `fetch('/api/tts?...&id=')` + `<audio>`；Web Speech 只是播放失败回调：

```js
    const url = TTS._url(text, lang, 'normal', itemId);
    return TTS._play(url, () => TTS._webSpeech(text, lang, false));
```

```js
  // Fallback Web Speech API
  _webSpeech: function (text, langCode, slow) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
```

离线时先查 IndexedDB（原文 `const buf = await OfflineDB.getTTS(lang, speed, id);`）；iOS 必须 `TTS.unlock()`（用户手势内 AudioContext + 静音 mp3）才允许程序化播放。

证据 E —— 依赖 `msedge-tts` 的 License 与性质（npm registry）：

> `https://registry.npmjs.org/msedge-tts/latest`
> `"license":"MIT"`，`"author":{"name":"Migushthe2nd"}`，`"description":"An Azure Speech Service module that uses the Microsoft Edge Read Aloud API."`

→ **npm 包本身是 MIT；但它调用的 Microsoft Edge Read Aloud 在线服务，其商用/缓存/再分发条款不在该仓库范围内 → 无法确认**（MIT 只覆盖代码）。

**对本项目的判断**：该 TTS 方案（a）依赖两个非公开/未授权端点（`translate_tts?client=tw-ob`、Edge Read Aloud），（b）服务器落盘 mp3，（c）仓库内**没有任何**关于这两个服务授权边界的说明 → **只可借鉴架构（服务端代理 + 磁盘缓存 + X-TTS-Cache 命中头 + 客户端 IndexedDB 兜底 + 语音合成兜底），音频来源必须由音频授权调研（task-1）决定，不可照搬其数据源。**

## 1.5 words writing / 拼写练习：存在；判定逻辑逐条拆解

**位置**：`public/js/pages/train.js`（模式按钮 `id="modeWriting"` → `setTrainMode('writing')`；题目渲染 `renderWritingQuiz(q)` 真实行 **1136**；字母库 `buildWritingLetterBank` 真实行 **1210**；判定 `window.checkWritingAnswer` 真实行 **1284**）。

**不是自由输入，而是"字母库点选重建"**（原文，真实行约 1210–1219）：

```js
function buildWritingLetterBank(targetWord, lang) {
  const segments = targetWord.split(' ');
  const neededLetters = segments.join('').split('');

  let extraLetters = [];
  try { extraLetters = getWritingDistractorLetters(lang, neededLetters); } catch (_) { }

  const maxExtras = Math.max(3, Math.ceil(neededLetters.length / 2));
  const extras = extraLetters.slice(0, maxExtras);
  const allLetters = [...neededLetters, ...extras];
  allLetters.sort(() => Math.random() - 0.5);
```

干扰字母按语言字频生成并排除已用字母（`getWritingDistractorLetters`，真实行 **1338**，原文）：

```js
  const commonLetters = {
    fr: 'eaiuonsrlmtdpcgbfhvjqxyz',
    en: 'etaoinshrdlucmfywgpbvkjxqz',
    de: 'enisrathdulgomcbfkwzpvjyqx',
    es: 'eaoinsrlcdtumpbgvhfyqjzxkw',
    it: 'eaoinsrltcmdupbgvhfzqjkxyw',
    uk: 'аоеинтсрлвкмдпзугябчшфйцхжє',
    default: 'etaoinshrdlucmfywgpbvkjxqz'
  }[lang] || 'etaoinshrdlucmfywgpbvkjxqz';
  const neededSet = new Set(neededLetters.map(c => c.toLowerCase()));
  const candidates = commonLetters.split('').filter(c => !neededSet.has(c));
  const result = [];
  for (let i = 0; i < 8; i++) { result.push(candidates[Math.floor(Math.random() * candidates.length)]); }
```

**判定正确答案的函数**（`checkWritingAnswer`，真实行 **1291–1297** 原文）：

```js
  // Collect typed letters per segment from slots
  const targetWord = _curWritingWord.answerText;
  const segments = targetWord.split(' ');

  const typedSegments = segments.map((seg, si) => {
    const slots = [...document.querySelectorAll('#writingAnswerZone .letter-slot[data-seg="' + si + '"]')];
    return slots.map(s => s.textContent || '').join('');
  });

  const reconstructed = typedSegments.join(' ');
  const correct = reconstructed.trim().toLowerCase() === targetWord.trim().toLowerCase();
```

判定规则逐条（问 task 的五点）：

| 问题 | 实际处理 | 证据 |
|---|---|---|
| 大小写 | **忽略**（两侧 `toLowerCase()`） | 真实行 1297 |
| 空格 | 仅去首尾空白（`trim()`）；**词内空格必须完全一致**（各段用单个 `' '` join，多段词必须把空格段填满） | 真实行 1291–1297 |
| 标点 | **不宽容**——标点也是字符槽，必须点选，无剥离/归一化 | 字母库由 `targetWord.split('')` 生成，标点同为槽 |
| 拼写容错 | **无**：无编辑距离（Levenshtein）、无重音折叠（如 é→e）、无同义/别名 | 全仓检索无 `levenshtein`/`distance`/`normalize('NFD')`；判定即 `===` |
| 失败处理 | 标红 + 直接显示正确答案，进入下一题 | 真实行 1304–1316（`resultEl.innerHTML = correct ? ... : ... '<strong>' + esc(targetWord) + '</strong>'`） |

**服务端独立复核（不信任前端判定）**：模式提交时把答案与期望答案一起 POST（真实行 **1329**）：

```js
  try {
    await api('POST', '/api/quiz/answer', {
      lang: _curWritingWord.langCode,
      id: _curWritingWord.id,
      answer: reconstructed,
      expectedAnswer: targetWord
    });
  } catch { }
```

服务端 `src/routes/api.js` `POST /api/quiz/answer`（真实行 **983**）原文：

```js
  const correct = answer && (
    w.translation.trim().toLowerCase() === answer.trim().toLowerCase() ||
    display.trim().toLowerCase() === answer.trim().toLowerCase() ||
    (expectedAnswer && expectedAnswer.trim().toLowerCase() === answer.trim().toLowerCase())
  );

  if (correct) {
    w.progress = Math.min((w.maxProgress || wordMaxProgress(w.literal, w.infinitive)), (w.progress || 0) + 1);
  } else {
    w.progress = Math.max(0, (w.progress || 0) - 1);
  }
```

→ 判定口径两端一致（`trim().toLowerCase()` 精确相等）；**加减分在服务端**（答对 +1，答错 −1，下限 0，上限 maxProgress）。

**easy / hard 模式只影响是否自动发音**，不影响判定：`if (_writingEasyMode) { TTS.speak(targetWord, lang); }`（渲染时），UI 按钮 `setWritingDifficulty(false|true, this)`（`writingBtnHard` / `writingBtnEasy`）。

对照：选择题与短语重建的判定也走同一套精确比较（`train.js` 真实行 **746**：`const correct = answer.trim().toLowerCase() === q.answerText.trim().toLowerCase();`；真实行 **1057** 短语同理）。

## 1.6 学习流程 / 复习调度：**没有 SM-2 / Leitner / FSRS**

**负向证据（给方法，避免"没找到"变空话）**：对 `src/routes/api.js`（1920 行）与 `public/js/pages/train.js`（1855 行）全文检索
`spaced|Leitner|SM-?2|nextReview|reviewAt|ease|timesCorrect|timesWrong|correctCount|wrongCount`
→ **只有 3 处命中，且全部是 §1.3 掌握度公式里的英文注释短语 "decrease to flatten the curve"（`api.js` 真实行 7/16/17）**，与间隔复习无关。→ 仓库内**不存在**任何间隔复习算法实现。

**实际学习流程**：

1. **计时闪卡（auto flashcards）**：`let _trainAutoTime = 5;              // seconds per side`（`train.js` 真实行 **170**）；`startAutoTimer()`（真实行 **1370**）→ `_trainAutoTimer = setInterval(() => {...}, 50)`（真实行 **1372**）；正面到时 `flipAutoCard()` 翻面并把反面时间设为 `Math.max(2, Math.round(_trainAutoTime * 0.6))`；可选 `_trainAutoTtsDelay` 到点自动播报；若音频时长超过剩余时间则顺延（`extendTimer`）。
2. **本会话不重复**：`let _trainSeenIds = new Set();     // IDs already shown this session`（真实行 **19**）+ `_filterSeenFromQueue`（真实行 ~102）；队列耗尽 → 清空 `_trainSeenIds` 并 `_toastCycleRestart()`（"train_cycle_restart" 提示），即**循环重来**。
3. **顺序策略**：`order=random|sequential` + `sortDir=desc|asc`（服务端 `GET /api/quiz/batch` 真实行 **955**，按 `createdAt` 排序），并支持按 `types` / `labels` / `dateFrom` / `dateTo` 过滤。
4. **掌握度进度**：`progress / maxProgress`（§1.3），`GET /api/stats`（真实行 **1082**）输出 `totalWords/totalPhrases/byType/mastered/learning` 与 `mal` 统计；离线答题用 `POST /api/progress/sync`（真实行 **1381**）批量回放 `{lang,type,itemId,delta}`。
5. 考试模式（`EXAM_MODE_PLAN.md` + `public/js/pages/exam.js`）：4 类题型 25% 均分 + localStorage `exam_history` / `exam_best_{langCode}` 记录最佳分 → 是**一次成绩记录**，不是复习调度。

→ **结论：本仓库可复用的是"队列 + 会话去重 + 随机/顺序 + 掌握度进度计数器"；间隔复习调度必须另找来源或自研，禁止在主文档写"参考了 OpenFlashcards 的 SM-2"。**

## 1.7 package.json / 依赖清单与 License

证据：`https://raw.githubusercontent.com/Liozon/OpenFlashcards/HEAD/package.json`（原文，无 `license` 字段）：

```json
{
  "name": "openflashcards",
  "version": "2026.10.1",
  "main": "src/server.js",
  "dependencies": {
    "@phosphor-icons/web": "^2.1.2",
    "bcryptjs": "^2.4.3",
    "cookie-parser": "^1.4.6",
    "express": "^5.2.1",
    "jsonwebtoken": "^9.0.2",
    "msedge-tts": "^2.0.5",
    "sharp": "^0.35.4"
  }
}
```

| 依赖 | License | 核实方式 | 备注（对本项目） |
|---|---|---|---|
| `express` ^5.2.1 | **未核实** | 本轮未查 registry | NestJS 项目自带 HTTP 层，不复用 |
| `jsonwebtoken` ^9.0.2 | **未核实** | 同上 | 鉴权走本项目既有实现 |
| `bcryptjs` ^2.4.3 | **未核实** | 同上 | 同上 |
| `cookie-parser` ^1.4.6 | **未核实** | 同上 | 同上 |
| `sharp` ^0.35.4 | **未核实** | 同上 | 图片处理，若引入需另核 |
| **`msedge-tts`** ^2.0.5 | **MIT** | `https://registry.npmjs.org/msedge-tts/latest` → `"license":"MIT"` | 包 MIT，**但其调用的 Edge Read Aloud 服务条款未授权确认** |
| **`@phosphor-icons/web`** ^2.1.2 | **MIT** | `https://registry.npmjs.org/@phosphor-icons%2Fweb/latest` → `"license":"MIT"`，`"author":{"name":"rektdeckard"}` | ⚠️ 该仓库把图标字体**vendored 进仓库**（`public/vendor/phosphor/{bold,fill,regular}/*.woff2` + `style.css`，见文件清单与 `scripts/build-phosphor.js`）→ 若照搬需按 MIT 附版权声明（本项目已有自己的图标库，见主表素材登记） |

## 1.8 可直接复用 / 可改造 / 必须 clean-room 重写

| 源文件（真实行） | 能力 | 判断 | 理由 |
|---|---|---|---|
| `src/routes/api.js:4-30`（`wordMaxProgress`/`phraseMaxProgress`） | 掌握度阈值纯函数 | **可直接复用**（附 Apache-2.0 声明） | 无 IO、无依赖，可原样移植并按产品调参 |
| `src/routes/api.js:31`（`normConj`） | 变位条目归一化 | **可直接复用** | 3 行纯函数 |
| `src/utils/tts-generate.js`（`wordDisplay`） | 词形展示规则（冠词撇号不空格 + 动词用 `infinitive`） | **可改造复用** | 纯函数；原文 `const separator = article && !article.endsWith("'") && !article.endsWith("\u2019") ? ' ' : '';` |
| `src/utils/tts-cache.js`（全文） | 磁盘缓存布局 + 命中/清理/统计 API | **可改造复用（架构）** | 布局 `data/{userId}/tts/{lang}/spd{pct}/{itemId}.mp3` 与 `X-TTS-Cache: HIT` 设计可直接搬到 Nest service（存对象存储或磁盘） |
| `src/routes/api.js:702-747`（word 字段与 PUT 白名单） | 数据模型字段语义 | **结构映射后重写** | 字段语义可用；JSON 文件 + 整文件覆盖的存储在 Prisma/PG 下语义完全不同，不可照搬 |
| `public/js/pages/train.js:1136/1210/1284/1291-1297`（写作练习与判定） | 字母库拼写 + 精确匹配判定 | **逻辑参考后 React 重写** | 原生 DOM 操作代码不可直接搬；**判定规则本身需加强**（见 §1.9） |
| `public/js/pages/train.js:19/170/1370-1372`（会话去重 + 计时闪卡） | 练习队列模式 | **模式移植**（自写纯函数/组件） | 状态与 DOM 强耦合 |
| `src/routes/api.js:427` 起（`GET /api/tts`） | 服务端 TTS 代理 + 缓存 + 批量预生成(SSE) | **仅借架构，不搬数据源** | Google/Edge 未授权端点 |
| `src/middleware/auth.js`（760 字节）、`src/routes/auth.js` | JWT/cookie 会话 | **重写** | 本项目已有鉴权与家庭模型 |
| 全前端 `public/js/**`（`notebook.js` 106KB、`vocabulary.js` 84KB、`train.js` 83KB、`add.js` 34KB…） | SPA/页面 | **不可复用，React 重写** | 原生 DOM + hash 路由，无组件化 |
| 数据持久化 `src/utils/storage.js`（JSON 文件读写） | 存储层 | **不可复用** | 无事务/无并发控制/整文件覆盖 |
| 间隔复习算法 | — | **无来源 → 自研** | §1.6 检索 0 命中 |

## 1.9 Liozon 未确认项

1. **版权人姓名**：LICENSE 无署名（只有 `Copyright [yyyy] [name of copyright owner]` 占位）→ 无法确认；署名只能写项目名。
2. `express` / `jsonwebtoken` / `bcryptjs` / `cookie-parser` / `sharp` 的 License：**本轮未核实**（未查 registry）。
3. Google 翻译 TTS（`translate_tts?client=tw-ob`）与 Microsoft Edge Read Aloud 的**商用/缓存/再分发授权**：仓库内无任何说明 → **无法确认**。
4. `alexbokos/open.flashcards` 的 LICENSE 文本本身未逐字阅读（只用 GitHub API 的 `spdx_id: Apache-2.0` 判定）→ 若主文档要引用其许可条款原文，需另行抓取（`https://raw.githubusercontent.com/alexbokos/open.flashcards/master/LICENSE`，默认分支 `master`）。
5. 仓库无测试（`package.json` 无 test 脚本，无 test 目录）→ 复用其纯函数时**无官方测试可依赖**，需自写用例。

---

# 二、meetDeveloper/freeDictionaryAPI

- 仓库：<https://github.com/meetDeveloper/freeDictionaryAPI>
- 证据树：<https://api.github.com/repos/meetDeveloper/freeDictionaryAPI/git/trees/HEAD?recursive=1>
- 文件清单（完整，`"truncated":false`）：`LICENSE`、`README.md`、`app.js`、`modules/dictionary.js`、`modules/errors.js`、`modules/utils.js`、`package.json`、`meta/wordList/english.txt`（2.6MB 词表）、`.github/FUNDING.yml` → **纯 Node/Express 服务，无 TypeScript、无类型定义文件、无 OpenAPI/schema、无测试、无前端**。

## 2.1 License 结论：**仓库内自相矛盾 → 我们的使用许可"无法确认"**

证据 1 —— 根 `LICENSE` = **GPL-3.0 全文**（35149 字节），首行原文：

> `https://raw.githubusercontent.com/meetDeveloper/freeDictionaryAPI/HEAD/LICENSE`
> `                    GNU GENERAL PUBLIC LICENSE` / `                       Version 3, 29 June 2007` / ` Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>`

注意：`Copyright (C) 2007 Free Software Foundation, Inc.` 是 **GPL 模板自身**的版权行，**不是本项目版权行**；GPL 正文的 `<one line to give the program's name…>` / `Copyright (C) <year>  <name of author>` 位置为**未填写的模板示例** → LICENSE 文件内**无本项目版权人**。

证据 2 —— `package.json`（`https://raw.githubusercontent.com/meetDeveloper/freeDictionaryAPI/HEAD/package.json`）原文：

```json
  "author": "Suraj Jain",
  "license": "ISC",
```

**→ 同一仓库内 LICENSE 文件说 GPL-3.0，`package.json` 说 ISC。两者互斥，仓库内没有任何说明谁优先 → 结论：许可「无法确认」。**

**处置建议（不臆断，只给风险分级）**：按**最保守的 GPL-3.0** 处理 —— 不分发其代码、不把其代码并入本项目（NestJS 后端或 React 前端均属并入），如确实需要，只能作为**独立第三方服务**从网络调用，且**先向作者澄清许可冲突**。GPL-3.0 与"可商用"并不矛盾（GPL 允许收费），但**copyleft 传染**与"闭源/自有分发"不兼容——这是本项目关心的点。原文（GPL-3.0 §5(c)）：`You must license the entire work, as a whole, under this License to anyone who comes into possession of a copy.`

## 2.2 数据来源：**不是 Wiktionary**（README 无任何 Wiktionary / CC BY-SA 声明）

证据 1 —— README 全文（`https://raw.githubusercontent.com/meetDeveloper/freeDictionaryAPI/HEAD/README.md`）**检索不到** `Wiktionary`、`CC BY-SA`、`attribution`、`license` 等字样；其唯一的来历声明原文：

> `There was no free Dictionary API on the web when I wanted one for my friend, so I created one.`

→ **"仓库中关于数据来源的原文声明"= 只有上面这一句，且未指明 Wiktionary；也未声明 CC BY-SA。若主文档需要"数据来自 Wiktionary（CC BY-SA）"这一结论：本仓库内找不到依据。**

证据 2 —— 代码显示真实来源是 **Google 词典的未公开回调接口**（`modules/dictionary.js` `queryInternet()` 原文）：

```js
async function queryInternet (word, language) {
	let url = new URL('https://www.google.com/async/callback:5493');

	url.searchParams.set('fc', 'ErUBCndBTlVfTnFUM29LdXdNSlQ2VlZoWUIwWE1HaElOclFNU29TOFF4ZGxGbV9zbzA3YmQ2NnJyQXlHNVlrb3l3OXgtREpRbXpNZ0M1NWZPeFo4NjQyVlA3S2ZQOHpYa292MFBMaDQweGRNQjR4eTlld1E4bDlCbXFJMBIWU2JzSllkLVpHc3J5OVFPb3Q2aVlDZxoiQU9NWVJ3QmU2cHRlbjZEZmw5U0lXT1lOR3hsM2xBWGFldw');
	url.searchParams.set('fcv', '3');
	url.searchParams.set('async', `term:${encodeURIComponent(word)},corpus:${language},hhdr:true,hwdgt:true,wfp:true,ttl:,tsl:,ptl:`);
	...
	let response = await fetch(url, {
		agent: httpsAgent,
		headers: new fetch.Headers({
			"accept": "*/*",
			"accept-encoding": "gzip, deflate, br",
			"accept-language": "en-US,en;q=0.9",
			"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36"
		})
	});
```

→ 硬编码 `fc` token + 浏览器 UA 伪装 + `corpus:<language>`，即**抓取 Google 词典 widget（`hwdgt:true`）**。同文件 `fetchFromSource()` 注释亦为 `let dictionaryData = await queryInternet(word, language);`。

证据 3 —— 音频字段来自 `oxford_audio`，README 示例主机是 **gstatic.com**：
`modules/dictionary.js` `transform()` 原文：

```js
					phonetics: phonetics.map((e) => {
						return {
							text: e.text,
							audio: e.oxford_audio
						};
					}),
```

README 真实响应示例原文：

```json
      {
        "text": "həˈləʊ",
        "audio": "//ssl.gstatic.com/dictionary/static/sounds/20200429/hello--_gb_1.mp3"
      },
```

## 2.3 API 返回结构（仓库无类型定义 → 字段取自构造代码 + README 示例）

**先明确：仓库内没有 .d.ts / JSON Schema / OpenAPI**，所以"类型定义文件"不存在；字段必须从 `modules/dictionary.js` 的 `transform()` 构造代码与 README 的真实响应示例读取。`transform()` 原文（字段构造处）：

```js
			.map((entry) => {
				let { headword, lemma, phonetics = [], etymology = {}, sense_families = [] } = entry;
				
				return {
					word: lemma || headword,
					phonetic: _.get(phonetics, '0.text'),
					phonetics: phonetics.map((e) => { ... }),
					origin: _.get(etymology, 'etymology.text'),
					meanings: sense_families.map((sense_family) => {
						...
						return {
							partOfSpeech: _.get(parts_of_speech[0], 'value'),
							definitions: senses.map((sense) => {							
								let { definition = {}, example_groups = [], thesaurus_entries = [] } = sense,
									result = {
										definition: definition.text,
										example: _.get(example_groups[0], 'examples.0'),
										synonyms: _.get(thesaurus_entries[0], 'synonyms.0.nyms', []).map(e => e.nym),
										antonyms: _.get(thesaurus_entries[0], 'antonyms.0.nyms', []).map(e => e.nym)
									};

								if (include.example) {
									result.examples =  _.reduce(example_groups, (accumulator, example_group) => { ... }, []);
								}
								return result;
							})
						};
					})
				};
			});
```

| 字段 | 是否存在 | 备注 |
|---|---|---|
| `word` | ✅ | `lemma || headword` |
| `phonetic` / `phonetics[]{text, audio}` | ✅ | `audio` = `e.oxford_audio` |
| `origin` | ✅ | 词源文本 |
| `meanings[].partOfSpeech` | ✅ | `parts_of_speech[0].value` |
| `meanings[].definitions[].definition` | ✅ | |
| `meanings[].definitions[].example` | ✅ | 仅取第一个例句 `examples.0` |
| `meanings[].definitions[].synonyms/antonyms` | ✅ | 空时 `[]` |
| `meanings[].definitions[].examples[]` | ✅ **仅当** `?include=example` | app.js 把 `req.query.include` 按逗号切分成 `{example:true}` |
| **`sourceUrls`** | ❌ **不存在** | README 示例与 `transform()` 均无此字段 → 若产品需要"来源链接"，本 API 不提供 |
| `license` / 数据来源字段 | ❌ | 无任何授权相关信息字段 |

v1/v2 差异（`transformV2toV1()` 原文）：v1 把 `meanings[]` 折成对象 `meaning: { <partOfSpeech>: [definitions] }`。
支持语言（`modules/utils.js` `SUPPORTED_LANGUAGES` 原文）：`hi, en, en-uk, es, fr, ja, cs, nl, sk, ru, de, it, ko, pt-BR, ar, tr`；`app.js` 把 `en_US`/`en_GB` 折叠为 `en`，并 `word = word.trim().toLocaleLowerCase(language)`。
路由（`app.js` 原文）：`app.get('/api/:version/entries/:language/:word', async (req, res) => {`，响应恒带 `Access-Control-Allow-Origin: *`。
错误体（`modules/errors.js` 原文）：`{title, message, resolution}` 三字段，例如 404 `NoDefinitionsFound`（`Sorry pal, we couldn't find definitions for the word you were looking for.`）、429 `RateLimitError`（`Sorry pal, you were just rate limited by the upstream server.`）、500 `UnexpectedError`/`BadHTTPResponse`。

## 2.4 速率限制 / 使用条款

证据 —— `app.js` 原文（代码内限流）：

```js
    rateLimit = require("express-rate-limit"),
    ...
    limiter = rateLimit({
        windowMs: 5 * 60 * 1000, // 5 minutes
        max: 450 // limit each IP to 450 requests per windowMs
    }),
...
app.set('trust proxy', true);

app.use(limiter);
```

→ **每 IP 每 5 分钟 450 次**（`trust proxy: true`，即以 `X-Forwarded-For` 判 IP）。

上游二次限流（`modules/dictionary.js` 原文）：`if (response.status === 429) { throw new errors.RateLimitError(); }` → 抓 Google 时也会被 Google 限流。

**条款类信息**：仓库内**没有 ToS、没有商用条款、没有 attribution 要求、没有 API key 说明**。README 只有运维自述与赞助请求（原文）：

> `The API usage has been ramping up rapidly, making it difficult for me to keep the server running due to increased AWS costs.`
> `Currently API has more than 10 million requests per month and to keep it running I need support of the community.`

→ **是否可商用：仓库内无明确声明，无法确认。** 是否要求 attribution：**仓库内无声明，无法确认**。
⚠️ 逻辑上必须分清：`LICENSE`（GPL-3.0/ISC 冲突）约束的是**代码**，**不构成对"接口返回数据/音频"的授权**；数据来自 Google/Oxford，其权利不在本仓库。

## 2.5 audio 字段 URL 指向谁 / 能否 hotlink

- README 示例返回 `"audio": "//ssl.gstatic.com/dictionary/static/sounds/20200429/hello--_gb_1.mp3"` → **主机 = `ssl.gstatic.com`（Google 静态资源域）**；`dictionary.js` 里该值来自 `e.oxford_audio`（Oxford 音频，由 Google 词典 widget 下发）。
- 形式上是**协议相对 URL**（`//` 开头），客户端使用需自行补 `https:`。
- **能否直接 hotlink**：**仓库内没有任何允许 hotlink / 缓存 / 再分发的声明 → 无依据，无法确认；不得默认视为已授权。** 另外该 URL 是运行时由 Google 下发（非本仓库可保证稳定），即便技术上能取，也不等于有权使用。
- 对本项目的直接含义：**不要把这个音频链路接进产品**；音频来源以 task-1《audio-pronunciation-licensing》的授权矩阵为准。

## 2.6 freeDictionaryAPI：可直接复用 vs 必须重写

| 项 | 判断 |
|---|---|
| 全部代码（`app.js`、`modules/*.js`） | **不可复用**：LICENSE(GPL-3.0) 与 package.json(ISC) 冲突 → 许可无法确认 → 按最保守 GPL-3.0 copyleft 处理，不并入自有代码 |
| `queryInternet()` 的 Google 抓取手法（硬编码 `fc` token + UA 伪装 + 未公开端点） | **不可复制**（技术不稳定 + 授权不明；Google ToS 本轮未核查，无法确认） |
| `ssl.gstatic.com` / `oxford_audio` 音频 | **不可默认使用**（无授权依据，见 §2.5） |
| 字段结构（`word/phonetic/phonetics[]/meanings[].partOfSpeech/definitions[].definition/example/synonyms/antonyms` + `?include=example`） | **可作字段设计参考**（仅参考，不复制代码）；**注意无 `sourceUrls`** |
| 错误体三字段 `{title, message, resolution}` | 可作前端错误文案结构参考 |
| 限流量级 450 req / 5 min / IP | 仅量级参考（不复制代码） |
| 词表 `meta/wordList/english.txt`（2.6MB） | **未核实其来源与许可** → 不采用（无法确认） |

## 2.7 freeDictionaryAPI 未确认项

1. 许可到底适用 **GPL-3.0** 还是 **ISC**（LICENSE 文件 vs `package.json` 冲突）→ **无法确认**，需作者澄清。
2. 版权人：LICENSE 内无署名；`package.json` 记 `Suraj Jain`（只能确认"package.json 里这样写"）。
3. `ssl.gstatic.com` 音频的 hotlink / 缓存 / 商用 → **仓库内无依据，无法确认**。
4. 抓取 Google 词典是否违反 Google 服务条款 → **本轮未核查 Google ToS，无法确认**。
5. 线上服务 `api.dictionaryapi.dev` 的可用性/SLA/是否可持续 → 无法确认（README 自述成本压力）。
6. `meta/wordList/english.txt` 的来源与许可 → 未核实，无法确认。
7. 仓库内**没有** Wiktionary 与 CC BY-SA 的任何声明 → 若主文档要写"该 API 数据来自 Wiktionary(CC BY-SA)"，**在本仓库内无证据**（本报告不支持该结论）。

---

# 三、能力 × 来源文件 × License × 复用方式（汇总小表）

| # | 能力 | 来源文件（真实行/符号） | License | 证据 URL | 复用方式 |
|---|---|---|---|---|---|
| 1 | word 数据模型（literal/translation/definition/article/conjugation/declensions/labels/progress/maxProgress） | Liozon `src/routes/api.js:702-747` | Apache-2.0 | raw `.../HEAD/src/routes/api.js` | **结构映射**后 Prisma 重写（字段语义可借，JSON 存储不可借） |
| 2 | phrase 数据模型 | Liozon `src/routes/api.js:835-857` | Apache-2.0 | 同上 | 同上 |
| 3 | 掌握度阈值纯函数 `wordMaxProgress`/`phraseMaxProgress` | Liozon `src/routes/api.js:4-30` | Apache-2.0 | 同上 | **直接移植**+按产品调参（附声明） |
| 4 | 变位归一化 `normConj` | Liozon `src/routes/api.js:31`（三处副本） | Apache-2.0 | 同上 | **直接移植**（3 行） |
| 5 | 词形展示规则 `wordDisplay` | Liozon `src/utils/tts-generate.js` | Apache-2.0 | raw `.../HEAD/src/utils/tts-generate.js` | **改造复用**（纯函数） |
| 6 | 服务端 TTS 代理 + 磁盘缓存布局 + HIT/MISS 头 + 批量 SSE 预生成 | Liozon `src/utils/tts-cache.js`、`src/routes/api.js:427/486/493/505/542`、`public/js/tts.js` | Apache-2.0（**代码**）；音频源授权无法确认 | raw 各文件 | **仅借架构**；音频源另定（task-1） |
| 7 | 字母库拼写练习 + 正确答案判定（`trim().toLowerCase()` 精确相等，无标点/拼写容错） | Liozon `public/js/pages/train.js:1136/1210/1284/1291-1297`；服务端复核 `src/routes/api.js:983-1003` | Apache-2.0 | raw `.../HEAD/public/js/pages/train.js` | **逻辑参考 + React 重写**；判定规则需加强（建议服务端权威 + 可配置容错） |
| 8 | 练习队列模式（会话去重 `_trainSeenIds` + 计时闪卡 + random/sequential） | Liozon `public/js/pages/train.js:19/170/1370-1372`；`src/routes/api.js:955` | Apache-2.0 | 同上 | **模式移植**（自写纯函数/组件） |
| 9 | **间隔复习算法（SM-2/Leitner/FSRS）** | **无来源**（`api.js` 1920 行 + `train.js` 1855 行全文检索 0 命中） | — | — | **自研**（禁止在主文档写"参考了 OpenFlashcards 的 SRS"） |
| 10 | 释义/例句字段设计 + `?include=example` | freedict `modules/dictionary.js`（`transform`）+ README 示例 | **GPL-3.0 与 package.json ISC 冲突 → 许可无法确认** | raw `.../HEAD/modules/dictionary.js`、`.../README.md` | **仅字段设计参考；代码不得并入** |
| 11 | 音频 URL（`//ssl.gstatic.com/...`，来自 `oxford_audio`） | freedict README 示例 + `modules/dictionary.js` | **仓库未声明** | 同上 | **不可默认使用**（无授权依据，无法确认） |
| 12 | 限流量级 450 req / 5 min / IP | freedict `app.js`（`rateLimit({windowMs: 5*60*1000, max: 450})`） | 同上（冲突） | raw `.../HEAD/app.js` | 仅量级参考 |
| 13 | 错误体 `{title, message, resolution}` | freedict `modules/errors.js` | 同上（冲突） | raw `.../HEAD/modules/errors.js` | 仅文案结构参考 |

---

# 四、给主文档（`docs/opensource-wordbook-mapping.md`）的落地结论

1. **Liozon/OpenFlashcards 可以进主表，许可栏写 `Apache-2.0（LICENSE 文件；版权人未署名）`，采用方式写"纯函数直接复用 + 架构模式适配 + 前端 clean-room 重写"**，并在 `docs/THIRD_PARTY_NOTICES.md` 记：`Liozon/OpenFlashcards (Apache-2.0, 版权人未署名) + 上游 alexbokos/open.flashcards (Apache-2.0)`，附 LICENSE 副本，修改文件加"已修改"声明；**禁止用其商标/名称/图标做产品品牌**。
2. **"单词本"的复习调度（SRS）在主表中必须标为"无开源来源 → 自研"**：Liozon 只有"计时闪卡 + 会话去重 + 掌握度计数（50–200 次）"，没有任何间隔算法；若产品需要间隔复习，要么自研，要么另立调研任务（本报告不提供来源）。
3. **拼写判定不要照搬 Liozon 的规则**：它是 `trim().toLowerCase()` 精确相等（无标点/重音/拼写容错，因为答案是字母库点选）。本项目若做自由输入，需要另定容错策略（建议服务端权威判定，参考它"前端提示 + 服务端复核 + 服务端加减分"的结构）。
4. **freeDictionaryAPI 不要作为代码来源、也不要把它的音频接进产品**：许可自相矛盾（GPL-3.0 vs ISC）→ 无法确认；数据与音频实为 Google/Oxford（`gstatic.com`），仓库内无 Wiktionary/CC BY-SA 声明、无 hotlink/商用授权。若主文档此前假设"该 API 数据来自 Wiktionary(CC BY-SA)"，**应据本报告更正**。
5. **需要 lead 拍板的两点**：(a) 是否接受 Apache-2.0 的署名 + 修改标注义务（本项目已按 MIT 复用其他仓库，多一个 Apache 义务成本不高）；(b) 音频/释义数据源必须等 task-1 授权结论，本报告不产出可用音频源。

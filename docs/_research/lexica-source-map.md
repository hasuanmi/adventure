# Lexica（lrydzkowski）源码级能力地图

> 调研对象：`https://github.com/lrydzkowski/Lexica`（v1.1.0）
> 快照：`HEAD = c1b7770154a8a2420783df6724ae8852f92a4fdb`（只读抓取）
> LICENSE：**MIT**，`LICENSE` 原文 `Copyright (c) 2021 Łukasz Rydzkowski`
> 技术栈（`README.md` + `*.csproj` + `Lexica.sln`）：**.NET Core 6 / C# 控制台程序**（Windows 10+）——`Lexica.CLI` + `Lexica.Learning` + `Lexica.Pronunciation` + `Lexica.Words` + `Lexica.Database` + 3 个测试工程
> 用途：`docs/opensource-wordbook-mapping.md` 的证据底稿。**代码是 MIT（可复用），但它抓取/缓存的音频不是 MIT** —— 见 §4。

---

## 1. 产品形态

三个学习模式（`README.md` §Modes 原文）：

| 模式 | 行为 | 对应我们的功能 |
|---|---|---|
| `Spelling` | **播放单词发音录音 → 用户写出听到的单词** → 对：显示译文并计数 +1；错：显示正确答案+译文，该词计数归零（`ResetAfterMistake=true` 时全部归零）；循环到所有词计数达标 | **听音拼写**（我们第 10 项） |
| `OnlyOpen` | 只出开放题：英→中、中→英各至少 1 题（数量 = `NumOfOpenQuestions`） | **看中文写英文 / 看英文写中文**（我们第 11 项） |
| `Full` | 闭合题（4 选 1，英中双向各 1 题）+ 开放题 | 选择题型（MVP 可缓） |

题量与推进规则（`README.md` §Modes 逐步原文）：
- 每轮把集合随机化，**取前 7 个**（`GetQuestions(randomizeEachIteration=true, pieceSize=7)`），逐个判定是否还有未达标的计数器；
- 闭合题优先于开放题；双向都没达标时**随机选方向**；
- 答对计数器 +1，答错计数器归零；**同一词不会被连续问两次**（`IsQuestionRepeated`）。

---

## 2. 数据结构（源码级）

`Lexica.Words/Models/Entry.cs`：

```csharp
public string Id => $"{SetPath.Namespace}{SetPath.Name}:{LineNum}";  // 词条标识 = 集合命名空间:行号
public SetPath SetPath { get; }
public int LineNum { get; }
public List<string> Words { get; }         // 一个词条可以有多个写法（逗号分隔）
public List<string> Translations { get; }  // 一个词条可以有多个译文（逗号分隔）
```

集合文件格式（`README.md` 原文 + `Lexica.CLI/Assets/Examples/set_1.txt`）：

```
compelling ; nieodparty, pociągający
rule of thumb ; praktyczna zasada
rage, anger ; gniew
```

即 **`词1, 词2 ; 译1, 译2` / 一行一条**，用**分号**分隔两侧、**逗号**分隔同侧多答案 —— 这就是它「多答案判定」的数据基础。

`Lexica.CLI/Executors/Modes/` + `Lexica.Learning/Models/`：
`QuestionTypeEnum{Closed,Open}`、`AnswerTypeEnum{Translations,Words}`、`ModeEnum{Spelling,OnlyOpen,Full}`、`Question`（放给用户的题面）、`QuestionInfo`（**题面 + 正确答案 + 选项**）、`AnswerResult`、`AnswerRegister{Words, Translations}`、`AnswerRegisterValue{PreviousValue, CurrentValue}`。

**判定与记账**（`Lexica.Learning/LearningModeOperator.cs`）：

```csharp
// VerifyAnswer(input)  —— 核心判定（约 @365-410）
List<string> answerWords = input.Split(',').Select(x => x.Trim()).ToList();
answerWords.Sort();
List<string> correctAnswers = CurrentQuestionInfo.GetCorrectAnswers();  // Entry.Words 或 Entry.Translations，已 Sort
correctAnswers.Sort();
bool answersAreCorrect = string.Join(',', answerWords)
    .Equals(string.Join(',', correctAnswers), StringComparison.InvariantCultureIgnoreCase);
```

判定口径（逐条，可直接照抄为 TS 纯函数）：
1. 按 **逗号** 切分，每段 `Trim()`；
2. 两侧 **排序** 后重新用逗号拼接；
3. **忽略大小写** 比较（`InvariantCultureIgnoreCase`）；
4. 因此：多答案顺序无关、大小写无关、两端空白无关；**拼写错一个字母即判错**（无编辑距离容错、无 Levenshtein）；
5. 答错时 `UpdateAnswersRegister(0, Set, Translations)` + `(..., Words)` → **双向计数器都归零**；
6. `OverridePreviousMistake()`：`CurrentValue = PreviousValue + 1` —— 用于「用户申诉/误判后改判」。

闭合题的选择：`numOfPossibleAnswers = 4`，从 `WordsSetOperator.GetRandomEntries(4)` 取干扰项，若正确答案不在其中则**随机替换一个选项为正确答案**（保证必有正确项）。

**注意坑**：`GetQuestions()` 是 `yield return` 的迭代器，但 `CurrentQuestionInfo` 是实例字段（`yield` 之后才被下一次迭代覆盖）——消费方必须在拿到 `Question` 后**立即** `VerifyAnswer`，否则判定的是上一题。移植到 NestJS/React 时**不要照搬这个可变单例状态**，要改成显式传参的纯函数（`verify(input, correctAnswers)`）。

---

## 3. 拼写模式判定（我们最需要的一段）

- 入口：`Lexica.Learning/LearningModeOperator.cs` 中 `Mode == ModeEnum.Spelling` 的 3 处分支：
  1. `GetQuestions()` 内：Spelling 模式下**只出 Words 方向的开放题**（`if (Mode == ModeEnum.Spelling && answerType == AnswerTypeEnum.Translations) return true;` → 跳过 Translations 方向）；
  2. `GetNumOfRequiredAnswersMultiplier()`：Spelling 模式 **multiplier = 1**（不像 Full 模式双向都要考）；
  3. 题面：`QuestionInfo` 的 `AnswerType = Words`，即「听音 → 拼写单词」。
- 校验：同一个 `VerifyAnswer()`（§2）—— 大小写不敏感、整体字符串相等。
- **拼写错误记录**：答错 → 计数器 `Set 0`；`Lexica.Database/Services/LearningHistoryService.cs` + `Lexica.Database/lexica.db`（SQLite）落表 `answer`（列见 `README.md` §Database）：`answer_id, folder_path, set_file_name, mode, question, question_type, answer, proper_answers, is_correct`。
  → **注意：它只记"这道题答错"，没有"错词本/错词列表"这一层**；「拼写错误记录」要做成可复习的词级记录，需要我们自己设计（见主文档 §8 `WordSpellingAttempt`）。

---

## 4. 发音（**重点：代码与音频授权是两件事**）

### 4.1 代码做了什么

`Lexica.Pronunciation/Api/WebDictionary/PronunciationService.cs` —— 一个**通用「网站词典抓取器」**：

```csharp
// 1) 页面 URL = Host + UrlPath，其中 {word} 被替换（空格→"-"）
private string GetPageUrlPath(string word) => Settings.UrlPath.Replace("{word}", word.Replace(" ", "-"));
// 2) 抓 HTML，按 CSS class 找音频
HtmlNodeCollection nodes = htmlDoc.DocumentNode.SelectNodes("//div[@class=\"pos-header dpos-h\"]");
HtmlNode titleNode = node.SelectSingleNode(".//div[@class=\"di-title\"]/span/span");           // 词条标题
HtmlNode audioSourceNode = node.SelectSingleNode(".//span[@class=\"us dpron-i \"]//source[@type=\"audio/mpeg\"]");  // 美音
// 3) 相对路径拼 Host 后下载 mp3 → 落盘缓存
private string GetFilePath(string word, string extension = "mp3")
    => Path.Combine(Settings.DownloadDirectoryPath, word.RemoveInvalidFileNameChars() + "." + extension);
private async Task<string?> DownloadFile(string word) {
    string filePath = GetFilePath(word);
    if (File.Exists(filePath)) return filePath;        // 本地缓存命中即不再联网
    string? mp3FileUrl = await GetFileUrl(word);
    ... httpClient.GetStreamAsync(mp3FileUrl) → FileStream ...
}
// 4) 播放（Windows）：NAudio WaveOutEvent
```

**关键事实**：
- 代码里**没有任何默认词典主机**：`Lexica.CLI/appsettings.json` 的 `PronunciationApi.WebDictionary.{Host,UrlPath,DownloadDirectoryPath}` **全是空字符串**，由用户自己填。
- `README.md` §Technicalities 原文明说：「**It is up to a user which dictionary will be used. You have to keep in mind that while choosing any web dictionary you should take into consideration legal restrictions connected with copyright.**」
- `UrlPath` 的示例形态是 `/dict/en/{word}`，而 `dpos-h` / `di-title` / `us dpron-i` 这组 class 名对应的是**剑桥词典页面结构**——也就是说**代码的默认用法是抓商业词典并缓存其 mp3**。

### 4.2 授权结论（必须分清三层）

| 层 | 是什么 | 授权 |
|---|---|---|
| **代码** | `PronunciationService.cs` 等 | **MIT**（`Copyright (c) 2021 Łukasz Rydzkowski`）→ 可复制、可修改、可商用，需保留版权声明 |
| **音频文件** | 抓来的 mp3 | **不是 MIT**：取决于被抓网站的条款；作者本人在 README 里明确提示有版权风险 |
| **用法** | 「抓第三方商业词典页面 + 下载缓存 + 重新播放」 | 属该网站 ToS 问题，**不可移植到我们的产品** |

### 4.3 我们可以复用/不可复用的部分

| 部分 | 判断 |
|---|---|
| 「发音提供者抽象 + 本地 mp3 缓存 + 命中即不联网」（`IPronunciation` / `DownloadFile` 结构） | ✅ **模式可复用**（我们用自己的合法来源填充） |
| `AudioExists()` / `PlayAsync()` 语义 | ✅ 概念可复用（我们的 `GET /words/:id/audio` 先查缓存再回源） |
| NAudio 播放（Windows 专属） | ❌ 不适用（我们要 Web `<audio>` + React Native） |
| **Cambridge/商业词典抓取与 mp3 缓存** | ❌ **禁止移植**（无授权，且剑桥 ToS 不允许） |
| 多答案拼写判定 `VerifyAnswer` | ✅ **直接移植**（改为 TS 纯函数 + 单元测试） |
| 计数器归零 / 双向联动 / 7 个一组的推进规则 | ✅ 模式复用（我们简化，见主文档 §7 MVP） |
| SQLite `answer` 表 | ⚠️ 概念参考；我们落 PostgreSQL（且需要词级错词记录） |

---

## 5. 与当前项目对接时要注意的工程差异

| 维度 | Lexica | 本项目 |
|---|---|---|
| 运行时 | .NET 6 控制台（Windows 独占） | NestJS（Linux/容器）+ React Web + Expo Mobile |
| 数据源 | 本地 txt 词表（无词库、无中文释义、无音标、无例句） | 需要 word/IPA/中文释义/词性/例句（外部词典 API） |
| 存储 | SQLite 单文件、单表 `answer` | PostgreSQL + Prisma（family/child 归属、软删、审计） |
| 音频 | 本地 mp3 + NAudio | 浏览器/移动端播放；服务端是否需要缓存取决于音频源授权（见 `audio-pronunciation-licensing.md`） |
| 结论 | — | **只搬算法与判定口径，不搬运行时与数据形态** |

> 未逐行核验：`Lexica.CLI/Modes/Learning/Services/LearningModeConsoleService.cs`（11KB，控制台交互与发音触发时机的调用点）、`Lexica.Core/Services/UrlService.cs`（URL 拼接细节）。上述结论以已读文件为准。

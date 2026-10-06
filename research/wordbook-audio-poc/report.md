# Wordbook 发音 PoC · 最终报告

> 运行时间：**2026-10-06T09:33:33Z**（manifest.generated_at，最终一次干净运行）
> 样本：任务书指定的 30 个英文单词（未替换任何一个）
> 位置：`research/wordbook-audio-poc/`（独立 research 产物，未接入任何业务代码）
> 复现命令见 `README.md` §3；本轮使用 `--accept-dual-license`（含义与法律边界见 §5）

---

## 1. 一句话回答

**「Commons 白名单 + 自托管真人发音」可以批量跑通。**
30 个词里拿到了 **44 个真实音频文件（US 27 + UK 17）**，每个都带 SHA256 与完整授权台账，全部是 **Commons 官方 mp3 转码**，零本地转码、零回退、零 hotlink；落盘审计 0 问题。
**但最大的成本不是"下载"，而是"授权判断"**——44 条里 **27 条（61%）** 必须先显式接受"GFDL 双标注 / 自发布"才能放行，只有 **17 条**能自动放行；另有 1 条至今仍卡在人工复核。**这就是这个方案真正的瓶颈。**

---

## 2. 交付物清单（任务书要求的目录）

| 文件 | 内容 | 状态 |
|---|---|---|
| `audio/us/*.mp3` | 美音 27 个 | ✅ |
| `audio/uk/*.mp3` | 英音 17 个 | ✅ |
| `manifest.json` | 60 条记录（含 no_file / needs_review / allowed），每条带证据字段 | ✅ |
| `attribution.csv` | 44 行署名台账，`source_page_url / author_original / license_name / license_url / attribution_text / sha256 / resolution` **无空列** | ✅ |
| `review_queue.csv` | 待人工复核条目 + 证据 + 建议动作 | ✅ |
| `report.md` | 本文件 | ✅ |
| `README.md` | 目标 / 边界 / 复现 / 结论 | ✅ |
| 附加 | `stats.json`、`player.html`（本地点播验证页）、`tools/`（主流程 + 28 项单测 + 落盘审计 + 429 诊断 + 通道探测） | ✅ |

---

## 3. 统计结果

### 3.1 input 层面：Commons 上到底有没有音频文件

| 指标 | 数量 |
|---|---|
| 只找到 US | **13** |
| 只找到 UK | **2** |
| US + UK 都有 | **15** |
| 都没有 | **0** |
| **US 合计** | **28 / 30** |
| **UK 合计** | **17 / 30** |

> 注意：**"都没有 = 0"** 说明这 30 个常用词在 Commons 上都有发音文件；缺口在口音覆盖（UK 只有 17/30），不在"有没有音频"。

### 3.2 output 层面：通过授权筛选并成功下载

| 指标 | 数量 |
|---|---|
| 记录总数（30 词 × US/UK） | 60 |
| `allowed`（通过授权 + 已下载） | **44** |
| `needs_review`（授权无法自动确认 → **未下载**） | **1** |
| `no_file`（Commons 无该口音文件） | **15** |
| **可用：US** | **27 / 30** |
| **可用：UK** | **17 / 30** |
| 双口音可用 | 15 词（apple/book/computer/family/friend/happy/teacher/water/mother/child/student/English/history/answer/beautiful） |
| 仅单口音可用 | 14 词（different/example/father/house/important/language/learn/practice/question/read/remember/school/world/write） |

### 3.3 工程指标（真实负重）

| 指标 | 数量 |
|---|---|
| Commons API 请求数（含 429 重试） | **59** |
| 其中计划内请求（5 次 search + 1 次批量 imageinfo） | **6** |
| 429 次数 | **9**（全部在转码 mp3 按需生成时触发，退避后全部成功，**0 条因限流失败**） |
| 文件下载请求 | 44 |
| 磁盘总量 | **824 KB**（44 个文件，平均 ~19KB） |
| 下载格式 | **mp3-transcode 44 / 44**（全部拿到官方转码，**0 次回退原始 ogg**） |
| 音频时长 | 最短 1.36s / 中位 2.56s / 最长 3.47s（正常单词发音区间） |

### 3.4 落盘审计（`tools/audit.py`）

```
检查文件数        : 44
磁盘总字节        : 843943 (824 KB)
attribution 行数  : 44
attribution 空列数: 0
时长中位数        : 2.56s
✅ 无问题：文件存在、SHA256 一致、头部可解析、台账字段完整。
```

---

## 4. 逐条发现（这才是结论可否被执行的关键）

### 4.1 Commons API 匿名配额非常紧：突发第 5 个请求就 429

| 观测 | 数据 |
|---|---|
| 1.5s 间隔突发 | **第 5 个请求开始 429**，连续退避到第 4 次仍失败 |
| 12s 稳定间隔 | 连续 **12 次全部 200** |
| `upload.wikimedia.org` | 配额宽松：`x-ratelimit-limit: 600000, 600000;w=60`、`x-ratelimit-remaining: 599999` |
| 转码 mp3 首次请求 | 也会 429（按需生成、不走 CDN 缓存） |

**结论**：批量方案必须"**极少的 API 请求 + 自适应退避**"，否则跑不完 100 个词。本 PoC 的设计（1 次 search 覆盖 6 词、1 次 imageinfo 取 50 文件、间隔 12s→4s 自适应、429 时翻倍到 120s 上限）是**被配额逼出来的，不是优化**。

### 4.2 「kaikki 打包音频」这条路在本轮被证伪

| 通道 | 实测结果 |
|---|---|
| kaikki 按词入口 | **不存在**。`kaikki.org/dictionary/English/index.html` 只提供整包 `kaikki.org-dictionary-English.jsonl`（23.9GB，gz 2.8GB） |
| kaikki 音频包 | `wiktionary-audios.tar` = **20.4GB**（约 94.2 万个文件） |
| 结论 | 为 30 个词下载 20GB 不现实 → **改用 Commons API 的 `list=search` + 批量 `imageinfo`** |

> 要带回架构决策：如果将来真要"一次性建库"，必须先验证**能否只取打包包里的索引/子集**，不能默认"下载打包包"是可执行方案。

### 4.3 Commons 已有 mp3 转码，且可由 URL 直接推算

```
原文件 : https://upload.wikimedia.org/wikipedia/commons/3/3d/En-us-book.ogg
转码版 : https://upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/En-us-book.ogg/En-us-book.ogg.mp3
```
前缀路径一致 → **不需要额外 API 请求**；44/44 全部命中转码版，平均 19KB，移动端友好。**不需要本地 ffmpeg 转码**。

### 4.4 美音与英音的授权结构完全不同（本轮最重要的授权发现）

| 口音 | 数量 | 来源 | 许可 | 作者 vs 上传者 | 默认判定 |
|---|---|---|---|---|---|
| **US** | 27 可用 + 1 待复核 | 个人上传（Dvortygirl 为主，`En-us-*.ogg`） | Commons 分类同时挂 **GFDL + CC BY-SA 3.0/2.5/2.0/1.0 + "License migration redundant"**（少量 **Public domain / PD-self**） | **同名**（自发布，`Credit = Own work`） | ⚠️ 需显式接受双许可才放行 |
| **UK** | 17 可用 | **Shtooka Project**（`En-uk-*.ogg`） | **CC BY 3.0 US**（14）/ **Public domain**（3） | **明确分离**：Artist=`Association Shtooka, Judith Franck`，uploader=`DerbethBot` | ✅ 自动放行 |

**执行含义**：不能写"Commons 音频都可直接用"这种规则。必须**逐条读 extmetadata**，并且把"**作者与上传者是否同一人**"作为独立信号。

### 4.5 许可字段混用，必须多字段归一 + 显式拒绝规则

实测出现的写法：`CC BY 3.0 us`、`Public domain`、`CC BY-SA 3.0`、`CC BY-SA 4.0`、`PD-self`、`GFDL`、`License migration redundant`。
PoC 的做法：把 `LicenseShortName / License / UsageTerms / Categories / Copyrighted` 一起归一，并**显式列出**：
- 拒绝：`NC` / `ND` / `All Rights Reserved` / `Fair use`
- 复核：`GFDL`、`Artist` 缺失、`Artist == uploader`

### 4.6 「能下载」≠「可以用」：授权无法确认的条目**真的没落盘**

`needs_review` 条目只在 `manifest.json` 与 `review_queue.csv` 留下证据与建议动作，**不下载**。
本轮唯一剩余待复核条目：

| 词 | 文件 | 许可 | 卡点 | 建议动作 |
|---|---|---|---|---|
| science | `File:En-us-science.ogg` | CC BY-SA 3.0 + GFDL | 分类里**没有** "License migration redundant" 迁移提示 | 打开文件页人工确认；确认不了就弃用该条（该词本就无 UK 音频，等于该词暂无真人发音） |

### 4.7 放行方式拆解：自动 vs 显式接受（44 条）

| 放行方式 | 条数 | 构成 |
|---|---|---|
| **自动放行**（许可与作者都可直接确认） | **17** | UK 14 条 CC BY 3.0 US（Shtooka）+ UK 3 条 Public domain |
| **显式接受后放行**（台账 `resolution` 列留证） | **27** | GFDL 迁移提示 + CC BY-SA：24 条 US；自发布 `Own work`：3 条 US（2×PD + 1×CC BY-SA 4.0） |

即：**61% 的白名单条目需要一次人工判断**。这个比例是"录音来源集中（美音主要来自同一批个人上传）"造成的，换词汇表会变化，但**不可能降到 0**——所以生产上必须有"复核队列 + `verified_by`"这个环节，不能只有一条自动脚本。

---

## 5. 两类"人工拍板"的法律边界（PoC 只摆证据，不代替法务）

PoC 默认**不放行**下面两类，只有显式 `--accept-dual-license` 才放行并在台账 `resolution` 列留证：

| 类型 | 本轮数量 | 事实 | 为什么默认不放行 | 若接受，留证写法 |
|---|---|---|---|---|
| **GFDL + CC BY-SA 双标注**（含 `License migration redundant`） | **24**（全部 US） | GFDL 1.3 允许把 GFDL 作品按 CC BY-SA 3.0 继续使用；Commons 分类同时挂两套许可并标注"迁移冗余" | 这是一个**法律判断**（哪套许可适用、ShareAlike 义务如何履行），不应由脚本自动认定 | `resolution = "dual-license accepted: GFDL 迁移提示 + CC BY-SA 路径有效；已留证"` |
| **自发布 `Own work`** | **3**（全部 US：2×PD + 1×CC BY-SA 4.0） | 上传者即录音者，声明 `Credit = Own work` | 手工上传场景下"同名"通常就是作者本人，但脚本无法区分"自己录的"和"转载他人冒名传的" | 仅当 `Credit = Own work` 且许可明确时放行，否则仍复核：`resolution = "...；Credit=Own work（自发布）"` |

**红线（PoC 已落实）**：`Credit ≠ Own work` 的同名上传**即使开了开关也不放行**（防"转载冒名"），单测 `test_self_published_without_own_work_still_review` 固定该行为。

### 5.1 人工复核不是"建议"，是已经做出来的一步

因为 61% 的条目必须人工拍板，PoC 里把这一步做成了**独立工具 + 独立决策文件**（而不是只写一句建议）：

| 步骤 | 命令 | 产物 |
|---|---|---|
| 1. 生成待复核清单 | `python tools/resolve_review.py --init` | `review_decisions.json`（含每条的证据 + `verdict/reviewer/reviewed_at/note` 待填） |
| 2. 人工逐条打开 `source_page_url` 核对原作者与许可，填 `accept`/`reject` | 手工编辑 | 决策记录（**与自动筛选规则分离，可审计、可回滚**） |
| 3. 应用决定（**不重新联网查元数据**，只补下载并重建台账） | `python tools/resolve_review.py --apply` | `manifest.json` / `attribution.csv`（写入 `verified_by/verified_at/resolution`）/ `review_queue.csv` |

`--apply` 的硬校验：`verdict=accept` 必须同时填 `reviewer + reviewed_at + note`，否则拒绝执行（避免"点了接受但没人负责"）。

**机制已在临时副本上实测通过**：对唯一待复核条目执行 accept → 白名单 44 → 45、US 27 → 28、`review_queue.csv` 清空、`attribution.csv` 出现 `verified_by=PoC 机制测试` 与 `reviewed_at`。
> **交付目录里的这条仍然是 `pending`**——因为"原作者是不是 Dvortygirl、CC BY-SA 3.0 是否适用于该录音"必须由你/法务在能打开 Commons 文件页的环境里确认，PoC 不代替这个判断。

---

## 6. 这个 PoC 证明了什么 / 没证明什么

**证明了**
1. 全链路可批量跑通：**找文件 → 批量取授权 → 筛选 → 下载 → SHA256 → 台账 → 可播放**，全部真实文件；
2. US/UK 双口音**真实存在**，且 **Commons 官方 mp3 转码可直接用**（44/44）；
3. 授权元数据**可程序化获取**（`LicenseShortName / Artist / Credit / UsageTerms / Categories` 都能拿到），并据此实现**可审计的自动筛选 + 复核队列**；
4. 落盘审计可验证：SHA256 一致、MP3 头可解析、时长合理、台账字段无空列；
5. 限流是**真实约束**，方案必须围绕它设计（本 PoC 一次运行只需 6 次计划内 API 请求）。

**没证明（留给下一阶段）**
1. **规模化的核对成本**：30 词 44 条里 29 条涉及人工规则；3000 词时人工工时需要实测；
2. **"Artist 就是原作者"的最终确认**：本轮读的是 extmetadata，未逐个打开 Commons 文件页与原始来源比对（这正是 `verified_by` 字段要留的活）；
3. **法务口径**：GFDL + CC BY-SA 双标注的音频能否按 CC BY-SA 使用——需要法务/作者确认，PoC 不代替法律意见；
4. **生产存储/备份/CDN**：PoC 只落本地磁盘；
5. **规模化限流下的总耗时**：44 次下载+56 次请求的耗时在本轮可接受，3000 词需要重新估算。

---

## 7. 对既有文档的回写建议（待确认后执行，本轮不改）

| 文档 | 需要更新的内容 |
|---|---|
| `docs/wordbook-phase1-research.md` §3.3 | Primary 的**执行细节**改为：Commons API（search + 批量 imageinfo）+ 自适应退避；**kaikki 打包音频路线标注为"工程代价过高，需先验证子集可行性"**；补充 US/UK 授权结构差异 |
| `docs/opensource-wordbook-mapping.md` 发音行 | License 列补充实测结论：**US 多为 GFDL+CC BY-SA 双标注、UK 为 Shtooka CC BY 3.0 US/PD**；hotlink 仍不作主链路 |
| `docs/_research/audio-pronunciation-licensing.md` | 补充本轮一手实测：Commons API 限流量级、mp3 转码可直接推算、GFDL 双标注的真实占比、kaikki 20.4GB 音频包不可逐词取 |
| 新增（建议） | `docs/wordbook-audio-poc-findings.md`：把本报告的 §4/§5 结论并入项目文档体系 |

---

## 8. 落地建议（如果你要按这个方案继续）

1. **白名单规模**：先按"孩子实际遇到的词"分批导入，**每批 100 条**；本轮的自动化流程可直接复用（`tools/poc_fetch.py` → 生产化为导入脚本）。
2. **默认策略**：GFDL/同名/无 Artist → 进复核队列，**不自动放行**；`--accept-dual-license` 的位置应改为**人工勾选后的显式标记**（生产中应落成 DB 的 `verified_by + resolution`，而不是命令行开关）。
3. **存储**：文件落自有存储，DB 存**相对 key + attribution 台账**（本 PoC 的 `attribution.csv` 列集可直接作为表结构草案）。
4. **缺失兜底**：本轮 14 个词只有单口音、1 个词待复核 → 这些就是 **Fallback（浏览器 speechSynthesis）** 的真实触发场景，产品上必须**可见标注**（"系统朗读"）。
5. **上线前必做**：把 `review_queue.csv` 里每一条的 Commons 文件页人工打开一次，确认"**原作者**"与许可，并填写 `verified_by`。

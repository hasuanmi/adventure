# Wordbook 发音 PoC · Commons 白名单音频批量可下载性验证

> **本目录是完全独立的 research 产物。**
> 不接入现有 API / Web / 数据库；不碰 Prisma、Task、WrongQuestion、Growth 或任何业务代码；
> 不引 Piper、不引云 TTS、不用商业词典 mp3；不以 hotlink 作为最终形态。
>
> 目的只有一个：**拿真实文件验证「词表 → 找音频 → 授权筛选 → 下载 → SHA256 → 本地保存 → 授权台账 → 实际播放」能不能批量跑通**，而不是因为调研结论就假设它可行。

---

## 1. 结论速览

详细数字见 `report.md`。核心回答三个问题：

1. **能不能批量跑通？** —— **能**：30 词 → Commons API 计划内 6 次请求（含重试共 56 次）→ **下载 44 个真实音频（US 27 + UK 17，824KB）**，全部是 Commons 官方 mp3 转码，每个都有 SHA256 与完整授权台账；落盘审计 0 问题；`player.html` 可在真实浏览器逐个点播。
2. **最大的障碍是什么？** —— **不是"找不到音频"，而是"授权判断"**：44 条里 **27 条（61%）** 必须先显式接受"GFDL 双标注 / 自发布 Own work"才能放行，只有 17 条能自动放行；另有 1 条仍待人工复核。此外 Commons API 匿名配额极紧（**突发第 5 个请求就 429**）。
3. **能不能直接照搬调研方案？** —— **不能**。调研里"批量从 kaikki 音频包下载"这条路在 PoC 中被证伪（见 §4.2：20.4GB 音频包 / 2.8GB JSONL，无按词入口）。

---

## 2. 目录结构

```
research/wordbook-audio-poc/
├── README.md                ← 本文件（目标 / 边界 / 复现 / 结论）
├── report.md                ← 最终报告（统计、逐条发现、授权结论、风险与建议）
├── manifest.json            ← 全量记录（含被拒绝/待复核条目 + 证据 + file_url）
├── attribution.csv          ← 白名单音频的署名台账（可直接生成「关于/致谢」页）
├── review_queue.csv         ← needs_review 条目 + 建议动作（交人工拍板）
├── review_decisions.json    ← 人工决策记录（verdict/reviewer/reviewed_at/note）
├── stats.json               ← 统计口径落盘
├── player.html              ← 本地播放验证页（真实浏览器逐个点播）
├── audio/us/*.mp3|ogg       ← 美音（仅通过授权筛选的文件）
├── audio/uk/*.mp3|ogg       ← 英音（同上）
└── tools/
    ├── poc_fetch.py         ← 主流程：找文件 → 取元数据 → 授权筛选 → 下载 → SHA256 → 写台账
    ├── test_poc.py          ← 28 项单测：文件名精确匹配、许可归一、授权筛选、mp3 头解析
    ├── resolve_review.py    ← **人工复核工具**：--init 生成清单 / --apply 应用决定并重建台账
    ├── audit.py             ← 落盘审计：重算 SHA256、校验头部可解析、台账字段完整性
    ├── build_player.py      ← 生成本地播放验证页
    ├── diag429.py           ← 429 来源诊断（API vs upload 主机）
    └── probe.py             ← 通道探测（kaikki / Commons API / Wiktionary / CDN）
```

## 3. 怎么跑（PowerShell，用捆绑 Python）

```powershell
$py = "C:\Users\48489\.wanwuyouxu\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe"
$env:PYTHONIOENCODING = "utf-8"

# 1) 单测（先固化判定口径，再跑网络）
& $py research\wordbook-audio-poc\tools\test_poc.py

# 2) 主流程（默认保守：GFDL/同名作者 -> needs_review，不下载）
& $py research\wordbook-audio-poc\tools\poc_fetch.py

# 3) 显式接受「双许可 + 迁移提示」与「Own work 自发布」，并在台账留证
& $py research\wordbook-audio-poc\tools\poc_fetch.py --accept-dual-license

# 4) 落盘审计（重算 SHA256 / 校验头部 / 台账完整性）
& $py research\wordbook-audio-poc\tools\audit.py

# 5) 人工复核（PoC 实测：61% 的条目必须人工拍板，这一步不能省）
& $py research\wordbook-audio-poc\tools\resolve_review.py --init    # 生成 review_decisions.json
#    ...人工编辑：逐条打开 source_page_url 核对原作者与许可，填 verdict/reviewer/reviewed_at/note
& $py research\wordbook-audio-poc\tools\resolve_review.py --apply   # 补下载 + 重建台账（不重复联网查元数据）

# 6) 生成播放验证页，然后用浏览器打开
& $py research\wordbook-audio-poc\tools\build_player.py
start research\wordbook-audio-poc\player.html
```

参数：`--no-download`（只筛选）、`--delay`（Commons API 起步间隔，默认 12s）、`--max-bytes`。

**依赖：仅 Python 标准库**（无 requests、无 ffmpeg、无 pydub）。

---

## 4. 关键实测发现（这才是这次 PoC 的价值）

### 4.1 Commons API 的匿名配额比预期紧得多

| 观测 | 数据 |
|---|---|
| 突发请求（1.5s 间隔） | **第 5 个请求开始 429** |
| 稳定 12s 间隔 | **连续 12 次全部 200** |
| `upload.wikimedia.org` 下载 | 配额宽松：`x-ratelimit-limit: 600000, 600000;w=60`、`x-ratelimit-remaining: 599999` |
| 转码 mp3 首次生成 | 也会 429（按需生成，不走 CDN 缓存）→ 脚本回退原始 ogg |

**设计后果**：PoC 必须把 API 请求压到一次运行 ~8 次——
「1 次 search 覆盖 6 个词」+「1 次 imageinfo 取 50 个文件的授权元数据」，
并采用自适应间隔（起步 12s，连续成功再降到 4s；429 则翻倍到 120s 上限）。

### 4.2 「kaikki 打包音频」这条路被证伪

| 通道 | 实测 |
|---|---|
| kaikki 按词入口 | **不存在**：`kaikki.org/dictionary/English/index.html` 只有 `kaikki.org-dictionary-English.jsonl`（raw JSONL 23.9GB / gz 2.8GB） |
| kaikki 音频包 | `wiktionary-audios.tar` = **20.4GB**（约 94.2 万个文件） |
| 结论 | 为 30 个词下载 20GB 不现实 → **PoC 放弃该通道**，改用 Commons API 的 `list=search`（1 请求覆盖多词）+ 批量 `imageinfo` |

> 这条要带回架构决策：**"用 kaikki 打包音频批量建库"在工程上成立，但代价是 20GB 级下载与解包；如果要走这条路，应先做"打包包内索引"的可行性验证，而不是逐词抓。**

### 4.3 Commons 已有 mp3 转码，不需要本地转码

```
原文件: https://upload.wikimedia.org/wikipedia/commons/3/3d/En-us-book.ogg
转码版: https://upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/En-us-book.ogg/En-us-book.ogg.mp3
```
可由原文件 URL **直接推算**（前缀路径一致，无需再发一次 videoinfo 请求）。
转码版体积约 20–28KB/词，移动端友好。

### 4.4 美音与英音的授权情况**完全不同**（本次最重要的授权发现）

| 口音 | 典型来源 | 许可 | 作者可确认性 | 默认判定 |
|---|---|---|---|---|
| **US** | Dvortygirl 等个人上传（`En-us-*.ogg`） | Commons 分类同时挂 **GFDL + CC BY-SA 3.0/2.5/2.0/1.0 + "License migration redundant"**；另有部分 **Public domain / PD-self** | Artist 与 uploader **同名**（自发布 "Own work"） | ⚠️ **needs_review**（GFDL 属于 copyleft，音频再分发义务复杂；且需人工确认 Artist 就是原作者） |
| **UK** | **Shtooka Project**（`En-uk-*.ogg`） | **CC BY 3.0 US** 或 **Public domain** | Artist = `Association Shtooka, Judith Franck`，uploader = `DerbethBot` → **作者与上传者明确分离** | ✅ **allowed**（自动放行） |

**这直接推翻了"Commons 音频都可以直接用"的简化假设**：能不能自动放行取决于**具体文件的具体标注**，必须逐条读 extmetadata。
PoC 因此提供两条路径：
- 默认：GFDL/同名作者 → `needs_review`（不下载，进 `review_queue.csv`）；
- `--accept-dual-license`：显式接受「GFDL + CC BY-SA 且含迁移提示」和「Own work 自发布」，**并在 `attribution.csv` 的 `resolution` 列留证**（如 *GFDL 1.3 允许按 CC BY-SA 3.0 使用；已留证*）。

### 4.5 许可字段是混用的，不能只看一个字段

实测出现的写法：`CC BY 3.0 us` / `Public domain` / `CC BY-SA 3.0` / `CC BY-SA 4.0` / `PD-self` / `GFDL` / `License migration redundant`。
所以 PoC 把 `LicenseShortName`、`License`、`UsageTerms`、`Categories`、`Copyrighted` 一起归一，并显式列出**拒绝规则**（NC / ND / All Rights Reserved / Fair use）与**复核规则**（GFDL / Artist 缺失 / Artist==uploader）。

### 4.6 授权无法确认时**真的没下载**

`needs_review` 的条目一律不落盘，只在 `manifest.json` 与 `review_queue.csv` 留下证据与建议动作。
这是"不因为能下载就默认可用"的落地检查。

### 4.7 覆盖率（30 词样本）

统计口径分两层，避免自欺：
- **input 层面**（Commons 上是否存在该口音文件）：`stats.json → file_exists`
- **output 层面**（通过授权筛选并成功下载）：`stats.json → usable`

具体数字见 `report.md`（每次运行会更新）。

---

## 5. 这个 PoC 证明了什么 / 没证明什么

**证明了**：
1. 「Commons API 找文件 → 批量取授权 → 筛选 → 下载 → SHA256 → 台账」这条流水线**可批量跑通**，且全部是真实文件；
2. Commons 音频**确实存在 US/UK 双口音**，且**mp3 转码可直接用**；
3. 授权信息**可程序化获取**（extmetadata 里有 `LicenseShortName` / `Artist` / `UsageTerms` / `Categories`）；
4. Commons API 有**真实且紧的限流**，批量方案必须围绕"少请求 + 自适应退避"设计。

**没证明**（必须留到下一阶段）：
1. 大规模（3000+ 词）时的**人工核对成本**与**限流下的总耗时**；
2. 每个文件的 `author` 是否 100% 等于 Commons 文件页的"原作者"（本 PoC 只读到 extmetadata 的 `Artist`，未逐个打开文件页比对）；
3. **法务口径**：GFDL + CC BY-SA 双标注的音频，我们按 CC BY-SA 使用是否足够（PoC 只是把选项与证据摆出来，不代替法律意见）；
4. 生产形态的存储/备份/CDN 方案（PoC 只落本地磁盘）。

---

## 6. 与主文档的关系

- 本 PoC 是 `docs/wordbook-phase1-research.md` §3.3「Primary：Commons 授权白名单音频库」的**可执行验证**；
- 结论若与调研冲突，**以本 PoC 的实测为准**，并回写：
  - `docs/wordbook-phase1-research.md`（发音方案）
  - `docs/opensource-wordbook-mapping.md`（发音行）
  - `docs/_research/audio-pronunciation-licensing.md`（kaikki 通道、GFDL 双标注、限流量级）

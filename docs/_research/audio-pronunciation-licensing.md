# 发音音频与 License 核查（单词本功能前置调研）

> 调研日期：**2026-10-06**｜调研人：audio-license-auditor｜交付物：本文件（`docs/_research/audio-pronunciation-licensing.md`）
> 规范对齐：表格与证据风格对齐 `docs/opensource-mapping.md`、`docs/THIRD_PARTY_NOTICES.md`（证据优先 / 禁止臆断 / 无法确认即写「无法确认」）。
>
> **本文件方法论声明（必读）**：本次调研以**可核查的一手页面**为准，凡引用均给出 URL + 英文原文。本次运行环境中部分域名无法直连（`*.wikimedia.org`、`*.wikipedia.org`、`*.wiktionary.org`、`cloud.google.com`、`huggingface.co` 均返回连接失败），因此对这些来源使用了**官方归档副本**（Archive-It Wayback）与 **HuggingFace 镜像站**。凡引用归档版本，均在证据小节中**标注抓取日期与版本局限**。所有「实测」结论都注明是本次运行中真实发起的请求与返回码。

---

## 〇、术语纪律：五件事必须分开（本文件严格遵守）

| 概念 | 含义 | 不能推出什么 |
|---|---|---|
| 免费使用 | 现在不付钱就能用 | ≠ 可商用 ≠ 可缓存 ≠ 可再分发 |
| 开源 | 代码有 OSI 许可、可看可改 | ≠ 音频数据也开源；≠ 可商用（GPL≠数据许可） |
| 可商用 | 许可/条款明确允许商业用途 | ≠ 允许把音频文件再分发 |
| 可缓存到自建服务器 | 许可允许复制到我们服务器 | ≠ 允许把副本对外分发 |
| 可重新分发音频文件 | 许可允许把音频本体给第三方 | ≠ 允许把音频当我们的独立资产出售 |
| attribution 要求 | 必须署名/注明许可 | 与「是否收费」无关，CC0/PD 无此要求 |

---

## 一、「来源 × 属性」矩阵表

> 风险等级：**低**=许可明确且干净；**中**=许可明确但有义务（署名/同许可）或来源不稳定；**高**=授权不干净、条款无法确认、或依赖不可靠；**禁止**=已确认与商用冲突或无法确认而不得使用。
> 「可缓存」「可再分发」列指**音频文件本体**。

| # | 来源 | 真人 or TTS | 美式 | 英式 | 免费 | 开源 | 可商用 | 可缓存到自建服务器 | 可重新分发音频 | attribution 要求 | 结论风险等级 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Wiktionary / Wikimedia Commons 发音音频（`upload.wikimedia.org`） | **多为志愿者真人录音，但无法逐文件确认**（Commons 上也存在合成音频） | 有（`En-us-*.ogg`） | 有（`En-uk-*.ogg`） | 是 | 音频本身非「开源软件」，属自由许可内容 | **是**（Commons 只接纳允许商用的许可） | **是**（需履行该文件许可义务） | **是** | **依文件而异**：CC0/PD 无需；CC BY / CC BY-SA 必须署名 + 注明许可 + 标明是否修改 | **中**（必须逐文件核对 author/license；WMF 明确不担保授权正确性） |
| 2 | Commons 音频 · 我们**下载后自托管**（推荐主方案） | 同 #1 | 同 #1 | 同 #1 | 是 | — | **是** | **是**（这正是本方案） | **是** | 同 #1，需在产品内提供来源/许可说明 | **中**（义务可满足；建议不改动音频以避免 ShareAlike） |
| 3 | Free Dictionary API 服务（`api.dictionaryapi.dev`）**运行时调用** | 音频来自 Commons（真人为主） | 有（`-us.mp3`） | 有（`-uk.mp3`） | 是 | **否**（服务不开源；仓库代码 GPL-3.0，线上实现与仓库不一致） | **无法确认**（未找到任何 ToS/商用声明） | **不推荐依赖**（其 `media` 音频为第三方自建缓存，我们只是跳转） | **否**（不应把其 URL 当分发源） | 响应里含 `license.name/url` + `sourceUrl`，结构上可支持归因，但部分条目缺失 | **高**（稳定性实测差 + 条款缺失 + 授权链条不透明） |
| 4 | Free Dictionary API **仓库代码**（github.com/meetDeveloper/freeDictionaryAPI） | — | — | — | 是 | **是（GPL-3.0）** | 代码可商用但**有 copyleft 义务** | — | — | 必须保留版权与 GPL 全文 | **高**（一旦复制其代码进我们仓库，整个组合作品需 GPL-3 授权，与闭源商业冲突） |
| 5 | Piper TTS 代码 · `rhasspy/piper`（老仓库） | TTS | 支持（voice 决定） | 支持（voice 决定） | 是 | **是（MIT）** | **是** | 是（本地生成，输出可自缓存） | 生成的 wav 可随产品分发（受所用 voice 授权约束） | 保留 MIT 版权与许可声明 | **低**（但**仓库已 archived**，不再维护） |
| 6 | Piper TTS 代码 · `OHF-Voice/piper1-gpl`（现行主线） | TTS | 同上 | 同上 | 是 | **是（GPL-3.0）** | 代码可商用但**强 copyleft** | 是 | 同上 | 保留版权与 GPL 全文，衍生物需 GPL | **高**（引入/修改其代码会把我们产品拖入 GPL；作为独立服务进程/HTTP 调用的隔离效果**需法务确认，本文件不作结论**） |
| 7 | Piper voice · `en_US-lessac-medium` | TTS | ✅ 美式 | — | 是 | 模型文件在 HF，**授权随数据集** | **否（数据集为研究许可，明确排除商用）** | 技术上可缓存，**但不得商用** | 同上 | 需遵守 Blizzard/Lessac 研究许可（含不转授权等） | **禁止（商用场景）** |
| 8 | Piper voice · `en_US-ljspeech-medium` | TTS | ✅ 美式 | — | 是 | 模型文件 | **是**（数据集为 public domain） | 是 | 是 | 无强制署名（建议保留 provenance） | **低**（推荐作为可商用 fallback voice；建议仍走法务抽检） |
| 9 | Piper voice · `en_GB-alan-medium` | TTS | — | ✅ 英式 | 是 | 模型文件 | **无法确认 / 高风险**（上游 `apope_low` 的 LICENSE 写明 “All Rights Reserved”） | 不建议 | 不建议 | — | **禁止（商用场景）** |
| 10 | Google Cloud TTS | TTS（WaveNet/Neural/Standard） | ✅ | ✅ | 有免费额度（**2018 归档值**，现行值无法确认） | 否 | **无法确认**（现行 Service Specific Terms 不可访问） | **无法确认** | **无法确认** | 未确认 | **无法确认 → 不得作为缓存方案** |
| 11 | ElevenLabs TTS | TTS | ✅ | ✅ | 有免费额度（额度数值本次未取证） | 否 | **免费层：明确禁商用**；付费层：可商用 | **无法确认**（ToS 只明确「部分服务允许下载 Output 并在服务外使用」） | **无法确认** | 需披露 AI 合成（其政策框架） | **中→高**（免费层禁商用；缓存/再分发未明确） |
| 12 | Azure AI Speech TTS | TTS | ✅ | ✅ | 免费层额度：**无法确认（本次未取证）** | 否 | **倾向可商用但条款原文未取得**（见 §5.3） | **无法确认** | **无法确认** | **有明确义务**：必须披露「合成语音」等 AI 生成属性 | **中（必须披露）→ 高（缓存/再分发行无法确认）** |
| 13 | 浏览器 Web Speech API（`window.speechSynthesis`） | TTS（平台语音，可能含网络语音/端上语音） | 依设备语音 | 依设备语音 | **是（零成本）** | 是（浏览器实现的开放 API；语音本体非开源资产） | **是**（浏览器能力，无需授权） | **否——拿不到音频字节** | **否** | 无 | **低（作为交互 fallback）/ 不可用于音频资产化** |

---

## 二、逐条回答（A–J）

| # | 问题 | 结论 | 依据（详见第三节） |
|---|---|---|---|
| **A** | 是否存在现成免费英语单词发音音频？ | **存在，且规模很大**（Wikimedia Commons 收录大量英语发音音频；Wiktextract 官方文档确认 `audio` 字段即 Commons 文件名） | §3.1 / §3.2 |
| **B** | 来自哪里？ | **Wikimedia Commons**（文件实体在 `upload.wikimedia.org`）；Wiktionary 条目通过 `{{audio}}` 之类模板引用 Commons 文件；Free Dictionary API 返回的音频**也是 Commons 文件**（其响应内 `sourceUrl` 指向 `commons.wikimedia.org/w/index.php?curid=…`），只是**由它自己的域名代理分发** | §3.1 / §3.2 / §3.3 |
| **C** | 真人录音还是 TTS？ | **绝大多数为志愿者真人录音**（Wiktionary 词条标注 “Audio (UK)/(US)”），但**无法逐文件确认**：Commons 文件页在本环境不可直连，且 Commons 并不禁止用合成语音上传；Free Dictionary API 部分条目 `license` 字段缺失，更无法追溯。**结论：逐文件确认** | §3.1 / §3.3 |
| **D** | 美式/英式是否都有？ | **常见词通常 UK/US 双份都有**（`hello` 词条：Audio (UK) `File:En-uk-hello.ogg` + Audio (US) `File:en-us-hello.ogg`，且 5 个义项各有 UK/US）；Free Dictionary API 实测 `hello` 返回 `-au.mp3`/`-uk.mp3`、`cat` 返回 `-uk.mp3`/`-us.mp3`。**但覆盖率因词而异**：实测 `school` 只返回 `-uk.mp3`；`hello` 的第三个 phonetics 项 `audio:""`（缺音频） | §3.1 / §3.3 |
| **E** | 能否在线播放（hotlink/CDN 直链）？ | **技术上可以，但 Commons 官方明确“不推荐”**：原文 “Directly using a Commons file via embedding its URL ("hotlinking") is also possible, but is not recommended.” 因此**可作补充源，不作唯一主链路** | §3.2（Commons:Reusing） |
| **F** | 能否缓存？ | **能**。Commons 只接纳满足「允许再分发/允许商用」的自由许可，其政策原文把 “Republication and distribution must be allowed.” 列为硬条件；CC0/PD 文件亦可自由复制。**义务**：署名（若许可要求）+ 许可名称与链接 + 标明是否修改 + 不加额外限制 | §3.1 / §3.2 |
| **G** | 能否商用？ | **Commons 音频：是**（原文 “Commercial use of the work must be allowed.” 且 “Media licensed under non-commercial only licenses are not accepted either.”）。**但**：① 必须逐文件看该文件自己的许可；② WMF 明确不为授权正确性担保；③ 若含人声还需注意人格权等非版权限制 | §3.1 |
| **H** | 能否把音频 URL 存进我们数据库？ | **可以存，但不建议把第三方 URL 当播放主链路**。URL 本身是事实信息；但存 `upload.wikimedia.org` 直链等于把 Wikimedia 当 CDN（官方不推荐），存 `api.dictionaryapi.dev/media/...` 则把产品可用性绑在一个实测 522/404 频发的第三方上。**建议入库字段**：`source_file_name`、Commons 文件页 URL、`license_name`、`license_url`、`author`、`checksum`；播放 URL 用**我们自己的** | §3.3 / §3.4 |
| **I** | 能否下载到我们自己的服务器？ | **可以**（自由许可/PD 允许复制与再分发）。**两点工程约束**：① Wiktextract 官方提示逐个下载“puts unnecessary load on Wikimedia servers”，并指出 kaikki.org 提供**打包音频批量下载**（.ogg + .mp3），应走批量而非逐词抓取；② 需逐文件核对许可，且 WMF 不担保授权正确性 | §3.2（Wiktextract） |
| **J** | 词典没有音频时有没有可靠 TTS fallback？ | **有，分两级**：① **服务端 Piper TTS**（本地推理、输出可自缓存；**必须选可商用 voice**，如 `en_US-ljspeech-medium`，禁用 lessac / en_GB-alan）；② **客户端 Web Speech API**（零成本、支持面广，但**拿不到音频字节、无法缓存**，音色因设备而异）。云 TTS（Google/Azure/ElevenLabs）**不作为「缓存 + 再分发」方案**——条款无法确认 | §3.5 / §3.6 / 第四节 |

---

## 三、每个来源的证据小节

### 3.1 Wiktionary 发音音频 → 文件实际来自 Commons（可确认）

**证据 1：Wiktionary 词条实际渲染出 Commons 文件**
- URL（在线）：`https://en.wiktionary.org/wiki/hello`
- URL（本次实际抓取的归档副本，2017-10-11 抓取）：`https://wayback.qa-archive-it.org/all/20171011194139/https://en.wiktionary.org/wiki/hello`
- 原文摘录（渲染结果）：
  > `Audio (UK)` … `(file)` → `File:En-uk-hello.ogg`
  > `Audio (US)` … `(file)` → `File:en-us-hello.ogg`
  > （并在 5 个义项表格中分别给出 `File:en-uk-hello-1..5.ogg` / `File:en-us-hello-1..5.ogg`）
- 中文解释：Wiktionary 词条里的发音播放器指向的是**文件命名空间**的音频（`File:` 前缀），即**媒体仓库的文件**，而非 Wikt 本地内容。
- 可确认：**是**（US/UK 两份、且多义项多文件）。

**证据 2：Wiktextract 官方文档明确 `audio` = Commons 文件，并给出 `upload.wikimedia.org` 直链形态**
- URL：`https://raw.githubusercontent.com/tatuylonen/wiktextract/master/README.md`（抓取成功，HTTP 200）
- 原文摘录：
  > `audio` - name of sound file in WikiMedia Commons
  > `ogg_url` - URL for an OGG Vorbis format sound file
  > `mp3_url` - URL for an MP3 format sound file
  > Note that Wiktionary audio files are available for bulk download at https://kaikki.org/dictionary/rawdata.html. … Downloading them individually takes serveral days and puts unnecessary load on Wikimedia servers.
- 同文档给出的真实抽取样例（`thrill`）：
  > `"mp3_url": "https://upload.wikimedia.org/wikipedia/commons/transcoded/d/db/En-us-thrill.ogg/En-us-thrill.ogg.mp3"`
  > `"ogg_url": "https://upload.wikimedia.org/wikipedia/commons/d/db/En-us-thrill.ogg"`
- 中文解释：① 模板层（`{{audio}}` 一类）填入的是**Commons 文件名**；② 文件实体位于 `upload.wikimedia.org`（含服务端转码的 `.mp3` 版本）；③ 官方建议**批量下载**而非逐词抓取。
- 可确认：**是**。

**证据 3（本次局限，必须记录）：`{{audio}}` / `{{audio-IPA}}` 模板文档原文未取得**
- 尝试并失败：`https://en.wiktionary.org/wiki/Template:audio/doc`（直连失败）、
  `https://wayback.qa-archive-it.org/all/2019/https://en.wiktionary.org/wiki/Template:audio/documentation`（HTTP 404：该页未被归档）、
  `https://wayback.qa-archive-it.org/all/2019/https://en.wiktionary.org/wiki/Template:audio-IPA`（HTTP 404：该页未被归档）。
- 因此：**模板文档原文引用 → 无法确认**。但「模板参数 = Commons 文件名 → 实体文件在 `upload.wikimedia.org`」这一链条由证据 1 + 证据 2 独立确认，**模板→Commons 的结论成立**。
- 另外：`{{audio-IPA}}` 只是「同时展示音频 + 对应 IPA」的包装，本次**未能取得其文档原文**，无法确认其参数细节。

---

### 3.2 Commons 的许可制度、再利用义务、Hotlink、User-Agent 与限流（可确认，但为归档版本）

> **版本局限**：以下 Commons 政策与 Meta 政策均引用 Archive-It Wayback 的**历史抓取版本**（抓取日期在每条中标注）。现行版本在本环境无法直连，条款措辞可能已更新；**正式落地前应在可联网环境复核现行版本**。

**证据 A：Commons:Licensing——只接纳允许商用的自由许可**
- URL（本次抓取，2018-09-19 抓取）：`https://wayback.qa-archive-it.org/all/20180919063644/https://commons.wikimedia.org/wiki/Commons:Licensing`
- 原文摘录：
  > Wikimedia Commons only accepts **free content**, that is, images and other media files that are not subject to copyright restrictions which would prevent them being used *by anyone, anytime, for any purpose*.
  > All copyrighted material on Commons (not in the public domain) must be licensed under a *free license* that specifically and irrevocably allows anyone to use the material for any purpose…
  > - Republication and distribution *must* be allowed.
  > - Publication of derivative work *must* be allowed.
  > - **Commercial use of the work *must* be allowed.**
  > - The license *must* be perpetual (non-expiring) and non-revocable.
  > Media licensed under *non-commercial only* licenses are not accepted either.
  > … it is the responsibility of reusers to ensure that the use of the media is according to the license and violates no applicable law.
- 中文解释：Commons 上**不存在**「仅非商业」或「仅教育用途」的媒体；因此「可商用」对 Commons 媒体是**制度性成立**的。但每个文件的具体许可（CC0 / CC BY / CC BY-SA / PD / 多重许可）不同，义务也不同。
- 可确认：**是**（就 2018 版政策）。**逐文件许可**仍需看文件页。

**证据 B：Commons:Licensing——文件页必须标注 License / Source / Author**
- 同上 URL，原文摘录：
  > Specifically, the following information *must* be given on the description page, regardless if the license requires it or not:
  > - The **License** that applies to the material. …
  > - The **Source** of the material. …
  > - The **Author/Creator** of the image or media file. …
- 中文解释：这解释了为什么 Free Dictionary API 的响应里会带 `sourceUrl` + `license`（它把 Commons 文件页字段搬了出来）。
- 可确认：**是**。

**证据 C：Commons:Licensing——GFDL 混用的真实边界（≥2018-10-15 的视听内容不得 GFDL 单一许可）**
- 同上 URL，原文摘录：
  > GFDL is not permitted as the only license where all of the following are true:
  > - The content was licensed on or after 15 October 2018. …
  > - The content is primarily a photograph, painting, drawing, **audio** or video.
  > - The content is not a software logo, diagram or screenshot …
- 中文解释：**「CC BY-SA / CC0 / GFDL / PD 混用」确实存在**，但 2018-10-15 之后上传的**音频**不允许只挂 GFDL。老文件仍可能 GFDL（GFDL 要求随附许可全文）。
- 可确认：**是**（政策层面）；**具体某文件属于哪一类 → 需看文件页（本环境无法逐页确认）**。

**证据 D：Commons:Reusing content outside Wikimedia——署名义务、Hotlink 立场、WMF 免责**
- URL（2018-09-19 抓取）：`https://wayback.qa-archive-it.org/all/20180919063642/https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia`
- 原文摘录：
  > Content under open content licenses may be reused without any need to contact the licensor(s), but just keep in mind that: **some licenses require that the original creator be attributed**; **some licenses require that the specific license be identified** when reusing (including, in some cases, stating or linking to the terms of the license); **some licenses require that if you modify the work, your modifications must also be similarly freely licensed**…
  > While the copyright and licensing information supplied for each image is believed to be accurate, **the Wikimedia Foundation does not provide any warranty regarding the copyright status or correctness of licensing terms.** If you decide to reuse files from Commons, you should verify the copyright status of each image just as you would when obtaining images from other sources.
  > Almost all images and other media on Wikimedia Commons are under some kind of free license (usually CC-BY, CC-BY-SA, or GFDL…) or in the public domain. **Each media file has its licensing specified on its file description page.**
  > **Hotlinking or InstantCommons:** … Directly using a Commons file via embedding its URL ("hotlinking") is also possible, **but is not recommended.**
  > … it is the content creator who must be credited, **not the uploader**.
- 中文解释：① 复用免许可联系，但**义务随许可而定**；② WMF **不担保**授权正确性（→ 我们必须自己核对）；③ **hotlink 可行但官方不推荐**（回答 E）；④ 署名对象是**原作者**而非上传者（这一点很容易做错）。
- 可确认：**是**（2018 版）。

**证据 E：Wikimedia Terms of Use——再利用的署名方式（引用 2012 版，现行版无法访问）**
- URL（2012-02-28 抓取）：`https://wayback.qa-archive-it.org/all/20120228041516/http://wikimediafoundation.org/wiki/Terms_of_Use`
- 原文摘录：
  > To re-distribute a text page in any form, provide credit to the authors either by including a) a hyperlink (where possible) or URL to the page or pages you are re-using, b) a hyperlink (where possible) or URL to an alternative, stable online copy which is freely accessible, which conforms with the license, and which provides credit to the authors in a manner equivalent to the credit given on this website, or c) through a list of all authors.
  > Please note that these licenses *do* allow commercial uses of your contributions, as long as such uses are compliant with the terms.
  > *Re-use of non-text media:* Where not otherwise noted, non-text media files are available under various free culture licenses, consistent with the Wikimedia Foundation Licensing Policy. **Please view the media description page for details about the license of any specific media file.**
- 重要局限：该抓取是 **2012 年的旧版 ToU**（当时正文许可写 CC BY-SA 3.0 + GFDL）；**现行 ToU（`foundation.wikimedia.org/wiki/Policy:Terms_of_Use`）在本环境无法访问**，Archive-It 无该页存档（实测 404）。因此：**现行 ToU 原文 → 无法确认**；但「按文件页确认许可」「署名三种方式」这一实质要求在新版中延续（新版为 §7 Licensing of Content，本次**未能取证原文**，故不作条款级引用）。
- 可确认：**部分**（旧版原文可确认；现行版原文无法确认）。

**证据 F：Wikimedia User-Agent policy——必须带可联系信息的 UA**
- URL（2017-10-14 抓取）：`https://wayback.qa-archive-it.org/all/20171014055739/https://meta.wikimedia.org/wiki/User-Agent_policy`
- 原文摘录：
  > As of February 15, 2010, Wikimedia sites require a **HTTP User-Agent header** for all requests.
  > *Scripts should use an informative User-Agent string with contact information, or they may be IP-blocked without notice.*
  > Do not copy a browser's user agent for your bot… Do not use generic agents such as "curl", "lwp", "Python-urllib", and so on.
  > User-Agent: MyCoolTool/1.1 (http://example.com/MyCoolTool/; MyCoolTool@example.com) BasedOnSuperLib/1.4
- 中文解释：若我们抓取 Wikimedia API/文件，**必须**设置形如 `familywordbook/1.0 (https://<our-domain>/; dev@<our-domain>)` 的 UA，且不要伪装浏览器。**注意**：该文本只约束**请求 Wikimedia 服务器**；如果我们把音频下载到自建服务器后由自己分发，就不再受此约束（也不再给 Wikimedia 添负载，这是 Commons/Wiktextract 都鼓励的方向）。
- 可确认：**是**（2017 版）。

**证据 G：MediaWiki API:Etiquette——无硬性读限流，但要求串行 + 礼貌**
- URL（2017-10-18 抓取）：`https://wayback.qa-archive-it.org/all/20171018092820/https://www.mediawiki.org/wiki/API:Etiquette`
- 原文摘录：
  > There is no hard and fast limit on read requests, but we ask that you be considerate and try not to take a site down. Most system administrators reserve the right to unceremoniously block you if you do endanger the stability of their site.
  > If you make your requests **in series rather than in parallel** … then you should definitely be fine. Also try to combine things into one request.
  > ### User-Agent header — Use a descriptive `User-Agent` header that includes your application's name and potentially your email address if appropriate.
- 参考（**二手**，用于交叉印证现行数值）：`https://raw.githubusercontent.com/api-evangelist/wikimedia/refs/heads/main/rate-limits/mediawiki-action-api.yml`（2026-06-13 记录）称「读请求无硬限流但应串行；写请求受 site 配置限流；list/property 查询单次 ≤500 项；`titles` 批量 ≤50 个」——**这是第三方整理，非 Wikimedia 官方原文**，仅作参考。
- 可确认：**是**（2017 版官方原文）；现行版原文 → **无法确认**。

**小结（对本站 3.2 的判定）**：Commons 音频的「可商用 / 可缓存 / 可再分发」在**制度层面可确认**；「某一个具体文件」的许可与作者**必须逐文件核对**，本环境无法访问 Commons 文件页（直连失败 + Archive-It 未收录 `File:En-us-hello.ogg`，实测 404），因此**具体文件的许可字段 → 无法通过本次一手取证确认**（改用 §3.3 的 API 侧证据间接确认「同一批文件存在多种许可」）。

---

### 3.3 Free Dictionary API（github.com/meetDeveloper/freeDictionaryAPI）（关键：高风险的第三方）

**证据 A：仓库 LICENSE = GPL-3.0（可确认）**
- URL：`https://raw.githubusercontent.com/meetDeveloper/freeDictionaryAPI/master/LICENSE`（HTTP 200）
- 原文摘录（首行）：
  > GNU GENERAL PUBLIC LICENSE / Version 3, 29 June 2007
- 交叉印证（GitHub API）：`https://api.github.com/repos/meetDeveloper/freeDictionaryAPI` → `"license":{"key":"gpl-3.0","name":"GNU General Public License v3.0","spdx_id":"GPL-3.0"}`
- 中文解释：**代码**是 GPL-3.0。我们若**只是 HTTP 调用**它的服务、不复制其代码，GPL 的 copyleft 不当然传染到我们的代码；但我们若把它的代码/派生代码放进仓库，则整个作品需按 GPL-3 发布（与闭源商业冲突）。**这一点必须写进开发红线。**
- 可确认：**是**。

**证据 B：线上 API 返回的 audio 字段主机 = 它自己；`sourceUrl` = Commons；许可为多种（可确认，实测）**
- URL（本次实测，2026-10-06）：
  - `https://api.dictionaryapi.dev/api/v2/entries/en/hello` → HTTP 200
  - `https://api.dictionaryapi.dev/api/v2/entries/en/cat` → HTTP 200
  - `https://api.dictionaryapi.dev/api/v2/entries/en/book` → HTTP 200
  - `https://api.dictionaryapi.dev/api/v2/entries/en/school` → HTTP 200
- 原文摘录（`hello`，逐字）：
  > `"audio":"https://api.dictionaryapi.dev/media/pronunciations/en/hello-au.mp3","sourceUrl":"https://commons.wikimedia.org/w/index.php?curid=75797336","license":{"name":"BY-SA 4.0","url":"https://creativecommons.org/licenses/by-sa/4.0"}`
  > `"audio":"https://api.dictionaryapi.dev/media/pronunciations/en/hello-uk.mp3","sourceUrl":"https://commons.wikimedia.org/w/index.php?curid=9021983","license":{"name":"BY 3.0 US","url":"https://creativecommons.org/licenses/by/3.0/us"}`
  > `{"text":"/həˈloʊ/","audio":""}` ← **缺音频的样例**
- 原文摘录（`cat`，逐字）：
  > `-uk.mp3` → license `BY 3.0 US`；`-us.mp3` → `"sourceUrl":"https://commons.wikimedia.org/w/index.php?curid=187316","license":{"name":"BY-SA 3.0","url":"https://creativecommons.org/licenses/by-sa/3.0"}`
- 原文摘录（`book`，逐字）：
  > `-uk.mp3` → license `BY 3.0 US`；`-us.mp3` → `"sourceUrl":"https://commons.wikimedia.org/w/index.php?curid=380110"` ← **该条没有 license 字段**
- 中文解释与结论：
  1. **音频 URL 主机是 `api.dictionaryapi.dev`（它自建的分发/缓存），不是 Wikimedia**。
  2. **音频本体来自 Wikimedia Commons**（`sourceUrl` 指向 `commons.wikimedia.org/…?curid=…`）。
  3. **同一批文件的许可确实混用**：`BY-SA 4.0`、`BY 3.0 US`、`BY-SA 3.0` 三种都出现 → 印证「不同文件不同授权」。
  4. **有文件缺 license 字段**（`book-us`，curid=380110）→ 归因链断裂，**该文件许可无法确认**。
  5. `hello` 的 US 项 `audio:""` → **词典有词条但可能没音频**（fallback 必需性的直接证据）。
- 可确认：**是**（以上均为本次实测原文）。

**证据 C：仓库开源代码与线上行为不一致 —— 音频抓取来源不同（严重）**
- URL：`https://raw.githubusercontent.com/meetDeveloper/freeDictionaryAPI/master/modules/dictionary.js`（HTTP 200）
- 原文摘录：
  > `let url = new URL('https://www.google.com/async/callback:5493');`
  > `audio: e.oxford_audio`
- README 的示例响应（旧：
  > `"audio": "//ssl.gstatic.com/dictionary/static/sounds/20200429/hello--_gb_1.mp3"`
- 项目作者相关 issue 也印证该依赖：`https://github.com/meetDeveloper/freeDictionaryAPI/issues/248`（正文）：
  > "The project's modules/dictionary.js file makes a request to this URL: `https://www.google.com/async/callback:5493?...` This is an internal, undocumented endpoint of Google. Google can change, restrict, or completely disable it at any time. Unfortunately, this is the biggest weakness of this project — it doesn't have its own database, it's dependent on Google."
- 中文解释（**这是关键风险**）：公开仓库的 master 代码抓的是 **Google/Oxford 音频**，且**仓库里看不到任何「Commons 音频 + license 字段」的实现**。也就是说：**线上返回 Commons 音频与许可字段的那套实现，并不在这个开源仓库里**（可能是未同步的私部署）。因此：
  - 「它的音频 URL 怎么来的」→ **无法确认**（只能确认运行结果，不能确认合规流程）；
  - 「它是否履行了 CC BY-SA 的归因义务」→ **无法确认**。
- 可确认：**是（不一致这一事实可确认）**；其线上实现 → **无法确认**。

**证据 D：README 中**没有**任何 Wiktionary / CC BY-SA 声明（可确认：本次逐段通读）**
- URL：`https://raw.githubusercontent.com/meetDeveloper/freeDictionaryAPI/master/README.md`（HTTP 200）
- 事实：全文**未出现** “Wiktionary”“Wikimedia”“CC BY-SA” 等字样；README 只讲用法、v1/v2 差异、未来计划与捐赠（"Currently API has more than 10 million requests per month and to keep it running I need support of the community."）。
- 中文解释：题目要求核查「README/仓库里关于 Wiktionary CC BY-SA 的声明与要求」——**答案是不存在该声明**。这意味着**它没有替我们履行 Commons 的署名义务**；我们若使用这些音频，**署名义务仍在我们自己身上**（依 §3.2 证据 D）。
- 可确认：**是**（「无该声明」这一否定事实，基于本次通读全文）。

**证据 E：仓库内未找到 ToS / 商用授权文件**
- GitHub API 列目录：`https://api.github.com/repos/meetDeveloper/freeDictionaryAPI/contents/` → 顶层仅 `.github`、`.gitignore`、`LICENSE`、`README.md`、`app.js`、`meta`、`modules`、`package.json`；`meta` 下仅有 `wordList`。
- 仓库元数据：`"open_issues_count":108`，`"pushed_at":"2023-11-27T12:16:11Z"`（**主仓库近 3 年无推送**）。
- 中文解释：**没有面向使用者的服务条款或商用许可声明**。因此对「能否商用」这个问题，唯一诚实的答案是：**无法确认**（既没有允许，也没有禁止的书面条款；而这是最糟的状态）。
- 可确认：**是**。

**证据 F：服务稳定性实测（本次，2026-10-06）+ 社区 issue 印证**
- 本次实测：
  - `GET /api/v2/entries/en/hello` → **200**
  - `GET /api/v2/entries/en/cat` → **200**
  - `GET /api/v2/entries/en/book` → **200**
  - `GET /api/v2/entries/en/school` → **200**
  - `GET /api/v2/entries/en/water` → **404**（返回的是站点 HTML 404 页）
  - `GET /api/v2/entries/en/apple` → **404**（同上）
  - `GET /api/v2/entries/en/asdfghjkl` → **522**（Cloudflare “Connection timed out”）
  - `GET /api/v2/entries/en/zzzqqx` → **522**
- 社区 issue（open）：
  - `#249` “Getting timeouts today”：「Common words seem to work ok … But less common words time out with 522 error」
  - `#251` “Some words don't work”：「some words like ability, angel returns 522」
  - `#252` “502 Error For All Request”：「I am getting 502 error for every word I try using the api (Expect for hello).」
- 中文解释：**常见词可用、非常用词不稳定**；这正是「词典没有音频时」需要 fallback 的场景。**结论：不可作为产品级唯一依赖。**
- 可确认：**是**。

---

### 3.4 把音频放进我们数据库的推荐字段与 URL 策略（工程结论）

> 本节是**基于上述证据的工程结论**，不是新的许可主张。

- **不要**把 `api.dictionaryapi.dev/media/...` 当播放 URL（第三方稳定性 + 条款缺失 + 不是音频所有者）。
- **不要**把 `upload.wikimedia.org` 直链当唯一播放地址（Commons 明确 “not recommended”；且 Wikimedia 无可用性承诺）。
- **建议入库**（每词一条音频记录）：
  `source`（commons）/ `source_page_url`（Commons 文件页 URL，用于归因）/ `file_name`（如 `En-us-cat.ogg`）/ `license_name` / `license_url` / `author` / `attribution_text`（渲染好的署名串）/ `self_hosted_url`（我们自己的存储/CDN URL）/ `sha256` / `fetched_at` / `verified_by`（人工核对人）。
- **建议**：音频文件本体放自有存储（磁盘/对象存储），DB 只存元数据 + 自有 URL；这与本项目「URL + 磁盘 + 鉴权下载」的既有存储规范一致。

---

### 3.5 Piper TTS（含 3 个英语 voice 的实际授权）

**证据 A：老仓库 `rhasspy/piper` = MIT，且已归档**
- URL：`https://raw.githubusercontent.com/rhasspy/piper/master/LICENSE.md`（HTTP 200）
- 原文摘录：
  > MIT License
  > Copyright (c) 2022 Michael Hansen
  > Permission is hereby granted, free of charge, to any person obtaining a copy of this software … without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software…
- 交叉印证（GitHub API：`https://api.github.com/repos/rhasspy/piper`）：`"license":{"spdx_id":"MIT"}`，且 **`"archived":true`**，`"pushed_at":"2025-08-26T15:01:29Z"`。
- 同仓库根 README 现在**只有一行**：
  > `Development has moved: https://github.com/OHF-Voice/piper1-gpl`
- 中文解释：**MIT 可商用**，但**该仓库已归档、不再维护**。
- 可确认：**是**。

**证据 B：现行主线 `OHF-Voice/piper1-gpl` = GPL-3.0（重大变化）**
- URL：`https://api.github.com/repos/OHF-Voice/piper1-gpl` → `"license":{"key":"gpl-3.0","name":"GNU General Public License v3.0","spdx_id":"GPL-3.0"}`，`"description":"Fast and local neural text-to-speech engine"`，`"pushed_at":"2026-09-28T20:17:35Z"`。
- 补充实测：该仓库根目录 **没有** `LICENSE` / `LICENSE.md`（两者均 404），`pyproject.toml` 也只有 build-system 与 black 配置、**无 license 字段**（原始摘录：`[build-system] requires = [...]` / `[tool.black] exclude = '''...'''`）。README 里也**没有**许可声明，只链接 `pip install piper-tts` 与各文档。
- 中文解释：**第三方（GitHub）识别为 GPL-3.0**，但仓库内的许可声明不完整（根目录无 LICENSE 文件）→ 形成「**事实上的 GPL-3 主线 + 形式授权不完整**」的组合。对我们的意义：
  - 若**接受 GPL**或在隔离进程/服务边界调用（隔离是否足以避免 copyleft **需法务确认，本文件不结论**），可用现行主线；
  - 若要求闭源友好，**只能锁定已归档的 MIT 版本**（有不再维护的风险）。
- 可确认：**是**（许可证识别结果与 404/无 license 字段的事实）；**隔离是否避免 copyleft → 无法确认**。

**证据 C：voice 模型授权**逐 voice 不同（三个英语 voice 的 MODEL_CARD 原文）**
- `en_US-lessac-medium`：`https://hf-mirror.com/rhasspy/piper-voices/raw/main/en/en_US/lessac/medium/MODEL_CARD`（HTTP 200）
  > ## Dataset
  > * URL: https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/
  > * **License: https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html**
- 该 dataset license 页（`https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html`，HTTP 200）原文摘录：
  > "Research Purposes" means only those purposes associated with research and exploration … and for the avoidance of doubt **excludes** loading, executing, storing, transmitting, displaying, copying, reverse engineering, developing, adapting, amending or otherwise using the Materials for **any commercial purpose**, including the development, marketing, commercialisation, sale or licencing of voice synthesis or speech recognition products or services…
  > The User agrees not to lend, hire, sell, distribute or otherwise part with the Materials in any manner not consistent with this Agreement without the express prior consent in writing of Licencors…
- `en_US-ljspeech-medium`：`https://hf-mirror.com/rhasspy/piper-voices/raw/main/en/en_US/ljspeech/medium/MODEL_CARD`（HTTP 200）
  > ## Dataset
  > * URL: https://keithito.com/LJ-Speech-Dataset/
  > * **License: public domain**
  > ## Training
  > … US English female voice. Single speaker. Trained from scratch for 1000 epochs…
- `en_GB-alan-medium`：`https://hf-mirror.com/rhasspy/piper-voices/raw/main/en/en_GB/alan/medium/MODEL_CARD`（HTTP 200）
  > ## Dataset
  > * URL: https://github.com/MycroftAI/mimic3-voices/blob/master/voices/en_UK/apope_low
  > * **License: See URL**
  > ## Training
  > Finetuned from U.S. English lessac voice (medium quality).
- 顺着 “See URL” 查上游：`https://raw.githubusercontent.com/MycroftAI/mimic3-voices/master/voices/en_UK/apope_low/README.md`（HTTP 200）
  > # U.S English apope (Low Quality) … See LICENSE file for license.
- 以及 `https://raw.githubusercontent.com/MycroftAI/mimic3-voices/master/voices/en_UK/apope_low/LICENSE`（HTTP 200）**全文仅为**：
  > `Copyright 2022 Mycroft AI`
  > `All Rights Reserved`
- 中文解释：
  - **`en_US-lessac-medium`：数据集为研究许可，明确排除任何商业用途 → 商用场景禁止**（且它是很多其它 voice 的微调基座，风险会传导）。
  - **`en_US-ljspeech-medium`：数据集 public domain → 商用风险低**（推荐）。
  - **`en_GB-alan-medium`：上游 LICENSE 是 “All Rights Reserved”，不是开放许可；且由 lessac 微调而来 → 商用禁止/高风险**。这也说明**英式可商用 voice 需要另找**（本次未找到授权干净的 `en_GB-*` → **无法确认有无**）。
  - 「模型权重是否继承数据集许可」在业界存在争议；本文件**不做法学结论**：对 lessac/alan 一律按**不可商用**处理，不做乐观解释。
- 可确认：**是**（三个 MODEL_CARD 与其上游 LICENSE 原文均已取得）。

**证据 D：模型体量（可确认，实测文件大小）**
- URL：`https://hf-mirror.com/api/models/rhasspy/piper-voices/tree/main/en/en_US/lessac/medium` → HTTP 200，JSON 中：
  > `{"type":"file","size":63201294,"path":"en/en_US/lessac/medium/en_US-lessac-medium.onnx"}`
- 中文解释：`medium` 质量 voice 的 onnx 约 **63.2 MB（≈60.3 MiB）**；另有 `.onnx.json` 4,885 B。**量化/低质量 voice 更小**（本次未逐档取证）。
- 可确认：**是**（该 voice 的大小）。

**证据 E：CPU 推理可行性**
- 可取证的定性表述（现行主线 README，`https://raw.githubusercontent.com/OHF-Voice/piper1-gpl/main/README.md`，HTTP 200）：
  > **A fast and local neural text-to-speech engine** that embeds espeak-ng for phonemization.
  > * 🖥️ Command-line interface / 🌐 Web server / 🐍 Python API / 🔧 C/C++ API
- 中文解释：官方定位为「本地、快速」，且提供 **HTTP Web server** 模式（正好适配「服务端生成 + 缓存 wav」），并列出 Home Assistant、NVDA 等实际使用者。
- **无法确认**：具体实时率（RTF）、树莓派等设备上的性能数字——老仓库 README（原本含此类说明）已被替换为迁移提示，本次**未取得官方性能数据**。工程侧应在选型阶段**自行压测**（`piper` HTTP server + 目标硬件）。
- 可确认：**部分**（定性 + 存在 HTTP server 模式）。

**证据 F：能否服务端缓存生成的 wav**
- 结论：**能**，因为音频由**我们本地推理生成**，不涉及第三方 ToS；**但**输出的可商用性受**所选 voice 的数据集授权**约束（lessac/alan 不可商用 → 其输出也不可用于商用产品）。这是本次最重要的传导结论。
- 可确认：**是（推理链可确认）**；「合成音频在美国是否受版权保护」等法理问题，本文件**不作结论（无法确认）**。

---

### 3.6 Google Cloud TTS / ElevenLabs / Azure Speech

#### 3.6.1 Google Cloud TTS —— 「能否缓存 / 再分发」：**无法确认**

- 现状：`https://cloud.google.com/text-to-speech/pricing` 与 `https://cloud.google.com/terms/service-terms` 在本次环境中**均直连失败**。
- 可取得的**归档**版本：
  - 定价页（**2018-06-17 抓取**，Beta 期）：`https://wayback.qa-archive-it.org/all/20180617113243/https://cloud.google.com/text-to-speech/pricing`
    > | Feature | Monthly free tier | Paid usage |
    > | Standard (non-WaveNet) voices | 0 to 4 million characters | $4.00 USD / 1 million characters |
    > | WaveNet voices | 0 to 1 million characters | $16.00 USD / 1 million characters |
  - Service Specific Terms（**2016-04-26 抓取**）：`https://wayback.qa-archive-it.org/all/20160426183824/https://cloud.google.com/terms/service-terms`
    > 全文仅 16 节，覆盖 App Engine / Cloud Storage / Cloud SQL / Compute Engine / **Translate API** / Prediction API / Datastore / DNS / VPN / Security Scanner / **Vision API** / BigQuery / 承诺定价 / 附加限制 / 定义 / 第三方条款 —— **没有任何 Text-to-Speech 小节**。
- 中文解释与判定：
  1. 2016 版 Service Specific Terms 里**没有** TTS 条目（TTS 2018 年才 Beta），因此**不能**用它来判断 TTS 的缓存/再分发。
  2. 2026 现行版无法访问，Archive-It 对 `cloud.google.com/terms/service-terms` **没有 2016 年之后的存档**（`/all/2025/` 仍回落到同一份 2016 抓取）。
  3. 因此：**Google Cloud TTS 是否允许缓存合成音频 / 是否允许再分发 → 无法确认**。可参考的同类条款只有 Translate API 的“**No Use of this Service to Create Similar Service**”（`Customer will not … use this Service to create, train, or improve (directly or indirectly) a substantially similar product or service`）——它是**禁止训练竞品**，**并不等于**允许缓存，不能外推。
  4. 2018 免费额度数值为**历史值**，现行免费额度 → **无法确认**。
- 非官方交叉参考（**明确标注为社区回答，非条款原文**）：`https://discuss.google.dev/t/text-to-speech-api-license/187973`
  > 「According to Google's Text-to-Speech API Terms of Service, you **can** use the generated audio for many purposes, but you **cannot** use it to train a competing speech synthesis (TTS) system or improve one.」（答主为普通社区用户，非 Google 官方；帖内还建议联系官方支持确认）
- 判定：**可确认（归档原文与不可访问事实）／核心问题无法确认（现行 ToS 的缓存与再分发条款）**。

#### 3.6.2 ElevenLabs —— 免费层**明确禁商用**；缓存/再分发**无法确认**

- URL：`https://elevenlabs.io/terms-of-use`（HTTP 200，页面标注 “Last Updated: 31 March 2026”）
- 原文摘录（§1(c) Use Restrictions）：
  > (i) if you access or use our Services free of charge (such a user, a "Free User"), you **may only use the Services for non-commercial purposes**; (ii) if you access or use our Services through a paid subscription plan (such a user, a "Paid User"), you **may use the Services for commercial purposes**, but in either case, your access and use of the Services and any Output must still comply with the Prohibited Use Policy.
- 原文摘录（§4(a) Inputs and Outputs）：
  > We may enable you to download Output from some (but not all) of the Services; in such cases, **you are permitted to use such Output outside of the Services but always subject to these Terms and our Prohibited Use Policy.**
- 中文解释与判定：
  - **免费层：不可商用**（可确认）→ 对本项目（家庭应用，若将来含任何商业化）**直接排除免费层**。
  - 付费层：允许商用；并允许「下载后的 Output 在服务之外使用」→**倾向于**允许我们缓存/自托管输出。
  - **但**：本次**未找到**专门针对「服务端批量缓存音频 + 作为产品内置音频库再分发」的明文条款；`/service-specific-terms` 只列出各服务子条款（Ads Engine / Speech Engine / Studio 等），本文档**未逐条穷尽**，且 `Speech Engine Terms`（`https://elevenlabs.io/speech-engine-terms`，HTTP 200）聚焦实时对话语音、**不含** TTS 音频资产化条款。
  - 因此：**「缓存到自建服务器」与「再分发音频文件」→ 无法确认**（需在可联网环境核对 Prohibited Use Policy 与发票/企业协议）。

#### 3.6.3 Azure AI Speech —— 有明确**披露义务**；缓存/再分发**无法确认**（仅有非官方二手说法）

- 官方 FAQ（`https://learn.microsoft.com/en-us/azure/ai-services/speech-service/faq-tts`，HTTP 200）：**未涉及**「output 能否缓存 / 再分发」，只覆盖计费（按字符）、限流（默认 200 TPS for Standard Voice）、输出格式、披露建议等。
- **官方硬约束**（Microsoft Enterprise AI Services Code of Conduct，`https://learn.microsoft.com/en-us/legal/ai-code-of-conduct`，HTTP 200，页面标注 4.0 / 2026-05-01）：
  > (3) **Disclose when the output, decisions, or actions are generated by AI, including the synthetic nature of generated voices**, images, and/or videos, such that users are not likely to be deceived…
  > All content released through a customer's use, or integration, of any Microsoft AI Service must be originally created by the publisher, appropriately licensed from the third-party rights holder, used as permitted by the rights holder, or used as otherwise permitted by law. It is the customer's sole responsibility to ensure that customers have appropriate rights to all content input to the Microsoft AI Service (**e.g. generated speech and associated metadata**).
  > ### Azure Speech and voice services in Foundry Tools — When Speech or voice services … are integrated into applications that customers make available to users external to their organization … customers must: … Inform External Users via clear and prominent disclosures…
- 中文解释：若我们**对外**提供 Azure 合成语音，**必须披露「这是 AI 合成语音」**；并且内容授权责任在客户。这**不禁止**使用，但**未回答**缓存/再分发。
- 非官方二手来源（**必须标注为二手，不能作为依据**）：Microsoft Q&A `https://learn.microsoft.com/en-gb/answers/questions/5987029/can-audio-generated-with-azure-text-to-speech-be-p`（2026-08-27，答主为 Volunteer Moderator，非 Microsoft 法务）：
  > Yes. If you are using the **paid tier of Azure Text-to-Speech with prebuilt neural voices**, Microsoft's Product Terms explicitly allow customers to use the generated audio output, including for commercial purposes. … the generated output must not be used to create, train, or improve a competing or similar TTS service.
- 本次尝试读取 Microsoft Product Terms 官方原文（`https://www.microsoft.com/licensing/terms/productoffering/MicrosoftAzure/allprograms`，HTTP 200）但页面为动态渲染，正文在 TTS 小节前被截断，**未能取得相关条款原文**。
- 判定：**披露义务可确认**；**「是否允许缓存 / 再分发」→ 无法确认**（官方原文未取得；二手说法不足以支撑上线决策）。

#### 3.6.4 三家的横向判定（回答「是否允许缓存合成音频、是否允许再分发」）

| 服务 | 免费额度 | 商用 | 允许缓存音频？ | 允许再分发音频？ | 依据强度 |
|---|---|---|---|---|---|
| Google Cloud TTS | 2018 归档：Standard 0–4M 字符/月、WaveNet 0–1M 字符/月（**历史值**）；现行 → 无法确认 | 无法确认 | **无法确认** | **无法确认** | 官方现行条款不可访问；2016 归档无 TTS 条目 |
| ElevenLabs | 本次未取证具体额度 | **免费层禁商用**；付费层可商用 | **无法确认**（倾向允许，因 Output 可下载后站外使用） | **无法确认** | ToS 原文可确认（§1(c)/§4(a)）；缓存/再分发未明文 |
| Azure AI Speech | 本次未取证 | 付费层倾向可商用（二手） | **无法确认** | **无法确认** | 官方 FAQ/Code of Conduct 可确认（含披露义务）；缓存条款原文未取得 |

---

### 3.7 浏览器 Web Speech API（`window.speechSynthesis`）

**证据 A：接口能力清单——不存在任何取得音频字节的方法/属性（可确认）**
- URL：`https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis`（HTTP 200）
- 原文摘录（实例属性/方法/事件全清单）：
  > Instance properties: `SpeechSynthesis.paused` / `SpeechSynthesis.pending` / `SpeechSynthesis.speaking`
  > Instance methods: `cancel()` / `getVoices()` / `pause()` / `resume()` / `speak()`
  > Events: `voiceschanged`
- URL：`https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance`（HTTP 200）
  > Instance properties: `lang` / `pitch` / `rate` / `text` / `voice` / `volume`
  > Events: `boundary` / `end` / `error` / `mark` / `pause` / `resume` / `start`
- 中文解释：**整个 API 只有「输入文本 + 控制播放」的能力，没有任何返回音频数据（Blob / ArrayBuffer / MediaStream）的接口**。因此：**不能缓存音频字节 → 可确认**。想拿到音频只能靠「系统级录音」这类旁路手段（本文件不推荐、也不认为它能规避平台条款，且引入音质与合规问题）。
- 可确认：**是**。

**证据 B：跨端支持面（可确认，引用 caniuse 数据）**
- URL：`https://caniuse.com/speech-synthesis`（HTTP 200，页面数据标注 2026 年）
- 原文摘录（关键项）：
  > Global usage **95.91%**
  > Chrome: 33+ Supported（4–32 不支持）；Edge: 14+；Safari: 7+；Firefox: 49+（31–48 Disabled by default）；Opera: 27+
  > Chrome for Android: 154 Supported / Safari on iOS: 7+ Supported / Samsung Internet: 5+ Supported / Firefox for Android: 157 Supported
  > **Android Browser: 2.1–4.4.4 Not supported；154 Not supported** / Opera Mini: all 不支持 / Opera Mobile: 80 Not supported / UC Browser for Android 15.5: Not supported / IE 11: Not supported
- 中文解释：**主流现代浏览器与 iOS Safari 都支持**；但 **Android 系统 WebView/旧 Android Browser、Opera Mini/UC 等嵌入式内核不支持** —— 这与「移动端 App 内嵌 WebView」这一本项目形态**直接相关**，必须做能力探测与降级。
- 可确认：**是**（caniuse 数据）；**我们具体目标 WebView 版本上的行为 → 需真机验证**。

**证据 C：是否需要联网 / 是否离线可用**
- 可取得的原文（MDN，`https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API`，HTTP 200）——**注意它讲的是「语音识别」，不是合成**：
  > Generally, the speech recognition system available on the user's device is used… **By default, using speech recognition on a web page involves a server-based recognition engine. Your audio is sent to a web service for recognition processing, so it won't work offline.**
- 中文解释与判定：**该原文只针对识别（STT）**，**不能**外推为合成（TTS）的联网结论。合成的离线与否取决于**平台自身的语音引擎**（macOS/iOS/Windows 的端上语音 vs 部分浏览器调用的网络语音）。本次**未取得**权威文档对「各端合成是否需要联网」的统一结论 → **逐端差异 → 无法确认**（需在 Chrome/Safari/Android WebView 上实测）。
- 可确认：**部分**（MWDN 对识别的原文可确认；合成的联网行为无法确认）。

**证据 D：基线状态（可确认）**
- MDN 页面标注（`SpeechSynthesis` 与 `SpeechSynthesisUtterance` 均标）：
  > **Baseline — Widely available.** This feature is well established and works across many devices and browser versions. It's been available across browsers since **September 2018**. \* Some parts of this feature may have varying levels of support.
- 中文解释：「广泛可用」仅指 API 存在；**可用语音集合与音质在不同设备差异极大**（`SpeechSynthesisUtterance` 页面明确带 `*` 提示）。
- 可确认：**是**。

---

## 四、Primary + Fallback 明确推荐

### 4.1 结论一句话

> **Primary = 我们自建的「Commons 授权白名单音频库」**（打包下载 → 逐文件核对许可 → 自托管 → DB 存元数据 + 归属文案）；
> **Fallback = 自建 Piper TTS 服务（仅用可商用 voice）+ 客户端 Web Speech API 兜底**。
> **Free Dictionary API 只用于「发现候选词/辅助信息」，不作音频来源、不作播放链路。**

### 4.2 Primary：Commons 白名单音频库（自托管）

| 项 | 决策 |
|---|---|
| 音频来源 | Wikimedia Commons（经 Wiktionary `{{audio}}` 引用关系定位文件） |
| 获取方式 | **批量**（kaikki.org 的打包音频 / dumps），不做逐词抓取（Wiktextract 原文：“Downloading them individually … puts unnecessary load on Wikimedia servers”） |
| 准入规则 | **只收 CC0 / 公有领域 / CC BY / CC BY-SA（3.0 或 4.0）**；**不收**：许可字段缺失、许可不明、GFDL 单一许可（≥2018-10-15 的音频）、非自由许可 |
| 音频处理 | **原样使用、不修改**（不做裁剪/降噪/变速再发布，避免触发 CC BY-SA 的 ShareAlike 改编义务；若必须修改，则该改编音频按 CC BY-SA 同许可发布，并标注修改） |
| 自托管 | 文件放自有存储；DB 存 `license_name/license_url/author/source_page_url/file_name/attribution_text/sha256/fetched_at/verified_by` |
| 播放 | 用**自有 URL**；Commons 直链只作应急补充（官方不推荐 hotlink） |
| 入库与展示 | 产品内提供「发音音频来源与许可」说明入口（列表形式：词 → 文件 → 作者 → 许可 → 链接），并同步登记到 `docs/THIRD_PARTY_NOTICES.md` |
| 法律风险等级 | **中**（许可允许商用/缓存/再分发，但**必须逐文件核对**且 WMF 不担保授权正确性；含人声文件另受人格权等非版权限制） |
| 必须保留的 attribution | 见 §4.4 模板 |

**为什么不用 Free Dictionary API 当 Primary（五条硬理由，全部有证据）**
1. 仓库代码 **GPL-3.0**（§3.3-A），代码复用会把我们拖入 copyleft；
2. 其**服务端无 ToS/商用授权** → 「可商用」**无法确认**（§3.3-E）；
3. 仓库代码抓 Google/Oxford、线上却返回 Commons 音频 → **实现不一致、授权链条不透明**（§3.3-C）；
4. README **无任何** Wiktionary CC BY-SA 声明 → 它**没有替我们履行署名义务**（§3.3-D）；
5. **稳定性实测差**（522/404）+ 作者公开表示 10M 请求/月的 AWS 成本压力（§3.3-F）。

### 4.3 Fallback：两级

**F1（服务端，首选 fallback）：自建 Piper TTS 服务**
- 形态：Piper **HTTP server** 模式（官方 README 列有 🌐 Web server）→ 我们后端调用 → **生成 wav 缓存到自有存储**（音频是我们本地产物，可缓存）。
- **voice 白名单（关键）**：
  - ✅ 可用：`en_US-ljspeech-medium`（数据集 **public domain**，§3.5-C）
  - ❌ 禁用：`en_US-lessac-medium`（数据集**研究许可，明确排除商用**）、`en_GB-alan-medium`（上游 `apope_low` LICENSE = **“All Rights Reserved”**，且由 lessac 微调）
  - ⚠️ **英式可商用 voice：未找到 → 无法确认**（需要另找授权干净的 `en_GB-*`，或对英式只提供真人音频）
  - ⚠️ 任何 voice 上线前必须**逐个读其 MODEL_CARD 的 Dataset License**（本次已证明三个 voice 三种授权）
- **代码许可红线**：
  - `rhasspy/piper` = **MIT**，但 **archived**；
  - `OHF-Voice/piper1-gpl` = **GPL-3.0**（GitHub 识别）且根目录无 LICENSE 文件；
  - → 若要求闭源友好：锁定已归档 MIT 版本并接受维护风险；若用现行主线：**GPL 义务与「独立进程隔离是否足够」必须由法务确认（本文件不结论）**。
- 模型体量参考：`en_US-lessac-medium.onnx` ≈ **63.2 MB**（§3.5-D）；`medium` 档在服务器 CPU 上的实时率 → **需自行压测（官方数据本次未取得）**。
- 缓存策略：按 `(voice, text, speed)` 缓存 wav，命中直接回放，避免重复推理。

**F2（客户端，最后兜底）：Web Speech API**
- 用法：`speechSynthesis.speak(new SpeechSynthesisUtterance(word))`，`utterance.lang='en-US'/'en-GB'`，优先挑 `getVoices()` 里 `lang` 匹配的语音。
- **能力边界（务必写进实现注释/产品文案）**：**拿不到音频字节 → 不能缓存**（§3.7-A）；支持面 95.91% 但**嵌入式 WebView/Android 旧内核/Opera Mini/UC 不支持**（§3.7-B）；合成是否需要联网**逐端不同、无法确认**（§3.7-C）；音色/音质因设备而异（§3.7-D）。
- UI 义务：标注「本发音由浏览器合成语音生成（Browser TTS）」，与真人录音区分。

**明确排除（不作缓存/音频资产方案）**
- Google Cloud TTS / Azure Speech：缓存与再分发的官方条款**无法确认**（§3.6.1 / §3.6.3）→ 若一定要用，**只能用「实时合成 + 不落盘」**，并（Azure）履行 AI 合成披露义务；
- ElevenLabs：**免费层禁止商用**；付费层的批量缓存条款**无法确认**（§3.6.2）；
- lessac / en_GB-alan voice：**禁止商用**（§3.5-C）。

### 4.4 需要保留的 attribution 文本模板（可直接用于 DB `attribution_text`）

**① 通用（CC BY / CC BY-SA 文件，中文展示）**
```
发音：<word>（<US|UK>）— 音频文件 “<File:En-us-<word>.ogg>”
作者/上传者：<author> ｜ 来源：Wikimedia Commons（<source_page_url>）
许可：<CC BY-SA 4.0>（<license_url>）｜ 本项目未修改该音频
```
**② 英文版（对外/英文界面）**
```
Pronunciation: <word> (<US|UK>) — audio "<File:En-us-<word>.ogg>"
By <author>, via Wikimedia Commons (<source_page_url>)
Licensed under <CC BY-SA 4.0> (<license_url>). No changes were made.
```
**③ CC0 / 公有领域文件（非强制署名，仍建议保留 provenance）**
```
发音音频来自 Wikimedia Commons（<source_page_url>），CC0 1.0 / 公有领域，无署名要求。
```
**④ 修改过音频时（**本项目策略：不修改**；如未来修改必须换成此模板）**
```
本音频基于 Wikimedia Commons 的 “<File:...>”（作者 <author>，<license>）修改（<修改说明：裁剪/降噪…>），
修改后的音频同样以 <CC BY-SA 4.0> 发布。
```
**⑤ Piper TTS 合成音频（fallback）**
```
本发音由本地语音合成生成（Piper TTS，voice：<en_US-ljspeech-medium>）。
该 voice 的数据集为公有领域（LJSpeech）。未使用任何需署名的录音素材。
```
> 备注：若产品内使用的是 **Web Speech API**，无需 attribution，但**必须**标注「浏览器合成语音」。

### 4.5 落地前必须做的三件事（合规闸门）

1. **逐文件核对**：每个入库音频都要有人工核对记录（`verified_by` + `fetched_at`），因为 WMF **明确不担保**授权正确性（§3.2-D）。
2. **抽样复核**：上线前抽样（建议 ≥30 条，覆盖 US/UK、CC0/BY/BY-SA 各档）回到 Commons 文件页核对 `License`/`Author` 字段。
3. **补登记**：把「发音音频来源 + 许可 + 归属模板」写入 `docs/THIRD_PARTY_NOTICES.md`（本项目既有规范：新增第三方资产必须登记），并在 `docs/opensource-mapping.md` 记录「Piper 代码许可（MIT 归档 / GPL-3 主线）」与「voice 白名单」。

---

## 五、仍未确认项清单（明确「无法确认」，禁止改成“应该可以”）

| # | 未确认项 | 原因 | 建议的核实方式 |
|---|---|---|---|
| 1 | **现行** Wikimedia Terms of Use 原文（2023 版 §7） | `foundation.wikimedia.org` 直连失败；Archive-It 无该页存档（实测 404） | 在可联网环境读现版 ToU，核对 §7 署名/许可要求 |
| 2 | **具体某条 Commons 音频文件**的 License / Author 字段 | Commons 文件页直连失败；`File:En-us-hello.ogg` 在 Archive-It 无存档（实测 404） | 抽样回文件页核对；批量用 Commons API `imageinfo&iiprop=extmetadata` |
| 3 | `{{audio}}` / `{{audio-IPA}}` **模板文档原文** | 文档页直连失败且未被归档（404） | 在可联网环境读模板文档，确认参数与对 Commons 的引用方式 |
| 4 | 音频中**真人 vs TTS 的比例**、是否存在合成语音混入 | 无一手统计；无法逐文件确认上传性质 | 抽样看文件页 `Description`/`Source`；必要时只收「明确标注真人录音」的文件 |
| 5 | Free Dictionary API **线上实现如何取得 Commons 音频与许可**（是否合规） | 开源仓库中无该逻辑（master 抓 Google/Oxford） | 不依赖它；如需，联系作者或改用 Commons 直取 |
| 6 | Free Dictionary API 的**服务条款 / 商用授权** | 仓库与站点均无 ToS 文件（已穷尽顶层目录与 README） | 不用它承载音频；必要时联系作者书面确认 |
| 7 | 是否存在**授权干净的英式（en_GB）可商用 Piper voice** | 本次只验了 `en_GB-alan-medium`（上游 All Rights Reserved） | 逐一读其它 `en_GB-*` voice 的 MODEL_CARD Dataset License |
| 8 | Piper **官方 CPU 性能数据**（RTF/树莓派可用性） | 老仓库 README 已被迁移提示替换；现行 README 只有定性描述 | 自行在目标服务器压测（建议以「单词级短文本」为基准） |
| 9 | Google Cloud TTS **现行**免费额度与缓存/再分发条款 | `cloud.google.com` 直连失败；Archive-It 只到 2016 版（无 TTS 小节） | 在可联网环境读现版 Service Specific Terms 的 Cloud Text-to-Speech 小节 |
| 10 | Azure Speech **是否允许缓存/再分发** output 的官方条款原文 | Microsoft Product Terms 页面动态渲染、正文在目标小节前被截断；仅取得社区版主的二手说法 | 在可联网环境读 Microsoft Product Terms 的 Azure「Text to Speech」小节，或走 Azure 工单书面确认 |
| 11 | ElevenLabs **免费额度数值**与「服务端批量缓存 + 再分发」条款 | 本次只取证了 ToS §1(c)/§4(a) 与 service-specific 列表；未逐条穷尽 Prohibited Use Policy | 读 Prohibited Use Policy 全文；企业用途走商务确认 |
| 12 | Web Speech API 在**各端是否需要联网**、以及本项目目标 **Android WebView** 上的实际可用性 | MDN 仅对「语音识别」写明联网；caniuse 显示部分嵌入式内核不支持 | 真机矩阵实测（iOS Safari / Android WebView / 微信或 App 内嵌浏览器） |
| 13 | 合成语音输出（Piper wav）本身的**版权/邻接权**法理定性 | 本文件不做法律判断 | 若产品要「把 TTS 音频当资产分发」，请法务出具意见 |
| 14 | 「GPL-3 的 piper1-gpl 以独立服务进程/HTTP 调用时的 copyleft 边界」 | 需法律解释，非技术问题 | 法务确认；未确认前优先锁定 MIT 归档版或改用其它 MIT/宽松许可 TTS 引擎 |

---

## 六、给「单词本」的数据模型建议（本文件不含代码，仅字段口径）

| 字段 | 说明 |
|---|---|
| `accent` | `us` / `uk` / `au` …（Commons 文件命名与实际标签） |
| `kind` | `human`（Commons 真人录音）/ `tts_piper` / `tts_browser` |
| `file_name` | 如 `En-us-cat.ogg`（Commons 文件名，归因必需） |
| `source_page_url` | Commons 文件页 URL（归因必需） |
| `license_name` / `license_url` | 如 `CC BY-SA 3.0` + 链接（**缺失则该条不得入库**） |
| `author` | 原作者（**不是上传者**，见 §3.2-D） |
| `attribution_text` | 渲染好的署名串（模板见 §4.4） |
| `self_hosted_url` | 我们自己的播放地址（唯一播放链路） |
| `sha256` / `fetched_at` / `verified_by` | 可追溯性与人工核对记录 |

---

### 附：本次调研的一手证据 URL 汇总

| 来源 | URL | 本次状态 |
|---|---|---|
| FDAPI 实测（hello/cat/book/school） | `https://api.dictionaryapi.dev/api/v2/entries/en/<word>` | ✅ 200 |
| FDAPI 实测（water/apple） | 同上 | ❌ 404（站点 HTML 404） |
| FDAPI 实测（asdfghjkl/zzzqqx） | 同上 | ❌ 522 |
| FDAPI LICENSE / README / dictionary.js | `https://raw.githubusercontent.com/meetDeveloper/freeDictionaryAPI/master/{LICENSE,README.md,modules/dictionary.js}` | ✅ 200 |
| FDAPI 仓库元数据 / issue #248 | `https://api.github.com/repos/meetDeveloper/freeDictionaryAPI`、`https://github.com/meetDeveloper/freeDictionaryAPI/issues/248` | ✅ 200 |
| Commons:Licensing | `https://wayback.qa-archive-it.org/all/20180919063644/https://commons.wikimedia.org/wiki/Commons:Licensing` | ✅（2018-09-19 归档） |
| Commons:Reusing content outside Wikimedia | `https://wayback.qa-archive-it.org/all/20180919063642/https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia` | ✅（2018-09-19 归档） |
| Wikimedia ToU（旧版） | `https://wayback.qa-archive-it.org/all/20120228041516/http://wikimediafoundation.org/wiki/Terms_of_Use` | ✅（2012-02-28 归档；现行版不可访） |
| Meta User-Agent policy | `https://wayback.qa-archive-it.org/all/20171014055739/https://meta.wikimedia.org/wiki/User-Agent_policy` | ✅（2017-10-14 归档） |
| MediaWiki API:Etiquette | `https://wayback.qa-archive-it.org/all/20171018092820/https://www.mediawiki.org/wiki/API:Etiquette` | ✅（2017-10-18 归档） |
| en.wiktionary `hello` | `https://wayback.qa-archive-it.org/all/20171011194139/https://en.wiktionary.org/wiki/hello` | ✅（2017-10-11 归档） |
| Wiktextract README（audio→Commons、批量下载） | `https://raw.githubusercontent.com/tatuylonen/wiktextract/master/README.md` | ✅ 200 |
| Piper 老仓库 LICENSE/元数据 | `https://raw.githubusercontent.com/rhasspy/piper/master/LICENSE.md`、`https://api.github.com/repos/rhasspy/piper` | ✅（MIT + archived） |
| Piper 现行主线元数据 | `https://api.github.com/repos/OHF-Voice/piper1-gpl` | ✅（GPL-3.0） |
| Piper voice MODEL_CARD（lessac/ljspeech/alan） | `https://hf-mirror.com/rhasspy/piper-voices/raw/main/en/<locale>/<voice>/medium/MODEL_CARD` | ✅ 200 |
| Lessac 数据集研究许可 | `https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html` | ✅ 200 |
| mimic3 `apope_low` LICENSE | `https://raw.githubusercontent.com/MycroftAI/mimic3-voices/master/voices/en_UK/apope_low/LICENSE` | ✅ 200（“All Rights Reserved”） |
| Piper voice 文件大小 | `https://hf-mirror.com/api/models/rhasspy/piper-voices/tree/main/en/en_US/lessac/medium` | ✅ 200（63,201,294 B） |
| Google Cloud TTS 定价（2018 归档） | `https://wayback.qa-archive-it.org/all/20180617113243/https://cloud.google.com/text-to-speech/pricing` | ✅（2018-06-17 归档） |
| Google Service Specific Terms（2016 归档） | `https://wayback.qa-archive-it.org/all/20160426183824/https://cloud.google.com/terms/service-terms` | ✅（2016-04-26；无 TTS 小节） |
| Google 开发者论坛（非官方） | `https://discuss.google.dev/t/text-to-speech-api-license/187973` | ✅ 200 |
| ElevenLabs ToS / Service-Specific | `https://elevenlabs.io/terms-of-use`、`https://elevenlabs.io/service-specific-terms`、`https://elevenlabs.io/speech-engine-terms` | ✅ 200 |
| Azure TTS FAQ / AI Code of Conduct | `https://learn.microsoft.com/en-us/azure/ai-services/speech-service/faq-tts`、`https://learn.microsoft.com/en-us/legal/ai-code-of-conduct` | ✅ 200 |
| Azure 再分发问答（**二手**） | `https://learn.microsoft.com/en-gb/answers/questions/5987029/can-audio-generated-with-azure-text-to-speech-be-p` | ✅ 200（Volunteer Moderator，非官方） |
| MDN SpeechSynthesis / Utterance / 指南 | `https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis`、`.../SpeechSynthesisUtterance`、`.../Web_Speech_API/Using_the_Web_Speech_API` | ✅ 200 |
| caniuse Speech Synthesis | `https://caniuse.com/speech-synthesis` | ✅ 200 |
| CC BY-SA 4.0 许可要点 | `https://creativecommons.org/licenses/by-sa/4.0/` | ✅ 200 |

> **本文件未修改仓库内任何其它文件**；未安装任何依赖；未新增业务代码。

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Wordbook 发音 PoC：Commons 白名单音频批量可下载性验证。

目标：拿真实文件验证「词表 -> 找音频文件 -> 授权筛选 -> 下载 -> SHA256 -> 本地保存 -> 授权台账」
      能不能跑通，而不是相信调研结论。

严格边界（对应任务书）：
  * 独立 research 产物，位于 research/wordbook-audio-poc/，不接入现有 API / Web / DB。
  * 不碰 Prisma / Task / WrongQuestion / Growth / 任何业务代码。
  * 不引 Piper、不引云 TTS、不用商业词典 mp3。
  * 不逐词抓 Wikimedia 页面（用 Commons API 的 prefixsearch + 批量 imageinfo）。
  * 不做 hotlink（最终形态是本地文件 + 我们自己的路径）。
  * 授权无法确认 -> rejected / needs_review，绝不下载进入白名单。

依赖：仅 Python 标准库。
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import io
import json
import os
import random
import re
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

# --------------------------------------------------------------------------
# 常量
# --------------------------------------------------------------------------

UA = "wordbook-audio-poc/0.1 (independent research PoC; python-urllib; contact: local-dev)"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIKTIONARY = "https://en.wiktionary.org/wiki/"

# 词表（30 词，任务书指定；不自行替换）
WORDS = [
    "apple", "book", "computer", "family", "friend", "happy", "important",
    "learn", "school", "teacher", "water", "house", "mother", "father",
    "child", "student", "English", "science", "history", "question",
    "answer", "beautiful", "different", "example", "language", "remember",
    "practice", "read", "write", "world",
]

# 口音 -> 文件名中段标记（出现的顺序即优先级）
ACCENTS = {
    "us": ["us"],
    "uk": ["uk", "gb"],
}

# --------------------------------------------------------------------------
# 授权筛选规则
# --------------------------------------------------------------------------

# 明确允许 commercial use + republication/distribution 的许可（canonical key）
ALLOW_LICENSES = {
    "cc0": "CC0 1.0 (Public Domain Dedication)",
    "pd": "Public Domain",
    "cc-by-4.0": "CC BY 4.0",
    "cc-by-3.0": "CC BY 3.0",
    "cc-by-3.0-us": "CC BY 3.0 US",
    "cc-by-2.5": "CC BY 2.5",
    "cc-by-2.0": "CC BY 2.0",
    "cc-by-1.0": "CC BY 1.0",
    "cc-by-sa-4.0": "CC BY-SA 4.0",
    "cc-by-sa-3.0": "CC BY-SA 3.0",
    "cc-by-sa-2.5": "CC BY-SA 2.5",
    "cc-by-sa-2.0": "CC BY-SA 2.0",
    "cc-by-sa-1.0": "CC BY-SA 1.0",
}

# 明确不接受（哪怕文件能下载）
REJECT_PATTERNS = [
    (r"\bnon[- ]?commercial\b|\bnc\b", "NC (non-commercial)"),
    (r"\bno[- ]?deriv\b|\bnd\b", "ND (no derivatives)"),
    (r"all rights reserved", "All Rights Reserved"),
    (r"fair use", "Fair use"),
]

# 需要人工复核的（不能自动通过）——GFDL 是 copyleft 且对音频不友好，不在白名单
REVIEW_PATTERNS = [
    (r"\bgfdl\b", "GFDL（copyleft，音频再分发义务复杂，需人工复核）"),
    (r"copyright", "Copyrighted（许可不明确）"),
]

LICENSE_TOKEN_MAP = {
    # LicenseShortName / License 字段可能出现的写法 -> canonical key
    "cc0": "cc0",
    "cc-zero": "cc0",
    "cc0-1.0": "cc0",
    "pd": "pd",
    "public domain": "pd",
    "public-domain": "pd",
    "pd-us": "pd",
    "pd-1996": "pd",
    "cc-by-4.0": "cc-by-4.0",
    "cc-by-3.0": "cc-by-3.0",
    "cc-by-3.0-us": "cc-by-3.0-us",
    "cc-by-2.5": "cc-by-2.5",
    "cc-by-2.0": "cc-by-2.0",
    "cc-by-1.0": "cc-by-1.0",
    "cc-by-sa-4.0": "cc-by-sa-4.0",
    "cc-by-sa-3.0": "cc-by-sa-3.0",
    "cc-by-sa-2.5": "cc-by-sa-2.5",
    "cc-by-sa-2.0": "cc-by-sa-2.0",
    "cc-by-sa-1.0": "cc-by-sa-1.0",
}

LICENSE_URL = {
    "cc0": "https://creativecommons.org/publicdomain/zero/1.0/",
    "pd": "https://en.wikipedia.org/wiki/Public_domain",
    "cc-by-4.0": "https://creativecommons.org/licenses/by/4.0/",
    "cc-by-3.0": "https://creativecommons.org/licenses/by/3.0/",
    "cc-by-3.0-us": "https://creativecommons.org/licenses/by/3.0/us/",
    "cc-by-2.5": "https://creativecommons.org/licenses/by/2.5/",
    "cc-by-2.0": "https://creativecommons.org/licenses/by/2.0/",
    "cc-by-1.0": "https://creativecommons.org/licenses/by/1.0/",
    "cc-by-sa-4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
    "cc-by-sa-3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
    "cc-by-sa-2.5": "https://creativecommons.org/licenses/by-sa/2.5/",
    "cc-by-sa-2.0": "https://creativecommons.org/licenses/by-sa/2.0/",
    "cc-by-sa-1.0": "https://creativecommons.org/licenses/by-sa/1.0/",
}

ATTRIBUTION_TEMPLATES = {
    "cc0": '{author}. "{file}". {source_page} (Public Domain / CC0).',
    "pd": '{author}. "{file}". {source_page} (Public Domain).',
    "cc-by-4.0": '{author}. "{file}". {source_page}, {license_name} ({license_url}).',
    "cc-by-3.0": '{author}. "{file}". {source_page}, {license_name} ({license_url}).',
    "cc-by-3.0-us": '{author}. "{file}". {source_page}, {license_name} ({license_url}).',
    "cc-by-2.5": '{author}. "{file}". {source_page}, {license_name} ({license_url}).',
    "cc-by-2.0": '{author}. "{file}". {source_page}, {license_name} ({license_url}).',
    "cc-by-1.0": '{author}. "{file}". {source_page}, {license_name} ({license_url}).',
    "cc-by-sa-4.0": '{author}. "{file}". {source_page}, {license_name} ({license_url}).',
    "cc-by-sa-3.0": '{author}. "{file}". {source_page}, {license_name} ({license_url}).',
    "cc-by-sa-2.5": '{author}. "{file}". {source_page}, {license_name} ({license_url}).',
    "cc-by-sa-2.0": '{author}. "{file}". {source_page}, {license_name} ({license_url}).',
    "cc-by-sa-1.0": '{author}. "{file}". {source_page}, {license_name} ({license_url}).',
}


# --------------------------------------------------------------------------
# HTTP（限速 + 429/5xx 退避）
# --------------------------------------------------------------------------

class Fetcher:
    """限速抓取器。

    实测（本机，2026-10-06）：Commons API 匿名调用在**突发**下第 5 个请求即 429；
    稳定 12s 间隔可连续 12 次 200。因此默认起步间隔 12s，连续成功后逐步降到 4s，
    一旦 429 则把间隔翻倍并长退避。upload.wikimedia.org 配额宽松（实测 remaining 599999），
    其间隔由 download_delay 单独控制。
    """

    def __init__(self, delay: float, max_retries: int, verbose: bool = True,
                 min_delay: float = 4.0, download_delay: float = 0.8):
        self.delay = delay            # Commons API 间隔（受限）
        self.api_delay = delay        # 记住 API 侧当前档位，不被下载节奏污染
        self.min_delay = min_delay
        self.download_delay = download_delay
        self.max_retries = max_retries
        self.verbose = verbose
        self.requests = 0
        self.rate429 = 0
        self._last = 0.0
        self._ok_streak = 0

    def _sleep(self):
        wait = self.delay - (time.time() - self._last)
        if wait > 0:
            time.sleep(wait)

    def get(self, url: str, timeout: int = 45, download: bool = False) -> bytes:
        last_err = None
        for attempt in range(self.max_retries):
            self._sleep()
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept": "*/*",
                "Accept-Encoding": "identity",
                "Referer": "https://commons.wikimedia.org/",
            })
            try:
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    body = r.read()
                self.requests += 1
                self._last = time.time()
                self._ok_streak += 1
                if download:
                    # 下载走 upload.*（配额宽松），但不影响 API 侧的档位记忆
                    self.delay = self.download_delay
                else:
                    self.delay = self.api_delay
                    if self._ok_streak >= 3 and self.delay > self.min_delay:
                        self.delay = max(self.min_delay, self.delay / 2)
                        self.api_delay = self.delay
                return body
            except urllib.error.HTTPError as e:
                self._last = time.time()
                self.requests += 1
                last_err = f"HTTP {e.code}"
                if e.code in (429, 500, 502, 503, 504):
                    if e.code == 429:
                        self.rate429 += 1
                        self._ok_streak = 0
                        self.api_delay = min(120.0, max(12.0, self.api_delay * 2))
                    self.delay = self.api_delay if not download else max(2.0, self.download_delay * 4)
                    back = min(240.0, (20.0 if e.code == 429 else 3.0) * (2 ** attempt)
                               + random.uniform(0, 4))
                    if self.verbose:
                        print(f"      ! {e.code} -> 退避 {back:.0f}s（第 {attempt+1}/{self.max_retries} 次）",
                              flush=True)
                    time.sleep(back)
                    continue
                raise
            except Exception as e:  # 网络抖动
                self._last = time.time()
                last_err = f"{type(e).__name__}: {e}"
                self._ok_streak = 0
                back = min(30.0, (2 ** attempt) + random.uniform(0, 1.0))
                if self.verbose:
                    print(f"      ! {last_err} -> 退避 {back:.0f}s", flush=True)
                time.sleep(back)
        raise RuntimeError(f"fetch failed after {self.max_retries} tries: {url} ({last_err})")


def api_url(params: dict) -> str:
    params = dict(params)
    params.setdefault("format", "json")
    params.setdefault("formatversion", "2")
    return COMMONS_API + "?" + urllib.parse.urlencode(params)


# --------------------------------------------------------------------------
# 工具
# --------------------------------------------------------------------------

def norm_key(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip()).lower()


def strip_html(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def slug(word: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", word.lower())


# --------------------------------------------------------------------------
# 步骤 1：找候选音频文件名（Commons prefixsearch，批量 1 请求）
# --------------------------------------------------------------------------

def candidate_prefixes(word: str):
    """词 -> prefixsearch 前缀列表。En-<region>-<lemma> 三族 + 编号变体。"""
    out = []
    for accent, tags in ACCENTS.items():
        for tag in tags:
            out.append(f"File:En-{tag}-{word}")
    return out


def classify_title(title: str, word: str):
    """把 File:En-us-book.ogg 解析成 (accent, variant) —— 匹配不上返回 None。

    variant: '' 表示首选，'2' 表示 En-us-book-2.ogg 这类补充发音。
    严格校验中段，避免 book -> books/bookkeeping 误命中。
    """
    m = re.match(r"^File:En-([A-Za-z]{2})-([^/]+?)\.(ogg|oga|mp3|wav|flac)$", title or "")
    if not m:
        return None
    tag, middle, _ext = m.group(1).lower(), m.group(2), m.group(3).lower()
    accent = None
    for acc, tags in ACCENTS.items():
        if tag in tags:
            accent = acc
            break
    if accent is None:
        return None
    if norm_key(middle) == norm_key(word):
        return accent, ""
    m2 = re.match(r"^" + re.escape(word) + r"-(\d+)$", middle, re.IGNORECASE)
    if m2:
        return accent, m2.group(1)
    return None


def _merge(found, word, title):
    hit = classify_title(title, word)
    if hit:
        accent, variant = hit
        found.setdefault(word, {}).setdefault(accent, {}).setdefault(variant, title)


def prefix_search(f: Fetcher, words, chunk_size: int = 6) -> dict:
    """**请求数最小化**地找候选音频文件名。

    不逐词 prefixsearch（3 请求/词太贵），也不逐词 search（1 请求/词仍偏贵）。
    改为「一次 search 覆盖 chunk_size 个词」：Commons 匿名配额很紧，请求数必须压到 ~10 以内。
    正则一次匹配 us/uk/gb 全部候选，本地再用 classify_title 精确校验（避免 books/bookkeeping 误命中）。
    """
    found = {}
    for w in words:
        found[w] = {}
    for i in range(0, len(words), chunk_size):
        chunk = words[i:i + chunk_size]
        alt = "|".join(re.escape(w) for w in chunk)
        pattern = f"intitle:/^En-(us|uk|gb)-({alt})(-[0-9]+)?\\.(ogg|oga|mp3|wav|flac)$/i"
        url = api_url({
            "action": "query", "list": "search",
            "srsearch": pattern, "srnamespace": "6", "srlimit": "500",
        })
        body = json.loads(f.get(url))
        hits = body.get("query", {}).get("search") or []
        for p in hits:
            title = p.get("title", "")
            for w in chunk:
                # 注意：title 是 "File:En-us-book.ogg"，必须容忍 File: 前缀（不能 ^ 锚定）
                if re.search(r"(?:^|:)En-(us|uk|gb)-" + re.escape(w) + r"(-[0-9]+)?\.(ogg|oga|mp3|wav|flac)$",
                             title, re.IGNORECASE):
                    _merge(found, w, title)
        print(f"      chunk {i//chunk_size+1}: {len(hits)} 命中候选 -> {[w for w in chunk if found.get(w)]}")
    return found


# --------------------------------------------------------------------------
# 步骤 2：批量取授权元数据（imageinfo + extmetadata）
# --------------------------------------------------------------------------

META_KEYS = [
    "LicenseShortName", "License", "UsageTerms", "Artist", "Credit",
    "AttributionRequired", "Attribution", "Copyrighted", "Restrictions",
    "Categories", "ImageDescription", "DateTimeOriginal", "Permission",
]


def fetch_metadata(f: Fetcher, titles) -> dict:
    """批量（<=50 文件/次）取 extmetadata。返回 {title: meta_dict}。

    这是把请求数从 N 压到 N/50 的关键：Commons 匿名配额很紧。
    """
    out = {}
    titles = sorted(set(titles))
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        url = api_url({
            "action": "query",
            "titles": "|".join(chunk),
            "prop": "imageinfo",
            "iiprop": "url|mime|size|sha1|user|extmetadata",
        })
        body = json.loads(f.get(url))
        for page in (body.get("query", {}).get("pages") or []):
            title = page.get("title")
            if page.get("missing"):
                out[title] = {"missing": True}
                continue
            ii = (page.get("imageinfo") or [{}])[0]
            em = ii.get("extmetadata") or {}
            meta = {
                "missing": False,
                "uploader": ii.get("user"),
                "mime": ii.get("mime"),
                "size": ii.get("size"),
                "sha1": ii.get("sha1"),
                "file_url": (ii.get("url") or "").split("?")[0],
                "extmetadata": {k: strip_html(em.get(k, {}).get("value", "")) for k in META_KEYS},
                "extmetadata_raw_license": em.get("License", {}).get("value", ""),
            }
            out[title] = meta
        print(f"      meta chunk {i//50+1}: {len(chunk)} 文件")
    return out


# --------------------------------------------------------------------------
# 步骤 3：授权筛选（核心）
# --------------------------------------------------------------------------

def canonical_license(*tokens):
    """把 LicenseShortName / License / 分类串 等归一到白名单 key；不命中返回 None。"""
    for tok in tokens:
        t = (tok or "").strip().lower()
        if not t:
            continue
        # 归一写法：空格/下划线统一成连字符（"public domain"/"public_domain" -> "public-domain"）
        tn = t.replace("_", "-").replace(" ", "-")
        for k, v in LICENSE_TOKEN_MAP.items():
            if t == k or tn == k or tn == k.replace(" ", "-"):
                return v
        # "CC BY-SA 3.0" / "cc-by-sa-3.0" / "Creative Commons Attribution-Share Alike 3.0"
        m = re.search(r"cc[- ]?by[- ]?sa[- ]?([0-9.]+)", t)
        if m:
            key = f"cc-by-sa-{m.group(1)}"
            if key in ALLOW_LICENSES:
                return key
        m = re.search(r"cc[- ]?by[- ]?([0-9.]+)(?![- ]?sa)", t)
        if m:
            key = f"cc-by-{m.group(1)}"
            if key in ALLOW_LICENSES:
                return key
        if re.search(r"\bcc0\b|publicdomain/zero", tn):
            return "cc0"
        if re.search(r"public-domain|\bpd\b|^pd-", tn):
            return "pd"
    return None


def license_allowed(key: str) -> bool:
    return key in ALLOW_LICENSES


MIGRATION_NOTICE = re.compile(r"license migration redundant|gfdl migration|migration to cc", re.IGNORECASE)


def screen(meta: dict, accept_dual_license: bool = False):
    """返回 (status, reason, license_key, evidence)。

    status: allowed / rejected / needs_review

    只有在「许可明确允许商用 + 再分发」且「作者可确认」时才 allowed。
    实测发现两类必须人工确认的情形（本 PoC 的主要成本来源）：
      (1) Commons 分类同时挂 GFDL 与 CC BY-SA + "License migration redundant"
          —— GFDL 1.3 允许把 GFDL 作品按 CC BY-SA 3.0 继续使用，故 CC BY-SA 路径有效，
             但这是**法律判断**，默认不自动放行（可用 --accept-dual-license 显式接受并留证）。
      (2) Artist 与 uploader 同名（"Own work" 自发布）—— 需人工确认确为原作者。
    """
    if not meta or meta.get("missing"):
        return "needs_review", "Commons 上找不到该文件", None, {}

    em = meta.get("extmetadata") or {}
    short = em.get("LicenseShortName", "")
    lic = em.get("License", "")
    usage = em.get("UsageTerms", "")
    cats = em.get("Categories", "")
    copyrighted = em.get("Copyrighted", "")
    artist = em.get("Artist", "")
    uploader = meta.get("uploader") or ""
    ev_credit = em.get("Credit", "")

    blob = " | ".join(x for x in [short, lic, usage, cats, copyrighted] if x).lower()
    evidence = {
        "license_short_name": short, "license_field": lic,
        "usage_terms": usage, "categories": cats,
        "copyrighted": copyrighted, "uploader": uploader,
        "artist": artist, "credit": em.get("Credit", ""),
    }

    # 1) 明确拒绝优先
    for pat, why in REJECT_PATTERNS:
        if re.search(pat, blob):
            return "rejected", f"命中拒绝规则：{why}", None, evidence

    key = canonical_license(short, lic, usage, cats)
    if not key:
        return "needs_review", "无法从 extmetadata 确认许可", None, evidence
    if not license_allowed(key):
        return "rejected", f"许可不在白名单：{key}", key, evidence

    # 2) 作者确认：允许未知则 N/A，但绝不把 uploader 当作者
    artist_confirmed = bool(artist)
    if not artist:
        return "needs_review", "extmetadata 无 Artist（原作者无法确认）", key, evidence
    artist_is_uploader = bool(uploader) and norm_key(artist) == norm_key(uploader)

    # 3) 双许可 / GFDL 迁移提示
    has_gfdl = "gfdl" in blob
    migration = bool(MIGRATION_NOTICE.search(blob))

    if has_gfdl:
        if accept_dual_license and migration:
            # 双重放行条件（都必须留证）：
            #   a) 明确许可 + GFDL 迁移提示（GFDL 1.3 允许按 CC BY-SA 3.0 继续使用）
            #   b) 若是自发布（Artist==uploader），还必须有 Credit="Own work"
            #      —— 真正的风险是"转载他人作品冒名上传"，而不是"自己录音自己上传"
            if artist_is_uploader and norm_key(ev_credit) != "own work":
                return ("needs_review",
                        f"双许可（{key} + GFDL，含迁移提示）但 Artist==uploader 且 Credit≠Own work，仍需人工确认",
                        key, evidence)
            note = "dual-license accepted: GFDL 迁移提示 + CC BY-SA 路径有效"
            if artist_is_uploader:
                note += "；Credit=Own work（自发布）"
            evidence["resolution"] = note + "；已留证"
            return "allowed", f"双许可已接受：{key}（GFDL 迁移提示已留证）", key, evidence
        return "needs_review", f"GFDL（copyleft，音频再分发义务复杂）与 {key} 并存，需人工拍板", key, evidence

    # 4) 自发布署名
    if artist_is_uploader:
        if accept_dual_license and norm_key(ev_credit) == "own work":
            evidence["resolution"] = "self-published 'Own work' + 明确许可；已留证"
            return "allowed", f"自发布 Own work + {key}（已留证）", key, evidence
        return "needs_review", "Artist 与 uploader 同名（需人工确认是否为原作者）", key, evidence

    return "allowed", "许可与作者均可确认", key, evidence


# --------------------------------------------------------------------------
# 步骤 4：下载（原图 vs 转码 mp3）
# --------------------------------------------------------------------------

def get_derivatives(f: Fetcher, title: str):
    url = api_url({
        "action": "query", "titles": title,
        "prop": "videoinfo", "viprop": "derivatives",
    })
    body = json.loads(f.get(url))
    for page in (body.get("query", {}).get("pages") or []):
        vi = (page.get("videoinfo") or [{}])[0]
        return vi.get("derivatives") or []
    return []


def mp3_transcode_url(file_url: str):
    """由原文件 URL 推算 Commons 转码 mp3（避免再发一次 videoinfo 请求）。

    规则：/commons/<a>/<ab>/<File> -> /commons/transcoded/<a>/<ab>/<File>/<File>.mp3
    其中 <a>/<ab> 来自文件名 md5 的前两位 —— 与原文件 URL 里已有的前缀一致，直接复用。
    """
    m = re.match(r"^(https://upload\.wikimedia\.org/wikipedia/commons)/([0-9a-f])/([0-9a-f]{2})/(.+)$", file_url or "")
    if not m:
        return None
    base, a, ab, name = m.groups()
    return f"{base}/transcoded/{a}/{ab}/{name}/{name}.mp3"


def pick_download_url(meta: dict, derivatives=None):
    """优先 mp3 转码（体积小、移动端友好）；推算失败则回退原始文件。"""
    mp3 = mp3_transcode_url(meta.get("file_url", ""))
    if mp3:
        return mp3, "mp3-transcode"
    return meta.get("file_url"), "original"


# --------------------------------------------------------------------------
# 步骤 5：可播放性校验（无需第三方库，解析头 + 估算时长）
# --------------------------------------------------------------------------

def mp3_info(blob: bytes):
    """极简 MP3 解析：返回 (ok, duration_sec, bitrate_kbps, sample_rate)。"""
    if len(blob) < 4:
        return False, None, None, None
    if blob[:3] != b"ID3" and blob[0] != 0xFF:
        return False, None, None, None
    # 跳过 ID3v2
    i = 0
    if blob[:3] == b"ID3" and len(blob) > 10:
        size = ((blob[6] & 0x7F) << 21) | ((blob[7] & 0x7F) << 14) | ((blob[8] & 0x7F) << 7) | (blob[9] & 0x7F)
        i = 10 + size
    scan = blob[i:]
    for j in range(min(len(scan) - 4, 200000)):
        if scan[j] == 0xFF and (scan[j + 1] & 0xE0) == 0xE0:
            h = scan[j:j + 4]
            br_table = {
                (3, 1): [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
                (3, 2): [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
                (3, 3): [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
            }
            ver = (h[1] >> 3) & 0x03
            layer = (h[1] >> 1) & 0x03
            br_idx = (h[2] >> 4) & 0x0F
            sr_idx = (h[2] >> 2) & 0x03
            sr_table = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}
            if ver == 1 or layer == 0 or br_idx in (0, 15) or sr_idx == 3:
                continue
            sb = br_table.get((ver, layer))
            if not sb or sb[br_idx] == 0:
                continue
            bitrate = sb[br_idx]
            sr = sr_table.get(ver, [44100])[sr_idx]
            duration = (len(blob) - i) * 8 / (bitrate * 1000)
            return True, round(duration, 2), bitrate, sr
    return False, None, None, None


def ogg_info(blob: bytes):
    if blob[:4] != b"OggS":
        return False, None, None, None
    return True, None, None, None



# --------------------------------------------------------------------------
# 台账写入（main 与 resolve_review 共用，避免两份实现漂移）
# --------------------------------------------------------------------------

def compute_stats(records, found, words, accents):
    """两层统计：input（Commons 上是否有文件）/ output（是否通过授权筛选）。"""
    file_exists = {"us_found": 0, "uk_found": 0, "both": 0,
                   "only_us": 0, "only_uk": 0, "neither": 0}
    usable = {a: 0 for a in accents}
    for w in words:
        has = {}
        for acc in accents:
            has[acc] = bool((found.get(w) or {}).get(acc))
            if any(r["word"] == w and r["accent"] == acc and r["status"] == "allowed"
                   for r in records):
                usable[acc] += 1
        if has["us"]:
            file_exists["us_found"] += 1
        if has["uk"]:
            file_exists["uk_found"] += 1
        if has["us"] and has["uk"]:
            file_exists["both"] += 1
        elif has["us"]:
            file_exists["only_us"] += 1
        elif has["uk"]:
            file_exists["only_uk"] += 1
        else:
            file_exists["neither"] += 1
    by_status = {}
    for r in records:
        by_status[r["status"]] = by_status.get(r["status"], 0) + 1
    return file_exists, usable, by_status


def write_artifacts(manifest, out, words, accents, found=None, requests=None,
                    rate429=0, downloads=None, accept_dual_license=False):
    """写出 manifest.json / attribution.csv / review_queue.csv（+ stats.json）。"""
    records = manifest["records"]
    os.makedirs(out, exist_ok=True)

    # 把下载所需的扁平字段从内部 meta 提到记录上：
    # 人工复核工具（resolve_review.py）必须能在**不重新联网查元数据**的情况下补下载，
    # 所以 manifest 里必须留下 file_url；原先只在内存里保留 meta，人工复核就拿不到下载地址。
    for r in records:
        m = r.pop("meta", None)
        if m:
            r.setdefault("file_url", m.get("file_url"))
            r.setdefault("file_sha1", m.get("sha1"))
            r.setdefault("file_mime", m.get("mime"))

    if downloads is not None:
        manifest["downloads"] = downloads
    if requests is not None:
        manifest["requests_made"] = requests
    manifest["rate_limited_429"] = rate429
    manifest["generated_at"] = datetime.now(timezone.utc).isoformat()
    with open(os.path.join(out, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)

    # ---- attribution.csv：白名单音频的署名台账 ----
    with open(os.path.join(out, "attribution.csv"), "w", encoding="utf-8-sig", newline="") as fh:
        wtr = csv.writer(fh)
        wtr.writerow([
            "word", "accent", "commons_file", "source_page_url", "author_original",
            "uploader", "license_name", "license_url", "attribution_text",
            "sha256", "local_path", "is_modified", "resolution",
            "verified_by", "verified_at", "status",
        ])
        for r in records:
            if r["status"] != "allowed":
                continue
            ev = r.get("evidence") or {}
            key = r.get("license_key")
            author = ev.get("artist") or ""
            lic_name = ALLOW_LICENSES.get(key, key or "")
            lic_url = LICENSE_URL.get(key, "")
            page = "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(
                (r["title"] or "").replace(" ", "_"))
            tmpl = ATTRIBUTION_TEMPLATES.get(
                key, '{author}. "{file}". {source_page}, {license_name}.')
            attr = tmpl.format(
                author=author or "(作者见来源页)",
                file=(r["title"] or "").replace("File:", ""),
                source_page=page, license_name=lic_name, license_url=lic_url)
            wtr.writerow([
                r["word"], r["accent"], r["title"], page, author,
                ev.get("uploader", ""), lic_name, lic_url, attr,
                r.get("sha256", ""), r.get("local_path", ""), "false",
                ev.get("resolution", ""), ev.get("reviewer", ""), ev.get("reviewed_at", ""),
                r["status"],
            ])

    # ---- review_queue.csv：待人工拍板的条目 + 证据 + 建议动作 ----
    with open(os.path.join(out, "review_queue.csv"), "w", encoding="utf-8-sig", newline="") as fh:
        wtr = csv.writer(fh)
        wtr.writerow([
            "word", "accent", "commons_file", "license_name", "license_field",
            "usage_terms", "artist", "uploader", "copyrighted", "reason",
            "source_page_url", "suggested_action",
        ])
        for r in records:
            if r["status"] != "needs_review" or not r.get("title"):
                continue
            ev = r.get("evidence") or {}
            key = r.get("license_key")
            page = "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(
                (r["title"] or "").replace(" ", "_"))
            if "GFDL" in (r.get("reason") or ""):
                if accept_dual_license:
                    action = "GFDL 存在但无迁移提示：需人工到文件页确认适用许可；开关无法放行"
                elif key:
                    action = ("GFDL 1.3 允许按 CC BY-SA 3.0 使用；如接受双许可，"
                              "用 --accept-dual-license 重跑并留证")
                else:
                    action = "许可不明确，建议弃用"
            elif "同名" in (r.get("reason") or ""):
                action = "确认为作者本人自发布（Credit=Own work）后可接受；否则弃用"
            elif "Artist" in (r.get("reason") or ""):
                action = "到文件页人工确认原作者；无法确认则弃用"
            else:
                action = "人工确认许可；无法确认则弃用"
            wtr.writerow([
                r["word"], r["accent"], r["title"],
                ALLOW_LICENSES.get(key, key or ""), ev.get("license_field", ""),
                ev.get("usage_terms", ""), ev.get("artist", ""), ev.get("uploader", ""),
                ev.get("copyrighted", ""), r.get("reason", ""), page, action,
            ])

    if found is not None:
        file_exists, usable, by_status = compute_stats(records, found, words, accents)
        with open(os.path.join(out, "stats.json"), "w", encoding="utf-8") as fh:
            json.dump({"file_exists": file_exists, "usable": usable,
                       "by_status": by_status, "requests": requests,
                       "rate_limited_429": rate429}, fh, ensure_ascii=False, indent=2)
        return file_exists, usable, by_status
    return None, None, None


# --------------------------------------------------------------------------
# 主流程
# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    ap.add_argument("--delay", type=float, default=12.0, help="Commons API 起步请求间隔秒（实测 <5s 会 429）")
    ap.add_argument("--retries", type=int, default=3)
    ap.add_argument("--no-download", action="store_true", help="只做筛选，不下载")
    ap.add_argument("--max-bytes", type=int, default=5 * 1024 * 1024)
    ap.add_argument("--accept-dual-license", action="store_true",
                    help="显式接受「GFDL + CC BY-SA 且含迁移提示」与「Own work 自发布」两类，"
                         "会在台账 resolution 列留证（默认不自动放行，输出复核队列）")
    args = ap.parse_args()

    out = os.path.abspath(args.out)
    audio_dir = os.path.join(out, "audio")
    for acc in ACCENTS:
        os.makedirs(os.path.join(audio_dir, acc), exist_ok=True)
    os.makedirs(os.path.join(out, "tools"), exist_ok=True)

    f = Fetcher(delay=args.delay, max_retries=args.retries)
    started = datetime.now(timezone.utc).isoformat()

    print("=" * 78)
    print(f"Wordbook 发音 PoC | {len(WORDS)} 词 | out={out}")
    print("=" * 78)

    print("\n[1/6] 找候选音频文件（Commons list=search，批量）...")
    found = prefix_search(f, WORDS)
    for w in WORDS:
        accs = found.get(w) or {}
        summary = ", ".join(f"{a}:{len(v)}" for a, v in sorted(accs.items())) or "无"
        print(f"      {w:<12} {summary}")

    print("\n[2/6] 取授权元数据（批量 imageinfo + extmetadata）...")
    all_titles = []
    for w in WORDS:
        for acc, variants in (found.get(w) or {}).items():
            all_titles.extend(variants.values())
    meta = fetch_metadata(f, all_titles)
    print(f"      请求 {len(all_titles)} 个文件 -> 返回 {len(meta)} 条元数据")

    print("\n[3/6] 授权筛选（只接受允许商用 + 再分发；无法确认 -> rejected/needs_review）...")
    rows = []
    for w in WORDS:
        for acc in ACCENTS:
            variants = (found.get(w) or {}).get(acc) or {}
            if not variants:
                rows.append({
                    "word": w, "accent": acc, "title": None, "status": "no_file",
                    "reason": "Commons 上未找到该口音的音频", "license_key": None,
                })
                continue
            for variant in sorted(variants):
                title = variants[variant]
                m = meta.get(title)
                status, reason, key, ev = screen(m, accept_dual_license=args.accept_dual_license)
                rows.append({
                    "word": w, "accent": acc, "title": title, "variant": variant,
                    "status": status, "reason": reason, "license_key": key,
                    "evidence": ev, "meta": m,
                })
                flag = {"allowed": "OK  ", "rejected": "REJ ", "needs_review": "REV "}.get(status, "?   ")
                print(f"      [{flag}] {w:<12} {acc} {title:<34} {key or '-':<12} {reason}")

    print("\n[4/6] 下载通过筛选的音频（优先 mp3 转码；限速 + 退避）...")
    downloaded = []
    if not args.no_download:
        for r in rows:
            if r["status"] != "allowed":
                continue
            title = r["title"]
            m = r["meta"]
            try:
                dl_url, kind = pick_download_url(m)
                if not dl_url:
                    r["status"] = "needs_review"
                    r["reason"] = "没有可用下载地址"
                    continue
                try:
                    blob = f.get(dl_url, download=True)
                except urllib.error.HTTPError as e:
                    # 404：该文件没有转码版；429：转码按需生成时被限流
                    # 两种都回退到原始文件（原始文件走 CDN 缓存，配额宽松）
                    if e.code in (404, 429) and kind == "mp3-transcode":
                        note = "转码 mp3 不可用/被限流" if e.code == 429 else "无转码 mp3"
                        dl_url, kind = m.get("file_url"), "original"
                        blob = f.get(dl_url, download=True)
                        r["fallback_note"] = note
                    else:
                        raise
                if len(blob) > args.max_bytes:
                    r["status"] = "needs_review"
                    r["reason"] = f"文件过大（{len(blob)} bytes）"
                    continue
                ext = ".mp3" if kind == "mp3-transcode" or dl_url.lower().endswith(".mp3") else ".ogg"
                fname = f"{slug(r['word'])}-{r['accent']}{'' if not r.get('variant') else '-' + r['variant']}{ext}"
                path = os.path.join(audio_dir, r["accent"], fname)
                with open(path, "wb") as fh:
                    fh.write(blob)
                digest = sha256_bytes(blob)
                if ext == ".mp3":
                    ok, dur, br, sr = mp3_info(blob)
                else:
                    ok, dur, br, sr = ogg_info(blob)
                r.update({
                    "local_path": os.path.relpath(path, out).replace("\\", "/"),
                    "download_url": dl_url, "download_kind": kind,
                    "bytes": len(blob), "sha256": digest,
                    "playable_header_ok": ok, "duration_sec": dur,
                    "bitrate_kbps": br, "sample_rate": sr,
                })
                if not ok:
                    r["status"] = "needs_review"
                    r["reason"] = "文件已下载但头部解析失败（疑似不可播放）"
                downloaded.append(r)
                print(f"      [DL ] {r['word']:<12} {r['accent']} {fname:<26} {len(blob):>7}B {digest[:12]} dur={dur}")
            except Exception as e:
                r["status"] = "needs_review"
                r["reason"] = f"下载失败：{type(e).__name__}: {str(e)[:120]}"
                print(f"      [ERR] {r['word']:<12} {r['accent']} {title} -> {r['reason']}")

    print("\n[5/6] 写台账（manifest.json / attribution.csv / review_queue.csv）...")
    manifest = {
        "poc": "wordbook-audio-poc",
        "started_at": started,
        "words_requested": len(WORDS),
        "words": WORDS,
        "policy": {
            "allowed_licenses": ALLOW_LICENSES,
            "rejected_patterns": [p for p, _ in REJECT_PATTERNS],
            "review_patterns": [p for p, _ in REVIEW_PATTERNS],
            "accept_dual_license": args.accept_dual_license,
            "rule": ("只接受明确允许 commercial use + republication/distribution 的许可；"
                     "无法确认 -> rejected/needs_review，不进入白名单"),
        },
        "sources": {
            "file_index": "Commons API list=search（正则批量匹配，非逐词页面抓取）",
            "license_metadata": "Commons API prop=imageinfo&iiprop=extmetadata（50 文件/请求）",
            "download": "Commons 转码 mp3（由原文件 URL 推算）优先，429/404 时回退原始文件",
        },
        # 不要在这里剥掉 meta：由 write_artifacts 统一提取 file_url 后再剥离，
        # 否则人工复核工具拿不到下载地址（manifest 里必须留 file_url）。
        "records": rows,
    }
    stats, usable, by_status = write_artifacts(
        manifest, out, WORDS, ACCENTS, found=found,
        requests=f.requests, rate429=f.rate429, downloads=len(downloaded),
        accept_dual_license=args.accept_dual_license)
    print(f"      已写入 {out}")

    print("\n[6/6] 统计 ...")
    print(json.dumps({
        "文件存在（input 层面）": stats,
        "可通过授权筛选并下载（output 层面）": usable,
        "记录状态分布": by_status,
        "API 请求数": f.requests,
        "429 次数": f.rate429,
    }, ensure_ascii=False, indent=2))

    print("\n完成。")


if __name__ == "__main__":
    sys.exit(main())

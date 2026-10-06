#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PoC 通道探测：找出「不逐词抓 Commons 页面」也能拿到音频文件名与授权元数据的可行通道。

只做探测，不写入白名单、不下载音频。
"""
import json
import re
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request

socket.setdefaulttimeout(25)
UA = "wordbook-audio-poc/0.1 (research; independent PoC; contact: local-dev)"

OUT = {}


def get(url, headers=None, raw=False, max_bytes=None):
    h = {"User-Agent": UA, "Accept": "*/*"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req) as r:
        if max_bytes:
            data = r.read(max_bytes)
        else:
            data = r.read()
        return r.status, (data if raw else data.decode("utf-8", "replace"))


def try_get(label, url, **kw):
    try:
        st, body = get(url, **kw)
        print(f"[OK ] {st} {label}  ({len(body)} bytes)")
        return body
    except urllib.error.HTTPError as e:
        print(f"[HTTP {e.code}] {label}")
    except Exception as e:
        print(f"[ERR] {label}: {type(e).__name__} {str(e)[:80]}")
    return None


# 只探测 kaikki 入口是否存在，绝不整包下载
MAX_PROBE = 200_000


COMMONS_API = "https://commons.wikimedia.org/w/api.php"

print("=" * 70)
print("A. kaikki 是否有「按词」入口（避免下 20GB / 2.8GB 全量包）")
print("=" * 70)
for path in [
    "/dictionary/English/index.html",
    "/dictionary/en/index.html",
    "/dictionary/English/",
]:
    try_get(f"kaikki{path}", "https://kaikki.org" + path, max_bytes=MAX_PROBE)

print()
print("=" * 70)
print("B. Commons API: prefixsearch（一次请求拿某词的全部音频文件名）")
print("=" * 70)
for prefix in ["En-us-book", "En-uk-book", "En-us-apple"]:
    q = urllib.parse.urlencode({
        "action": "query", "list": "prefixsearch", "pssearch": f"File:{prefix}",
        "pslimit": "50", "format": "json",
    })
    body = try_get(f"prefixsearch {prefix}", f"{COMMONS_API}?{q}")
    if body:
        try:
            d = json.loads(body)
            pages = (d.get("query") or {}).get("prefixsearch") or []
            print("     ->", [p.get("title") for p in pages][:12])
        except Exception as e:
            print("     parse fail", e)

print()
print("=" * 70)
print("C. Commons API: 文件页 extmetadata（author / license / usage terms）")
print("=" * 70)
title = "File:En-us-book.ogg"
q = urllib.parse.urlencode({
    "action": "query", "titles": title, "prop": "imageinfo",
    "iiprop": "url|mime|size|sha1|extmetadata|user",
    "format": "json",
})
body = try_get(f"imageinfo {title}", f"{COMMONS_API}?{q}")
if body:
    d = json.loads(body)
    pages = d.get("query", {}).get("pages", {})
    for _pid, page in pages.items():
        if "missing" in page:
            print("     -> MISSING:", page.get("title"))
            continue
        ii = (page.get("imageinfo") or [{}])[0]
        em = ii.get("extmetadata") or {}
        keys = ["LicenseShortName", "License", "UsageTerms", "Artist", "Credit",
                "AttributionRequired", "Attribution", "Copyrighted", "Restrictions",
                "Categories", "ImageDescription"]
        print("     -> title:", page.get("title"))
        print("     -> user(uploader):", ii.get("user"))
        print("     -> mime:", ii.get("mime"), "size:", ii.get("size"))
        print("     -> url:", ii.get("url"))
        for k in keys:
            v = em.get(k, {}).get("value")
            if v:
                v = re.sub(r"<[^>]+>", " ", str(v))
                v = re.sub(r"\s+", " ", v).strip()
                print(f"        {k}: {v[:160]}")

print()
print("=" * 70)
print("D. Commons API: videoinfo derivatives（是否已有转码 mp3，避免本地转码）")
print("=" * 70)
q = urllib.parse.urlencode({
    "action": "query", "titles": title, "prop": "videoinfo",
    "viprop": "derivatives", "format": "json",
})
body = try_get(f"videoinfo derivatives {title}", f"{COMMONS_API}?{q}")
if body:
    d = json.loads(body)
    pages = d.get("query", {}).get("pages", {})
    for _pid, page in pages.items():
        vi = (page.get("videoinfo") or [{}])[0]
        for der in (vi.get("derivatives") or []):
            print("     ->", der.get("type"), der.get("transcodekey"),
                  der.get("src", "")[:120])

print()
print("=" * 70)
print("E. 直连 en.wiktionary 词条页（拿 audio 文件名，1 词 1 请求）")
print("=" * 70)
body = try_get("en.wiktionary.org/wiki/book", "https://en.wiktionary.org/wiki/book")
if body:
    files = sorted(set(re.findall(r'(En-[A-Za-z\-0-9_]+\.(?:ogg|oga|mp3|wav))', body)))
    print("     -> audio file candidates:", files[:20])

print()
print("=" * 70)
print("F. 音频 CDN 可下载性 + 类型探测")
print("=" * 70)
url = "https://upload.wikimedia.org/wikipedia/commons/2/22/En-us-book.ogg"
try:
    st, blob = get(url, raw=True)
    print(f"[OK ] {st} bytes={len(blob)} magic={blob[:4]!r} {url}")
except Exception as e:
    print(f"[ERR] {url}: {type(e).__name__} {str(e)[:100]}")

print()
print("done")

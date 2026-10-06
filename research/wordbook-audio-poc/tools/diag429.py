#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""429 来源与配额诊断：分别测 API 与 upload 主机，打印状态码/Retry-After/配额头。"""
import json
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from email.utils import parsedate_to_datetime

socket.setdefaulttimeout(25)
UA = "wordbook-audio-poc/0.1 (independent research PoC; python-urllib; contact: local-dev)"

CASES = [
    ("API  list=search (1 词)",
     "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
         "action": "query", "list": "search",
         "srsearch": "intitle:/^En-us-book\\.(ogg|oga|mp3)$/i",
         "srnamespace": "6", "srlimit": "5", "format": "json", "formatversion": "2"})),
    ("API  meta=siteinfo (最轻)",
     "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
         "action": "query", "meta": "siteinfo", "format": "json", "formatversion": "2"})),
    ("API  imageinfo 单文件",
     "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
         "action": "query", "titles": "File:En-us-book.ogg", "prop": "imageinfo",
         "iiprop": "url|extmetadata", "format": "json", "formatversion": "2"})),
    ("UPLOAD 原始 ogg",
     "https://upload.wikimedia.org/wikipedia/commons/3/3d/En-us-book.ogg"),
    ("UPLOAD 转码 mp3",
     "https://upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/En-us-book.ogg/En-us-book.ogg.mp3"),
]

for label, url in CASES:
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "*/*",
        "Accept-Encoding": "identity",
        "Referer": "https://commons.wikimedia.org/",
    })
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            body = r.read(1500)
            hdrs = {k.lower(): v for k, v in r.headers.items()}
            print(f"[OK  ] {r.status} {label}")
            print(f"        bytes={len(body)} time={time.time()-t0:.1f}s")
            for h in ("x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-policy",
                      "retry-after", "cache-control", "age", "x-cache", "content-type"):
                if h in hdrs:
                    print(f"        {h}: {hdrs[h]}")
            if label.startswith("API"):
                print("        body[:160]:", body[:160])
    except urllib.error.HTTPError as e:
        hdrs = {k.lower(): v for k, v in (e.headers or {}).items()}
        print(f"[HTTP{e.code}] {label}")
        print(f"        time={time.time()-t0:.1f}s")
        for h in ("x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-policy",
                  "retry-after", "x-cache", "server"):
            if h in hdrs:
                print(f"        {h}: {hdrs[h]}")
        try:
            print("        body[:200]:", e.read(200))
        except Exception:
            pass
    except Exception as e:
        print(f"[ERR ] {label}: {type(e).__name__} {str(e)[:90]}")
    time.sleep(2.0)

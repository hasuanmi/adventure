#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PoC 单元测试：文件名分类 + 授权筛选 + 许可归一 + mp3 头解析。

这些判定是整条流水线的"真值边界"，必须固化成测试，不能靠肉眼看日志。
运行：python tools/test_poc.py
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from poc_fetch import (  # noqa: E402
    canonical_license, classify_title, license_allowed, mp3_info, mp3_transcode_url, screen,
)


def meta(short="", lic="", usage="", cats="", artist="", uploader="X", copyrighted="", credit=""):
    return {
        "missing": False,
        "uploader": uploader,
        "file_url": "https://upload.wikimedia.org/wikipedia/commons/3/3d/En-us-book.ogg",
        "extmetadata": {
            "LicenseShortName": short, "License": lic, "UsageTerms": usage,
            "Categories": cats, "Artist": artist, "Copyrighted": copyrighted,
            "Credit": credit, "AttributionRequired": "true", "Restrictions": "",
        },
    }


class TestClassifyTitle(unittest.TestCase):
    """文件名必须精确绑定到目标词，不能把 books/bookkeeping 当成 book。"""

    def test_exact_us_uk(self):
        self.assertEqual(classify_title("File:En-us-book.ogg", "book"), ("us", ""))
        self.assertEqual(classify_title("File:En-uk-book.ogg", "book"), ("uk", ""))
        self.assertEqual(classify_title("File:En-gb-water.ogg", "water"), ("uk", ""))

    def test_numbered_variant(self):
        self.assertEqual(classify_title("File:En-us-book-2.ogg", "book"), ("us", "2"))

    def test_reject_other_lemma(self):
        # 关键回归：这些都不是 book 的发音文件
        self.assertIsNone(classify_title("File:En-us-books.ogg", "book"))
        self.assertIsNone(classify_title("File:En-us-bookkeeping.oga", "book"))
        self.assertIsNone(classify_title("File:En-us-book-keeping.ogg", "book"))

    def test_reject_other_family(self):
        # LL-Q1860 系列不是 En-us/En-uk 命名族，本 PoC 不收
        self.assertIsNone(classify_title("File:LL-Q1860 (eng)-Vealhurl-book.wav", "book"))

    def test_case_insensitive_word(self):
        self.assertEqual(classify_title("File:En-us-English.ogg", "English"), ("us", ""))


class TestCanonicalLicense(unittest.TestCase):
    def test_cc_by_sa_3(self):
        self.assertEqual(canonical_license("CC BY-SA 3.0", "cc-by-sa-3.0"), "cc-by-sa-3.0")

    def test_cc_by_3_us(self):
        self.assertEqual(canonical_license("BY 3.0 US", "cc-by-3.0-us"), "cc-by-3.0-us")

    def test_cc0(self):
        self.assertEqual(canonical_license("CC0", "cc-zero"), "cc0")

    def test_public_domain(self):
        # 注意参数顺序反映真实调用：短名可能排在前，不能依赖"先命中短名"
        self.assertEqual(canonical_license("Public domain", "pd"), "pd")
        self.assertEqual(canonical_license("pd", "Public domain"), "pd")
        self.assertEqual(canonical_license("PD-US", ""), "pd")

    def test_unknown(self):
        self.assertIsNone(canonical_license("", "", "some random string"))

    def test_allowed_set(self):
        for k in ("cc0", "pd", "cc-by-3.0", "cc-by-sa-3.0"):
            self.assertTrue(license_allowed(k), k)
        for k in ("gfdl", "cc-by-nc-3.0", ""):
            self.assertFalse(license_allowed(k), k)


class TestScreen(unittest.TestCase):
    """授权筛选：只有明确允许商用 + 再分发 + 作者可确认才 allowed。"""

    def test_allowed_cc_by_sa(self):
        st, reason, key, _ = screen(meta(
            short="CC BY-SA 3.0", lic="cc-by-sa-3.0", usage="Creative Commons Attribution-Share Alike 3.0",
            artist="Dvortygirl", uploader="Someone Else"))
        self.assertEqual(st, "allowed", reason)
        self.assertEqual(key, "cc-by-sa-3.0")

    def test_needs_review_when_no_license(self):
        st, _, _, _ = screen(meta(artist="Someone"))
        self.assertEqual(st, "needs_review")

    def test_rejected_nc(self):
        st, reason, _, _ = screen(meta(short="CC BY-NC 3.0", lic="cc-by-nc-3.0",
                                       usage="Non-commercial", artist="A", uploader="B"))
        self.assertEqual(st, "rejected", reason)

    def test_rejected_all_rights_reserved(self):
        st, _, _, _ = screen(meta(short="All Rights Reserved", artist="A"))
        self.assertEqual(st, "rejected")

    def test_needs_review_when_artist_missing(self):
        st, reason, _, _ = screen(meta(short="CC BY-SA 3.0", lic="cc-by-sa-3.0", artist=""))
        self.assertEqual(st, "needs_review")
        self.assertIn("Artist", reason)

    def test_needs_review_when_artist_equals_uploader(self):
        # 上传者自称作者：仍要人工确认，不能自动放行
        st, _, _, _ = screen(meta(short="CC BY-SA 3.0", lic="cc-by-sa-3.0",
                                  artist="Dvortygirl", uploader="Dvortygirl"))
        self.assertEqual(st, "needs_review")

    def test_needs_review_gfdl_mixed_with_cc(self):
        # 本 PoC 实测：book 的 Commons 分类同时含 GFDL 与 CC-BY-SA-3.0 -> 默认人工复核
        st, reason, key, _ = screen(meta(
            short="CC BY-SA 3.0", lic="cc-by-sa-3.0",
            cats="U.S. English pronunciation|GFDL|CC-BY-SA-3.0,2.5,2.0,1.0|License migration redundant|Self-published work",
            artist="Dvortygirl", uploader="SomeoneElse"))
        self.assertEqual(st, "needs_review", reason)
        self.assertEqual(key, "cc-by-sa-3.0")

    def test_accept_dual_license_resolves_gfdl(self):
        # 显式接受双许可 + 迁移提示，且作者≠上传者 -> 放行并留证
        st, reason, key, ev = screen(meta(
            short="CC BY-SA 3.0", lic="cc-by-sa-3.0",
            cats="U.S. English pronunciation|GFDL|CC-BY-SA-3.0,2.5,2.0,1.0|License migration redundant",
            artist="Dvortygirl", uploader="SomeoneElse"), accept_dual_license=True)
        self.assertEqual(st, "allowed", reason)
        self.assertIn("resolution", ev)

    def test_self_published_own_work_rejected_by_default(self):
        # Dvortygirl 自发布 "Own work"：默认（不放行开关）-> needs_review
        st, reason, key, _ = screen(meta(
            short="Public domain", lic="pd", usage="Public domain",
            cats="U.S. English pronunciation|Self-published work|PD-self",
            artist="Dvortygirl", uploader="Dvortygirl", credit="Own work"),
            accept_dual_license=False)
        self.assertEqual(st, "needs_review", reason)

    def test_self_published_own_work_allowed_with_flag(self):
        # 显式接受后放行，并写入 resolution 留证
        st, reason, key, ev = screen(meta(
            short="Public domain", lic="pd", usage="Public domain",
            cats="U.S. English pronunciation|Self-published work|PD-self",
            artist="Dvortygirl", uploader="Dvortygirl", credit="Own work"),
            accept_dual_license=True)
        self.assertEqual(st, "allowed", reason)
        self.assertIn("resolution", ev)

    def test_self_published_without_own_work_still_review(self):
        # 同名但 Credit 不是 Own work -> 即便开了开关也不放行（防"转载冒名"）
        m = meta(short="CC BY-SA 3.0", lic="cc-by-sa-3.0",
                 cats="GFDL|CC-BY-SA-3.0|License migration redundant",
                 artist="Someone", uploader="Someone")
        m["extmetadata"]["Credit"] = "Transferred from elsewhere"
        st, _, _, _ = screen(m, accept_dual_license=True)
        self.assertEqual(st, "needs_review")

    def test_gfdl_without_migration_not_auto_allowed(self):
        st, _, _, _ = screen(meta(
            short="CC BY-SA 3.0", lic="cc-by-sa-3.0", cats="GFDL|CC-BY-SA-3.0",
            artist="A", uploader="B"), accept_dual_license=True)
        self.assertEqual(st, "needs_review")

    def test_missing_file(self):
        st, _, _, _ = screen({"missing": True})
        self.assertEqual(st, "needs_review")


class TestMp3(unittest.TestCase):
    def test_transcode_url_derivation(self):
        u = mp3_transcode_url("https://upload.wikimedia.org/wikipedia/commons/3/3d/En-us-book.ogg")
        self.assertEqual(
            u,
            "https://upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/En-us-book.ogg/En-us-book.ogg.mp3",
        )

    def test_transcode_url_none_for_foreign_host(self):
        self.assertIsNone(mp3_transcode_url("https://example.com/a/b/c.ogg"))

    def test_mp3_header_reject_garbage(self):
        self.assertEqual(mp3_info(b"not an mp3 at all")[0], False)

    def test_mp3_header_accept_synthetic_frame(self):
        # 0xFF 0xFB 0x90 0x00 = MPEG1 Layer3 128kbps 44.1kHz
        frame = bytes([0xFF, 0xFB, 0x90, 0x00]) + b"\x00" * 2000
        ok, dur, br, sr = mp3_info(frame)
        self.assertTrue(ok)
        self.assertEqual(br, 128)
        self.assertEqual(sr, 44100)
        self.assertGreater(dur, 0.05)


if __name__ == "__main__":
    unittest.main(verbosity=2)

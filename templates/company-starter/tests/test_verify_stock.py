"""verify.py の STOCK カテゴリ（STOCK-01〜06）の unittest スイート（Issue #80）。

対象: verify_stock() — notes/ L2 記述層の Obsidian 互換規約を機械検証するチェック群。
docs/decisions/2026-07-03-obsidian-context-stock.md（Decision RFC）§6 で定義された
RQT を1つずつ pin する。既存カテゴリ（test_verify_declarative.py 等）と同じく、
PASS 側だけでなく WARN/FAIL/INFO 側も必ず確認する（偽緑禁止）。

verify.py 本体は一切変更しない（Issue #80 の Scope Contract）。

実行:
    python3 -m unittest discover -s tests -p "test_verify_stock.py" -v
"""

import os
import time
import unittest
from datetime import datetime, timedelta, timezone

import helpers  # noqa: F401  (import 副作用で scripts/ が sys.path に入る)
import verify
from helpers import VerifyTestCase


def _frontmatter(fields, body="Note body.\n"):
    """dict から frontmatter ブロック付きノート本文を組み立てる。"""
    lines = ["---"]
    for k, v in fields.items():
        if isinstance(v, (list, tuple)):
            lines.append(f"{k}: [{', '.join(v)}]")
        else:
            lines.append(f"{k}: {v}")
    lines.append("---")
    return "\n".join(lines) + "\n" + body


_BASE_FIELDS = {
    "status": "active",
    "created": "2026-01-01",
    "updated": "2026-01-01",
    "tags": ["note"],
}


class StockTest(VerifyTestCase):
    # --------------------------------------------------------------
    # STOCK-01: frontmatter 必須キー（type 別）
    # --------------------------------------------------------------
    def test_stock01_fail_missing_frontmatter(self):
        """FAIL 側: frontmatter ブロックの無い L2 ノートは検出される。"""
        self.write(
            "notes/company/no-frontmatter.md", "# Just a note\nNo frontmatter here.\n"
        )
        st, msg = self.check(verify.verify_stock)["STOCK-01"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("missing frontmatter", msg)

    def test_stock01_fail_market_missing_observed_at(self):
        """FAIL 側: type: market ノートで observed_at（type 別追加必須キー）が欠落。"""
        fields = dict(_BASE_FIELDS, type="market", source="https://example.com")
        self.write("notes/market/no-observed-at.md", _frontmatter(fields))
        st, msg = self.check(verify.verify_stock)["STOCK-01"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("observed_at", msg)

    def test_stock01_fail_unknown_type(self):
        """FAIL 側: STOCK_ALLOWED_TYPES に無い type (例: marekt の typo) は検出される。"""
        fields = dict(_BASE_FIELDS, type="marekt")
        self.write("notes/company/typo-type.md", _frontmatter(fields))
        st, msg = self.check(verify.verify_stock)["STOCK-01"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("unknown type 'marekt'", msg)

    def test_stock01_pass_valid_note(self):
        """PASS 側: 必須キーが全て揃った正常ノートは PASS。"""
        fields = dict(_BASE_FIELDS, type="company-note")
        self.write("notes/company/valid.md", _frontmatter(fields))
        st, msg = self.check(verify.verify_stock)["STOCK-01"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("required frontmatter keys", msg)

    def test_stock01_info_when_no_notes_at_all(self):
        """INFO 側: notes/ にも docs/{decisions,retros}/ にもノートが無い。"""
        st, msg = self.check(verify.verify_stock)["STOCK-01"]
        self.assertEqual(st, "INFO", msg)
        self.assertIn("no L2 notes", msg)

    # --------------------------------------------------------------
    # STOCK-02: wikilink 解決可能性
    # --------------------------------------------------------------
    def test_stock02_warn_broken_link(self):
        """WARN 側: リンク切れ wikilink（対象ファイルが存在しない）。"""
        self.write("notes/company/linker.md", "See [[missing-target]] for details.\n")
        st, msg = self.check(verify.verify_stock)["STOCK-02"]
        self.assertEqual(st, "WARN", msg)
        self.assertIn("unresolved", msg)

    def test_stock02_warn_ambiguous_link(self):
        """WARN 側: 同名 stem のファイルが複数あり一意に解決できない。"""
        self.write("notes/company/dup.md", "Company side.\n")
        self.write("notes/market/dup.md", "Market side.\n")
        self.write("notes/company/linker.md", "See [[dup]] for details.\n")
        st, msg = self.check(verify.verify_stock)["STOCK-02"]
        self.assertEqual(st, "WARN", msg)
        self.assertIn("ambiguous", msg)

    def test_stock02_pass_root_relative_link(self):
        """PASS 側: ルート相対パス（"/" を含む）で一意に解決できるリンク。"""
        self.write("notes/company/target.md", "Target note.\n")
        self.write(
            "notes/company/linker.md", "See [[notes/company/target]] for details.\n"
        )
        st, msg = self.check(verify.verify_stock)["STOCK-02"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("resolve OK", msg)

    # --------------------------------------------------------------
    # STOCK-03: notes/inbox/ 滞留（7 日超）
    # --------------------------------------------------------------
    def test_stock03_pass_empty_inbox(self):
        """PASS 側: notes/inbox/ に未処理ノートが無い。"""
        self.write("notes/inbox/README.md", "# inbox\n")
        st, msg = self.check(verify.verify_stock)["STOCK-03"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("no unprocessed notes", msg)

    def test_stock03_warn_stale_inbox_note_via_mtime_fallback(self):
        """WARN 側: git 管理外（mtime フォールバック）で 8 日以上前のノートは滞留検知される。"""
        p = self.write("notes/inbox/old.md", "Stale inbox note.\n")
        old_ts = time.time() - 8 * 86400
        os.utime(p, (old_ts, old_ts))
        st, msg = self.check(verify.verify_stock)["STOCK-03"]
        self.assertEqual(st, "WARN", msg)
        self.assertIn("stale", msg)

    # --------------------------------------------------------------
    # STOCK-04: definitions/（L1）への Obsidian 記法混入
    # --------------------------------------------------------------
    def test_stock04_fail_bracket_pollution(self):
        """FAIL 側: definitions/ の yaml に [[ ]] wikilink 記法が混入。"""
        self.write("definitions/ontology/company.yaml", "name: Foo\nnote: '[[bar]]'\n")
        st, msg = self.check(verify.verify_stock)["STOCK-04"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("Obsidian syntax found", msg)

    def test_stock04_pass_clean_yaml(self):
        """PASS 側: Obsidian 記法の混入が無いクリーンな yaml。"""
        self.write("definitions/ontology/company.yaml", "name: Foo\nnote: plain text\n")
        st, msg = self.check(verify.verify_stock)["STOCK-04"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("free of Obsidian syntax", msg)

    # --------------------------------------------------------------
    # STOCK-05: notes/market/ の鮮度（observed_at 90 日超）
    # --------------------------------------------------------------
    def test_stock05_info_lists_stale_market_note(self):
        """INFO 側: observed_at が 90 日超の market ノートがメッセージに列挙される。"""
        old_date = (datetime.now(timezone.utc) - timedelta(days=100)).date().isoformat()
        fields = dict(
            _BASE_FIELDS,
            type="market",
            source="https://example.com",
            observed_at=old_date,
        )
        self.write("notes/market/stale.md", _frontmatter(fields))
        st, msg = self.check(verify.verify_stock)["STOCK-05"]
        self.assertEqual(st, "INFO", msg)
        self.assertIn("stale.md", msg)
        self.assertIn("observed_at > 90 days", msg)

    # --------------------------------------------------------------
    # STOCK-06: L2 への Obsidian アプリ依存記法（embed / Dataview / Bases）の混入検査
    # --------------------------------------------------------------
    def test_stock06_fail_embed_syntax(self):
        """FAIL 側: L2 ノートに ![[...]] embed 記法が混入。"""
        self.write("notes/company/embed.md", "See ![[some-asset]] below.\n")
        st, msg = self.check(verify.verify_stock)["STOCK-06"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("embed ![[", msg)

    def test_stock06_fail_dataview_fence(self):
        """FAIL 側: L2 ノートに ```dataview コードフェンスが混入。"""
        self.write("notes/company/dataview.md", "```dataview\ntable from #x\n```\n")
        st, msg = self.check(verify.verify_stock)["STOCK-06"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("dataview/base fence", msg)

    def test_stock06_fail_base_fence(self):
        """FAIL 側: L2 ノートに ```base コードフェンスが混入。"""
        self.write("notes/company/base.md", "```base\nviews: []\n```\n")
        st, msg = self.check(verify.verify_stock)["STOCK-06"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("dataview/base fence", msg)

    def test_stock06_pass_inline_code_mention_not_detected(self):
        """PASS 側: インラインコード内での `![[...]]` の言及は検知対象外。"""
        self.write(
            "notes/company/mention.md",
            "Docs describe `![[example]]` as embed syntax.\n",
        )
        st, msg = self.check(verify.verify_stock)["STOCK-06"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("free of embed/Dataview/Bases syntax", msg)

    def test_stock06_readme_excluded_from_scan(self):
        """README.md 内の禁止記法は STOCK-06 の走査対象外（notes_files がフィルタする）。"""
        self.write("notes/company/README.md", "```dataview\ntable from #x\n```\n")
        st, msg = self.check(verify.verify_stock)["STOCK-06"]
        self.assertEqual(st, "INFO", msg)
        self.assertIn("no notes/ L2 files to scan", msg)


if __name__ == "__main__":
    unittest.main()

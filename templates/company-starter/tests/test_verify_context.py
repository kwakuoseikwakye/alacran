"""verify.py の CONTEXT（常駐コンテキスト予算）チェックの unittest スイート
（Issue #46）。

対象カテゴリ:
  - CONTEXT-01 (CLAUDE.md 本文 + `@` import 先の合計バイト数)

docs/concepts/context-funnel.md の「necessary-only」思想を自己計測する RQT を
検証する。CLAUDE.md 本文はセッション開始時に必ず読み込まれ、「Rule imports」
節の `@path` 行で import された rule ファイルも同様に常駐するため、その合計
バイト数を予算内に収まっているか判定する。

実行:
    python3 -m unittest discover -s tests -p "test_verify_context.py" -v
"""

import unittest

import helpers  # noqa: F401  (import 副作用で scripts/ が sys.path に入る)
import verify
from helpers import VerifyTestCase


# ============================================================
# INFO 側 — CLAUDE.md が無い fixture
# ============================================================
class ContextInfoTest(VerifyTestCase):
    def test_info_without_claude_md(self):
        """INFO 側: CLAUDE.md が無い fixture では budget check を丸ごと飛ばす。"""
        res = self.check(verify.verify_context)
        st, msg = res["CONTEXT-01"]
        self.assertEqual(st, "INFO", msg)
        self.assertIn("CLAUDE.md not found", msg)


# ============================================================
# PASS 側 — 予算内
# ============================================================
class ContextPassTest(VerifyTestCase):
    def test_pass_small_claude_md_with_two_imports(self):
        """PASS 側: CLAUDE.md 本文 + 2 個の実在 import の合計が予算内 → PASS。
        メッセージに実測バイト数と import 件数の両方が含まれることを確認する
        （自己計測の趣旨: 常に実測値を表示する）。"""
        self.write(".claude/rules/scope-contract.md", "# scope contract\n" * 5)
        self.write(".claude/rules/issue-first.md", "# issue first\n" * 5)
        self.write(
            "CLAUDE.md",
            "# CLAUDE.md\n\nsome preamble text\n\n"
            "## Rule imports\n\n"
            "@.claude/rules/scope-contract.md\n"
            "@.claude/rules/issue-first.md\n",
        )
        claude_md_size = (self.root / "CLAUDE.md").stat().st_size
        imports_size = sum(
            (self.root / p).stat().st_size
            for p in (
                ".claude/rules/scope-contract.md",
                ".claude/rules/issue-first.md",
            )
        )
        expected_total = claude_md_size + imports_size

        res = self.check(verify.verify_context)
        st, msg = res["CONTEXT-01"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn(f"{expected_total:,} bytes", msg)
        self.assertIn("2 imports", msg)
        self.assertIn("within budget", msg)

    def test_pass_with_no_imports_counts_claude_md_only(self):
        """PASS 側: import 行が無ければ CLAUDE.md 本文のみで判定する（0 imports）。"""
        self.write("CLAUDE.md", "# CLAUDE.md\n\nno imports here.\n")
        res = self.check(verify.verify_context)
        st, msg = res["CONTEXT-01"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("0 imports", msg)


# ============================================================
# WARN 側 — 予算超過気味（36,000 <= total < 56,000）
# ============================================================
class ContextWarnTest(VerifyTestCase):
    def test_warn_crossing_36000_bytes(self):
        """WARN 側: import 先の水増しで合計が 36,000 bytes 以上 56,000 未満になると
        WARN（非ブロッキング）。docs/ への追い出しを促す文言も含む。"""
        self.write(".claude/rules/scope-contract.md", "x" * 40_000)
        self.write(
            "CLAUDE.md",
            "# CLAUDE.md\n\n@.claude/rules/scope-contract.md\n",
        )
        res = self.check(verify.verify_context)
        st, msg = res["CONTEXT-01"]
        self.assertEqual(st, "WARN", msg)
        self.assertIn("exceeds budget", msg)
        self.assertIn("docs/", msg)


# ============================================================
# FAIL 側 — 予算大幅超過（total >= 56,000）
# ============================================================
class ContextFailBudgetTest(VerifyTestCase):
    def test_fail_crossing_56000_bytes(self):
        """FAIL 側: 合計が 56,000 bytes 以上になると FAIL（exit code に影響する）。"""
        self.write(".claude/rules/scope-contract.md", "x" * 60_000)
        self.write(
            "CLAUDE.md",
            "# CLAUDE.md\n\n@.claude/rules/scope-contract.md\n",
        )
        res = self.check(verify.verify_context)
        st, msg = res["CONTEXT-01"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("far exceeds budget", msg)


# ============================================================
# FAIL 側 — import 切れ（読み込まれないルール = 無言の harness 故障）
# ============================================================
class ContextFailBrokenImportTest(VerifyTestCase):
    def test_fail_broken_import_names_it(self):
        """FAIL 側: `@path` の実体が無い場合、予算計算より先に import 切れとして
        FAIL し、メッセージに壊れたパスそのものを含める。"""
        self.write(
            "CLAUDE.md",
            "# CLAUDE.md\n\n@.claude/rules/nope.md\n",
        )
        res = self.check(verify.verify_context)
        st, msg = res["CONTEXT-01"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn(".claude/rules/nope.md", msg)
        self.assertIn("broken import", msg)


# ============================================================
# パースの契約 — `^@\S+$` on stripped lines
# ============================================================
class ContextImportParsingTest(VerifyTestCase):
    def test_non_at_lines_and_mid_line_at_are_not_imports(self):
        """パース契約: 行頭が `@` でない行や、`@` が行の途中にある行は import と
        みなさない（0 imports のまま PASS になる）。"""
        self.write(
            "CLAUDE.md",
            "# CLAUDE.md\n\n"
            "see contact @.claude/rules/scope-contract.md for details\n"
            "not-an-import: @.claude/rules/scope-contract.md\n",
        )
        res = self.check(verify.verify_context)
        st, msg = res["CONTEXT-01"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("0 imports", msg)

    def test_at_only_line_is_treated_as_import_by_simple_contract(self):
        """パース契約: 行全体が `@` + 空白無しトークンのみの行は import として扱う
        （email 様トークン単体行の誤認は既知のトレードオフとしてドキュメント化済み、
        ここでは `^@\\S+$` という契約自体が意図通りに動くことを確認する）。"""
        self.write(
            "CLAUDE.md",
            "# CLAUDE.md\n\n@.claude/rules/scope-contract.md\n",
        )
        self.write(".claude/rules/scope-contract.md", "# scope contract\n")
        res = self.check(verify.verify_context)
        st, msg = res["CONTEXT-01"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("1 imports", msg)


if __name__ == "__main__":
    unittest.main()

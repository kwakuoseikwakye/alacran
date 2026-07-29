"""The unittest suite for verify.py's CONTEXT (resident context budget) check
(Issue #46).

Category covered:
  - CONTEXT-01 (the total byte size of CLAUDE.md's body + its `@` import targets)

Verifies the RQT that self-measures the "necessary-only" philosophy of
docs/concepts/context-funnel.md. CLAUDE.md's body is always loaded at session
start, and a rule file imported via an `@path` line in the "Rule imports"
section is likewise resident, so this checks whether their combined byte
size stays within budget.

Run:
    python3 -m unittest discover -s tests -p "test_verify_context.py" -v
"""

import unittest

import helpers  # noqa: F401  (importing it puts scripts/ on sys.path, as a side effect)
import verify
from helpers import VerifyTestCase


# ============================================================
# The INFO side — a fixture with no CLAUDE.md
# ============================================================
class ContextInfoTest(VerifyTestCase):
    def test_info_without_claude_md(self):
        """INFO side: with a fixture missing CLAUDE.md, the whole budget check is skipped."""
        res = self.check(verify.verify_context)
        st, msg = res["CONTEXT-01"]
        self.assertEqual(st, "INFO", msg)
        self.assertIn("CLAUDE.md not found", msg)


# ============================================================
# The PASS side — within budget
# ============================================================
class ContextPassTest(VerifyTestCase):
    def test_pass_small_claude_md_with_two_imports(self):
        """PASS side: CLAUDE.md's body + 2 real imports together stay within budget -> PASS.
        Confirms the message includes both the actual measured byte count and the
        import count (the point of self-measurement: always show the real numbers)."""
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
        """PASS side: with no import lines, judge on CLAUDE.md's body alone (0 imports)."""
        self.write("CLAUDE.md", "# CLAUDE.md\n\nno imports here.\n")
        res = self.check(verify.verify_context)
        st, msg = res["CONTEXT-01"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("0 imports", msg)


# ============================================================
# The WARN side — creeping over budget (36,000 <= total < 56,000)
# ============================================================
class ContextWarnTest(VerifyTestCase):
    def test_warn_crossing_36000_bytes(self):
        """WARN side: once padding out the import target brings the total to
        36,000 bytes or more but under 56,000, it's WARN (non-blocking). Also
        includes wording that suggests pushing content out into docs/."""
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
# The FAIL side — far over budget (total >= 56,000)
# ============================================================
class ContextFailBudgetTest(VerifyTestCase):
    def test_fail_crossing_56000_bytes(self):
        """FAIL side: once the total reaches 56,000 bytes or more, it's FAIL
        (which affects the exit code)."""
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
# The FAIL side — a broken import (a rule that never loads = a silent harness failure)
# ============================================================
class ContextFailBrokenImportTest(VerifyTestCase):
    def test_fail_broken_import_names_it(self):
        """FAIL side: when `@path` points at nothing, this FAILs as a broken
        import before the budget is even calculated, and the message includes
        the broken path itself."""
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
# The parsing contract — `^@\S+$` on stripped lines
# ============================================================
class ContextImportParsingTest(VerifyTestCase):
    def test_non_at_lines_and_mid_line_at_are_not_imports(self):
        """Parsing contract: a line that doesn't start with `@`, or one where
        `@` sits mid-line, is not treated as an import (stays at 0 imports and PASSes)."""
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
        """Parsing contract: a line that is entirely `@` + a whitespace-free
        token is treated as an import (misreading a standalone email-like
        token is a known, already-documented trade-off; this just confirms the
        `^@\\S+$` contract itself behaves as intended)."""
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

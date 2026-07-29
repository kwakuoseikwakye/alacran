"""The unittest suite for verify.py's STOCK category (STOCK-01 through 06)
(Issue #80).

Target: verify_stock() — the group of checks that machine-verifies the
Obsidian-compatible conventions of the notes/ L2 description layer. Pins the
RQTs defined in §6 of docs/decisions/2026-07-03-obsidian-context-stock.md
(Decision RFC) one at a time. As with existing categories
(test_verify_declarative.py etc.), always checks the WARN/FAIL/INFO sides too,
not just PASS (no fake green).

verify.py itself is never modified (the Scope Contract for Issue #80).

Run:
    python3 -m unittest discover -s tests -p "test_verify_stock.py" -v
"""

import os
import time
import unittest
from datetime import datetime, timedelta, timezone

import helpers  # noqa: F401  (importing it puts scripts/ on sys.path, as a side effect)
import verify
from helpers import VerifyTestCase


def _frontmatter(fields, body="Note body.\n"):
    """Build a note body with a frontmatter block from a dict."""
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
    # STOCK-01: mandatory frontmatter keys (per type)
    # --------------------------------------------------------------
    def test_stock01_fail_missing_frontmatter(self):
        """FAIL side: an L2 note with no frontmatter block is detected."""
        self.write(
            "notes/company/no-frontmatter.md", "# Just a note\nNo frontmatter here.\n"
        )
        st, msg = self.check(verify.verify_stock)["STOCK-01"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("missing frontmatter", msg)

    def test_stock01_fail_market_missing_observed_at(self):
        """FAIL side: a type: market note is missing observed_at (a required
        extra key for that type)."""
        fields = dict(_BASE_FIELDS, type="market", source="https://example.com")
        self.write("notes/market/no-observed-at.md", _frontmatter(fields))
        st, msg = self.check(verify.verify_stock)["STOCK-01"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("observed_at", msg)

    def test_stock01_fail_unknown_type(self):
        """FAIL side: a type not in STOCK_ALLOWED_TYPES (e.g. a typo like
        marekt) is detected."""
        fields = dict(_BASE_FIELDS, type="marekt")
        self.write("notes/company/typo-type.md", _frontmatter(fields))
        st, msg = self.check(verify.verify_stock)["STOCK-01"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("unknown type 'marekt'", msg)

    def test_stock01_pass_valid_note(self):
        """PASS side: a well-formed note with every required key PASSes."""
        fields = dict(_BASE_FIELDS, type="company-note")
        self.write("notes/company/valid.md", _frontmatter(fields))
        st, msg = self.check(verify.verify_stock)["STOCK-01"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("required frontmatter keys", msg)

    def test_stock01_info_when_no_notes_at_all(self):
        """INFO side: no notes anywhere in notes/ or docs/{decisions,retros}/."""
        st, msg = self.check(verify.verify_stock)["STOCK-01"]
        self.assertEqual(st, "INFO", msg)
        self.assertIn("no L2 notes", msg)

    # --------------------------------------------------------------
    # STOCK-02: wikilink resolvability
    # --------------------------------------------------------------
    def test_stock02_warn_broken_link(self):
        """WARN side: a broken wikilink (the target file doesn't exist)."""
        self.write("notes/company/linker.md", "See [[missing-target]] for details.\n")
        st, msg = self.check(verify.verify_stock)["STOCK-02"]
        self.assertEqual(st, "WARN", msg)
        self.assertIn("unresolved", msg)

    def test_stock02_warn_ambiguous_link(self):
        """WARN side: multiple files share the same stem, so it can't resolve uniquely."""
        self.write("notes/company/dup.md", "Company side.\n")
        self.write("notes/market/dup.md", "Market side.\n")
        self.write("notes/company/linker.md", "See [[dup]] for details.\n")
        st, msg = self.check(verify.verify_stock)["STOCK-02"]
        self.assertEqual(st, "WARN", msg)
        self.assertIn("ambiguous", msg)

    def test_stock02_pass_root_relative_link(self):
        """PASS side: a root-relative path (containing "/") resolves uniquely."""
        self.write("notes/company/target.md", "Target note.\n")
        self.write(
            "notes/company/linker.md", "See [[notes/company/target]] for details.\n"
        )
        st, msg = self.check(verify.verify_stock)["STOCK-02"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("resolve OK", msg)

    # --------------------------------------------------------------
    # STOCK-03: notes/inbox/ backlog (older than 7 days)
    # --------------------------------------------------------------
    def test_stock03_pass_empty_inbox(self):
        """PASS side: notes/inbox/ has no unprocessed notes."""
        self.write("notes/inbox/README.md", "# inbox\n")
        st, msg = self.check(verify.verify_stock)["STOCK-03"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("no unprocessed notes", msg)

    def test_stock03_warn_stale_inbox_note_via_mtime_fallback(self):
        """WARN side: a note untracked by git (falling back to mtime) older
        than 8 days is detected as a backlog item."""
        p = self.write("notes/inbox/old.md", "Stale inbox note.\n")
        old_ts = time.time() - 8 * 86400
        os.utime(p, (old_ts, old_ts))
        st, msg = self.check(verify.verify_stock)["STOCK-03"]
        self.assertEqual(st, "WARN", msg)
        self.assertIn("stale", msg)

    # --------------------------------------------------------------
    # STOCK-04: Obsidian syntax leaking into definitions/ (L1)
    # --------------------------------------------------------------
    def test_stock04_fail_bracket_pollution(self):
        """FAIL side: [[ ]] wikilink syntax has leaked into a yaml under definitions/."""
        self.write("definitions/ontology/company.yaml", "name: Foo\nnote: '[[bar]]'\n")
        st, msg = self.check(verify.verify_stock)["STOCK-04"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("Obsidian syntax found", msg)

    def test_stock04_pass_clean_yaml(self):
        """PASS side: a clean yaml with no Obsidian syntax leaked in."""
        self.write("definitions/ontology/company.yaml", "name: Foo\nnote: plain text\n")
        st, msg = self.check(verify.verify_stock)["STOCK-04"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("free of Obsidian syntax", msg)

    # --------------------------------------------------------------
    # STOCK-05: freshness of notes/market/ (observed_at older than 90 days)
    # --------------------------------------------------------------
    def test_stock05_info_lists_stale_market_note(self):
        """INFO side: a market note with observed_at over 90 days old is listed in the message."""
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
    # STOCK-06: checking for Obsidian app-dependent syntax (embed / Dataview /
    # Bases) leaking into L2
    # --------------------------------------------------------------
    def test_stock06_fail_embed_syntax(self):
        """FAIL side: ![[...]] embed syntax has leaked into an L2 note."""
        self.write("notes/company/embed.md", "See ![[some-asset]] below.\n")
        st, msg = self.check(verify.verify_stock)["STOCK-06"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("embed ![[", msg)

    def test_stock06_fail_dataview_fence(self):
        """FAIL side: a ```dataview code fence has leaked into an L2 note."""
        self.write("notes/company/dataview.md", "```dataview\ntable from #x\n```\n")
        st, msg = self.check(verify.verify_stock)["STOCK-06"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("dataview/base fence", msg)

    def test_stock06_fail_base_fence(self):
        """FAIL side: a ```base code fence has leaked into an L2 note."""
        self.write("notes/company/base.md", "```base\nviews: []\n```\n")
        st, msg = self.check(verify.verify_stock)["STOCK-06"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("dataview/base fence", msg)

    def test_stock06_pass_inline_code_mention_not_detected(self):
        """PASS side: a mention of `![[...]]` inside inline code is out of scope for detection."""
        self.write(
            "notes/company/mention.md",
            "Docs describe `![[example]]` as embed syntax.\n",
        )
        st, msg = self.check(verify.verify_stock)["STOCK-06"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("free of embed/Dataview/Bases syntax", msg)

    def test_stock06_readme_excluded_from_scan(self):
        """Forbidden syntax inside README.md is out of scope for STOCK-06's
        scan (filtered out by notes_files)."""
        self.write("notes/company/README.md", "```dataview\ntable from #x\n```\n")
        st, msg = self.check(verify.verify_stock)["STOCK-06"]
        self.assertEqual(st, "INFO", msg)
        self.assertIn("no notes/ L2 files to scan", msg)


if __name__ == "__main__":
    unittest.main()

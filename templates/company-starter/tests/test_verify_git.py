"""The unittest suite for verify.py's git-dependent checks (Issue #42).

Categories covered:
  - STRUCTURE-02 (the git-backed part of verify_structure)
  - HYGIENE-01   (verify_hygiene)
  - GEN-01       (verify_gen)
  - HARNESS-01/02 (verify_harness)

In the spirit of no-fake-green, pin not just the PASS side of each RQT but
the FAIL side too. Forbidden literals (the retired domain term, the
TODO-temp marker, etc.) are never written directly in the source — they are
assembled from parts at runtime (so this file itself doesn't self-match on
the real repo's GEN-01 / HYGIENE-01 git-grep and become a time bomb).

Run:
    python3 -m unittest discover -s tests -p "test_verify_git.py" -v
"""

import json
import os
import unittest

import helpers  # noqa: F401  (importing it puts scripts/ on sys.path, as a side effect)
import verify
from helpers import GitTestCase, VerifyTestCase, commit_all


def _hook_marker():
    """Assemble HYGIENE-01's marker string at runtime.

    Writing this literal directly in the source would mean the real repo's
    HYGIENE-01 git-greps this test file too (it doesn't exclude tests/),
    turning it into a 30-day time bomb."""
    return "TODO(" + "temp)"


def _retired_needle():
    """Assemble the retired domain term (3 letters) GEN-01 searches for, at runtime.

    Avoids the literal just like verify.py itself does (so the real repo's
    GEN-01 / CI doesn't FAIL on this test file)."""
    return "f" + "d" + "a"


def _settings_with_commands(*commands):
    """Build a settings.json string with command hooks wired into PreToolUse."""
    return json.dumps(
        {
            "hooks": {
                "PreToolUse": [
                    {
                        "matcher": "Bash",
                        "hooks": [{"type": "command", "command": c} for c in commands],
                    }
                ]
            }
        }
    )


# ============================================================
# STRUCTURE-02 — .gitignore effectively blocking secrets/ / .env
# ============================================================
class Structure02Test(GitTestCase):
    # Note: verify_structure also adds rows for STRUCTURE-01/03/04, but this
    # test only checks -02 (the other keys are ignored from res).

    def test_pass_effective_gitignore(self):
        """PASS side: secrets/** and .env are blocked both statically and by check-ignore."""
        self.write(".gitignore", "secrets/**\n.env\n")
        st, msg = self.check(verify.verify_structure)["STRUCTURE-02"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("effectively blocks", msg)

    def test_fail_commented_out_rule_static(self):
        """FAIL side (catching fake-green): commenting out the secrets rule and
        leaving only the negated line still produces a static FAIL from the
        active-line logic."""
        # `# secrets/**` is excluded for starting with #, `!secrets/**/` for starting with !.
        # A substring match would leave "secrets/" present on the negated line and PASS,
        # but the active-line logic doesn't miss this.
        self.write(".gitignore", "# secrets/**\n!secrets/**/\n.env\n")
        st, msg = self.check(verify.verify_structure)["STRUCTURE-02"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("does not effectively block", msg)
        self.assertIn("secrets/", msg)

    def test_fail_static_pass_dynamic_fail_backprobe(self):
        """FAIL side (the corroboration layer): a line that statically contains
        "secrets/" / ".env" as a substring but doesn't actually ignore anything
        makes git check-ignore report not-ignored, so it FAILs."""
        # "foo-secrets/bar" contains "secrets/" as a substring but doesn't ignore
        # secrets/probe.txt. "x.envy" contains ".env" but doesn't ignore .env.
        self.write(".gitignore", "foo-secrets/bar\nx.envy\n")
        st, msg = self.check(verify.verify_structure)["STRUCTURE-02"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("does not effectively block", msg)


# ============================================================
# HYGIENE-01 — detecting a temp marker (assembled at runtime) left over 30 days
# ============================================================
class Hygiene01SkipTest(VerifyTestCase):
    def test_skip_without_git(self):
        """SKIP side: with a fixture missing .git, the git-blame check is skipped."""
        st, msg = self.check(verify.verify_hygiene)["HYGIENE-01"]
        self.assertEqual(st, "SKIP", msg)
        self.assertIn("not a git repository", msg)


class Hygiene01GitTest(GitTestCase):
    def test_pass_no_markers(self):
        """PASS side: a clean, committed file with no marker PASSes."""
        self.write("app/clean.py", "print('hello world')\n")
        commit_all(self.root, "chore: clean file")
        st, msg = self.check(verify.verify_hygiene)["HYGIENE-01"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("markers found", msg)

    def test_pass_marker_within_30_days(self):
        """PASS side: a marker in a fresh commit is within 30 days, so PASS."""
        marker = _hook_marker()
        self.write("app/todo.py", "x = 1  # " + marker + " remove later\n")
        commit_all(self.root, "chore: fresh marker")  # real time = within 30 days
        st, msg = self.check(verify.verify_hygiene)["HYGIENE-01"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("within 30 days", msg)

    def test_fail_marker_older_than_30_days(self):
        """FAIL side: a marker whose committer_date is faked back to 2020 is
        over 30 days old, so FAIL."""
        marker = _hook_marker()
        self.write("app/stale.py", "y = 2  # " + marker + " ancient\n")
        commit_all(
            self.root,
            "chore: stale marker",
            committer_date="2020-01-01T00:00:00 +0000",
        )
        st, msg = self.check(verify.verify_hygiene)["HYGIENE-01"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("older than 30 days", msg)

    def test_pass_self_ref_excluded(self):
        """PASS side: a marker inside the fixture's own scripts/verify.py is
        excluded via self_ref_paths, so with no other marker present it PASSes
        as "no markers found"."""
        marker = _hook_marker()
        # a path listed in self_ref_paths. Excluded regardless of how old it is.
        self.write("scripts/verify.py", "# " + marker + " self reference\n")
        commit_all(
            self.root,
            "chore: self ref marker",
            committer_date="2020-01-01T00:00:00 +0000",
        )
        st, msg = self.check(verify.verify_hygiene)["HYGIENE-01"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("markers found", msg)


# ============================================================
# GEN-01 — detecting a residual retired domain term
# ============================================================
class Gen01SkipTest(VerifyTestCase):
    def test_skip_without_git(self):
        """SKIP side: with no .git, the residual scan is skipped."""
        st, msg = self.check(verify.verify_gen)["GEN-01"]
        self.assertEqual(st, "SKIP", msg)
        self.assertIn("not a git repository", msg)


class Gen01GitTest(GitTestCase):
    def test_pass_clean_repo(self):
        """PASS side: PASS when no tracked file contains the retired term."""
        self.write("app/clean.py", "value = 42\n")
        commit_all(self.root, "chore: clean tracked file")
        st, msg = self.check(verify.verify_gen)["GEN-01"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("no retired domain term residual", msg)

    def test_fail_needle_in_tracked_file(self):
        """FAIL side: FAILs when a tracked file still contains the retired term."""
        needle = _retired_needle()
        self.write("app/legacy.py", "term = '" + needle + "'\n")
        commit_all(self.root, "chore: residual term")
        st, msg = self.check(verify.verify_gen)["GEN-01"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("retired domain term residual found", msg)

    def test_pass_needle_in_excluded_workflow(self):
        """PASS side: PASSes when the retired term appears only inside
        .github/workflows/verify.yml (a deliberate detection pattern), which
        is excluded."""
        needle = _retired_needle()
        self.write(
            ".github/workflows/verify.yml", "# detects the " + needle + " term\n"
        )
        commit_all(self.root, "chore: excluded workflow")
        st, msg = self.check(verify.verify_gen)["GEN-01"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("no retired domain term residual", msg)


# ============================================================
# HARNESS-01/02 — verifying the hook wiring in .claude/settings.json
# ============================================================
class HarnessTest(VerifyTestCase):
    def _write_settings(self, body):
        self.write(".claude/settings.json", body)

    def _write_hook(self, relpath, body, executable=True):
        p = self.write(relpath, body)
        if executable:
            os.chmod(p, 0o755)
        return p

    def test_info_when_settings_missing(self):
        """INFO/INFO side: both RQTs are INFO when settings.json is missing."""
        res = self.check(verify.verify_harness)
        st1, msg1 = res["HARNESS-01"]
        st2, msg2 = res["HARNESS-02"]
        self.assertEqual(st1, "INFO", msg1)
        self.assertEqual(st2, "INFO", msg2)
        self.assertIn("not found", msg1)

    def test_fail_invalid_json(self):
        """FAIL/FAIL side: both RQTs FAIL when settings.json is invalid JSON."""
        self._write_settings("{ this is not json ]")
        res = self.check(verify.verify_harness)
        st1, msg1 = res["HARNESS-01"]
        st2, msg2 = res["HARNESS-02"]
        self.assertEqual(st1, "FAIL", msg1)
        self.assertEqual(st2, "FAIL", msg2)
        self.assertIn("parse error", msg1)

    def test_fail_hook_file_not_found(self):
        """FAIL(HARNESS-01) side: the wired hook file doesn't exist."""
        cmd = "$CLAUDE_PROJECT_DIR/.claude/hooks/missing.sh"
        self._write_settings(_settings_with_commands(cmd))
        st, msg = self.check(verify.verify_harness)["HARNESS-01"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("file not found", msg)

    def test_fail_hook_not_executable(self):
        """FAIL(HARNESS-01) side: the hook exists but isn't executable."""
        cmd = "$CLAUDE_PROJECT_DIR/.claude/hooks/noexec.sh"
        self._write_hook(
            ".claude/hooks/noexec.sh", "#!/bin/sh\nexit 0\n", executable=False
        )
        os.chmod(self.root / ".claude/hooks/noexec.sh", 0o644)
        self._write_settings(_settings_with_commands(cmd))
        st, msg = self.check(verify.verify_harness)["HARNESS-01"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("not executable", msg)

    def test_fail_hook_missing_shebang(self):
        """FAIL(HARNESS-01) side: executable, but missing a shebang."""
        cmd = "$CLAUDE_PROJECT_DIR/.claude/hooks/noshebang.sh"
        self._write_hook(".claude/hooks/noshebang.sh", "exit 0\n")
        self._write_settings(_settings_with_commands(cmd))
        st, msg = self.check(verify.verify_harness)["HARNESS-01"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("missing shebang", msg)

    def test_pass_valid_hook(self):
        """PASS/PASS side: a well-formed hook — executable + shebang + exit 0."""
        cmd = "$CLAUDE_PROJECT_DIR/.claude/hooks/ok.sh"
        self._write_hook(".claude/hooks/ok.sh", "#!/bin/sh\nexit 0\n")
        self._write_settings(_settings_with_commands(cmd))
        res = self.check(verify.verify_harness)
        st1, msg1 = res["HARNESS-01"]
        st2, msg2 = res["HARNESS-02"]
        self.assertEqual(st1, "PASS", msg1)
        self.assertIn("shebang", msg1)
        self.assertEqual(st2, "PASS", msg2)

    def test_fail_hook_smoke_nonzero_exit(self):
        """FAIL(HARNESS-02) side: static verification passes, but running it exits 1."""
        cmd = "$CLAUDE_PROJECT_DIR/.claude/hooks/boom.sh"
        self._write_hook(".claude/hooks/boom.sh", "#!/bin/sh\nexit 1\n")
        self._write_settings(_settings_with_commands(cmd))
        res = self.check(verify.verify_harness)
        st1, _ = res["HARNESS-01"]
        st2, msg2 = res["HARNESS-02"]
        self.assertEqual(st1, "PASS")  # no problem statically
        self.assertEqual(st2, "FAIL", msg2)
        self.assertIn("exit 1", msg2)

    def test_command_outside_repo_root_skipped(self):
        """Boundary: a command outside the repo (echo hi) is out of scope. With
        0 runnable hooks, HARNESS-01 is PASS (0 hooks) / HARNESS-02 is INFO
        (nothing to smoke-test)."""
        self._write_settings(_settings_with_commands("echo hi"))
        res = self.check(verify.verify_harness)
        st1, msg1 = res["HARNESS-01"]
        st2, msg2 = res["HARNESS-02"]
        self.assertEqual(st1, "PASS", msg1)
        self.assertEqual(st2, "INFO", msg2)
        self.assertIn("no runnable hooks", msg2)


if __name__ == "__main__":
    unittest.main()

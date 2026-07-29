"""The unittest suite for verify.py's META (adherence to Issue-First / commit
conventions) check (Issue #45, #56).

Categories covered:
  - META-01 (the Issue-reference rate)
  - META-02 (the Conventional Commits compliance rate)
  - META-03 (diff size per commit / self-measuring scope-contract.md §3)

META is the first RQT in verify.py that actually emits a WARN status (the
Report class itself always defined WARN, but no verify_*() function had ever
emitted it). This pins the design that WARN is a non-blocking "indicator", not
a "gate" that affects the exit code — on both the PASS and WARN sides.

Run:
    python3 -m unittest discover -s tests -p "test_verify_meta.py" -v
"""

import unittest

import helpers  # noqa: F401  (importing it puts scripts/ on sys.path, as a side effect)
import verify
from helpers import GitTestCase, VerifyTestCase, commit_all


# ============================================================
# The SKIP side — a fixture with no .git
# ============================================================
class Meta01SkipTest(VerifyTestCase):
    def test_skip_without_git(self):
        """SKIP side: with a fixture missing .git, META-01/02/03 all skip commit metrics."""
        res = self.check(verify.verify_meta)
        st1, msg1 = res["META-01"]
        st2, msg2 = res["META-02"]
        st3, msg3 = res["META-03"]
        self.assertEqual(st1, "SKIP", msg1)
        self.assertEqual(st2, "SKIP", msg2)
        self.assertEqual(st3, "SKIP", msg3)
        self.assertIn("not a git repository", msg1)
        self.assertIn("not a git repository", msg2)
        self.assertIn("not a git repository", msg3)


# ============================================================
# The INFO side — too small a sample (fewer than 5 commits)
# ============================================================
class MetaSampleTooSmallTest(GitTestCase):
    def test_info_when_fewer_than_5_commits(self):
        """INFO side: with fewer than 5 commits, none of META-01/02/03 is
        promoted to a PASS/WARN verdict."""
        for i in range(3):
            commit_all(self.root, msg=f"chore: fixture {i} (#1)")
        res = self.check(verify.verify_meta)
        st1, msg1 = res["META-01"]
        st2, msg2 = res["META-02"]
        st3, msg3 = res["META-03"]
        self.assertEqual(st1, "INFO", msg1)
        self.assertEqual(st2, "INFO", msg2)
        self.assertEqual(st3, "INFO", msg3)
        self.assertIn("only 3 commit(s)", msg1)
        self.assertIn("5+ commits", msg1)
        self.assertIn("only 3 commit(s)", msg3)


# ============================================================
# META-01 — the Issue-reference rate
# ============================================================
class Meta01Test(GitTestCase):
    def test_pass_all_referenced_and_conventional(self):
        """PASS side (both): all 5 commits are Conventional Commits + reference an Issue."""
        for i in range(5):
            commit_all(self.root, msg=f"feat(verify): add check {i} (#{100 + i})")
        res = self.check(verify.verify_meta)
        st1, msg1 = res["META-01"]
        st2, msg2 = res["META-02"]
        self.assertEqual(st1, "PASS", msg1)
        self.assertIn("5/5", msg1)
        self.assertEqual(st2, "PASS", msg2)
        self.assertIn("5/5", msg2)

    def test_warn_low_issue_ref_rate_keeps_meta02_pass(self):
        """WARN side (META-01) alone: keep the subject Conventional-Commits-shaped
        while dropping the Issue reference, so only META-01 falls to WARN
        (separating the two concerns)."""
        # only 1 of 5 references an Issue -> 1/5 = 0.2 < 0.8 -> WARN.
        commit_all(self.root, msg="feat(verify): add check 0 (#100)")
        offender_subjects = []
        for i in range(1, 5):
            subject = f"feat(verify): add check {i} without ref"
            offender_subjects.append(subject)
            commit_all(self.root, msg=subject)
        res = self.check(verify.verify_meta)
        st1, msg1 = res["META-01"]
        st2, msg2 = res["META-02"]
        self.assertEqual(st1, "WARN", msg1)
        self.assertIn("1/5", msg1)
        self.assertTrue(
            any(s in msg1 for s in offender_subjects),
            f"expected an offender subject in: {msg1}",
        )
        # META-02 stays PASS since every subject is still Conventional Commits shaped.
        self.assertEqual(st2, "PASS", msg2)

    def test_issue_pending_counts_as_referenced(self):
        """"issue pending" is treated as an Issue reference (the offline
        fallback from issue-first.md §7.5)."""
        commit_all(self.root, msg="fix(verify): offline change (issue pending)")
        for i in range(4):
            commit_all(self.root, msg=f"fix(verify): change {i} (#{200 + i})")
        res = self.check(verify.verify_meta)
        st1, msg1 = res["META-01"]
        self.assertEqual(st1, "PASS", msg1)
        self.assertIn("5/5", msg1)


# ============================================================
# META-02 — the Conventional Commits compliance rate
# ============================================================
class Meta02Test(GitTestCase):
    def test_warn_low_conventional_rate_keeps_meta01_pass(self):
        """WARN side (META-02) alone: keep the Issue reference while taking the
        subject out of Conventional Commits shape, so only META-02 falls to WARN
        (separating the two concerns)."""
        commit_all(self.root, msg="feat(verify): conventional subject (#100)")
        offender_subjects = []
        for i in range(1, 5):
            subject = f"add check {i} without type prefix (#{101 + i})"
            offender_subjects.append(subject)
            commit_all(self.root, msg=subject)
        res = self.check(verify.verify_meta)
        st1, msg1 = res["META-01"]
        st2, msg2 = res["META-02"]
        # META-01 stays PASS since every commit still references an Issue.
        self.assertEqual(st1, "PASS", msg1)
        self.assertEqual(st2, "WARN", msg2)
        self.assertIn("1/5", msg2)
        self.assertTrue(
            any(s in msg2 for s in offender_subjects),
            f"expected an offender subject in: {msg2}",
        )

    def test_boundary_exactly_at_threshold_is_pass(self):
        """Boundary: 4/5 = exactly 0.8 is >= the threshold, so PASS (not WARN)."""
        commit_all(self.root, msg="non-conventional subject (#100)")
        for i in range(4):
            commit_all(self.root, msg=f"chore(verify): fixture {i} (#{101 + i})")
        res = self.check(verify.verify_meta)
        st2, msg2 = res["META-02"]
        self.assertEqual(st2, "PASS", msg2)
        self.assertIn("4/5", msg2)
        self.assertIn("80%", msg2)


# ============================================================
# META-03 — diff lines per commit
# ============================================================
def _write_lines(tc, relpath, n):
    """Write a new file of n lines (fixes the number of insertions the commit will show)."""
    tc.write(relpath, "\n".join(f"line{i}" for i in range(n)) + "\n")


class Meta03Test(GitTestCase):
    def test_pass_small_commits(self):
        """PASS side: all 5 are small changes -> PASS. The message includes the median."""
        for i in range(5):
            _write_lines(self, f"f{i}.txt", 3)
            commit_all(self.root, msg=f"chore(verify): fixture {i} (#{100 + i})")
        res = self.check(verify.verify_meta)
        st3, msg3 = res["META-03"]
        self.assertEqual(st3, "PASS", msg3)
        self.assertIn("median", msg3)

    def test_warn_big_commit_ratio(self):
        """WARN side: 2 of 5 (40% > 30%) exceed 500 lines -> WARN. Includes an offender subject."""
        offender_subjects = []
        for i in range(2):
            _write_lines(self, f"big{i}.txt", 600)
            subject = f"feat(verify): big change {i} (#{200 + i})"
            offender_subjects.append(subject)
            commit_all(self.root, msg=subject)
        for i in range(3):
            _write_lines(self, f"small{i}.txt", 3)
            commit_all(self.root, msg=f"chore(verify): small {i} (#{210 + i})")
        res = self.check(verify.verify_meta)
        st3, msg3 = res["META-03"]
        self.assertEqual(st3, "WARN", msg3)
        self.assertTrue(
            any(s in msg3 for s in offender_subjects),
            f"expected an offender subject in: {msg3}",
        )

    def test_boundary_exactly_30_percent_is_pass(self):
        """Boundary: 3/10 = exactly 0.3 is not > the threshold, so PASS (not WARN)."""
        for i in range(3):
            _write_lines(self, f"big{i}.txt", 600)
            commit_all(self.root, msg=f"feat(verify): big {i} (#{300 + i})")
        for i in range(7):
            _write_lines(self, f"small{i}.txt", 3)
            commit_all(self.root, msg=f"chore(verify): small {i} (#{310 + i})")
        res = self.check(verify.verify_meta)
        st3, msg3 = res["META-03"]
        self.assertEqual(st3, "PASS", msg3)
        self.assertIn("3/10", msg3)

    def test_empty_commit_does_not_crash(self):
        """An empty commit (--allow-empty, no diff) is treated as 0 lines, and
        confirms the parser doesn't crash on it."""
        _write_lines(self, "seed.txt", 3)
        commit_all(self.root, msg="chore(verify): seed (#400)")
        for i in range(4):
            commit_all(self.root, msg=f"chore(verify): empty {i} (#{401 + i})")
        res = self.check(verify.verify_meta)
        st3, msg3 = res["META-03"]
        self.assertEqual(st3, "PASS", msg3)
        self.assertIn("median", msg3)


if __name__ == "__main__":
    unittest.main()

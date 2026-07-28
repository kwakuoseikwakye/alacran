"""verify.py の META（Issue-First / commit 規約遵守度）チェックの unittest スイート
（Issue #45, #56）。

対象カテゴリ:
  - META-01 (Issue 参照率)
  - META-02 (Conventional Commits 準拠率)
  - META-03 (コミットあたり diff サイズ / scope-contract.md §3 の自己計測)

META は verify.py で初めて WARN status を実際に発行する RQT である
（Report クラス自体は元から WARN を定義していたが、どの verify_*() 関数も
一度も emit していなかった）。WARN は exit code に影響しない「指標」であって
「ゲート」ではない、という設計を PASS/WARN 両側で pin する。

実行:
    python3 -m unittest discover -s tests -p "test_verify_meta.py" -v
"""

import unittest

import helpers  # noqa: F401  (import 副作用で scripts/ が sys.path に入る)
import verify
from helpers import GitTestCase, VerifyTestCase, commit_all


# ============================================================
# SKIP 側 — .git が無い fixture
# ============================================================
class Meta01SkipTest(VerifyTestCase):
    def test_skip_without_git(self):
        """SKIP 側: .git が無い fixture では META-01/02/03 とも commit metrics を飛ばす。"""
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
# INFO 側 — サンプル不足（5 件未満）
# ============================================================
class MetaSampleTooSmallTest(GitTestCase):
    def test_info_when_fewer_than_5_commits(self):
        """INFO 側: commit が 5 件未満だと META-01/02/03 とも PASS/WARN 判定に昇格しない。"""
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
        self.assertIn("5 件以上になると", msg1)
        self.assertIn("only 3 commit(s)", msg3)


# ============================================================
# META-01 — Issue 参照率
# ============================================================
class Meta01Test(GitTestCase):
    def test_pass_all_referenced_and_conventional(self):
        """PASS 側（両方）: 5 件すべてが Conventional Commits + Issue 参照。"""
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
        """WARN 側(META-01)単独: subject は Conventional Commits を維持しつつ
        Issue 参照だけを欠かせて META-01 のみを WARN に落とす（2 concern の分離）。"""
        # 5 件中 1 件だけ Issue 参照あり → 1/5 = 0.2 < 0.8 → WARN。
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
        # META-02 は subject が全件 Conventional Commits のままなので PASS を維持。
        self.assertEqual(st2, "PASS", msg2)

    def test_issue_mikakutei_counts_as_referenced(self):
        """issue化予定 は Issue 参照とみなされる（issue-first.md §7.5 のオフライン代替）。"""
        commit_all(self.root, msg="fix(verify): offline change (issue化予定)")
        for i in range(4):
            commit_all(self.root, msg=f"fix(verify): change {i} (#{200 + i})")
        res = self.check(verify.verify_meta)
        st1, msg1 = res["META-01"]
        self.assertEqual(st1, "PASS", msg1)
        self.assertIn("5/5", msg1)


# ============================================================
# META-02 — Conventional Commits 準拠率
# ============================================================
class Meta02Test(GitTestCase):
    def test_warn_low_conventional_rate_keeps_meta01_pass(self):
        """WARN 側(META-02)単独: Issue 参照は維持しつつ subject を Conventional
        Commits から外して META-02 のみを WARN に落とす（2 concern の分離）。"""
        commit_all(self.root, msg="feat(verify): conventional subject (#100)")
        offender_subjects = []
        for i in range(1, 5):
            subject = f"add check {i} without type prefix (#{101 + i})"
            offender_subjects.append(subject)
            commit_all(self.root, msg=subject)
        res = self.check(verify.verify_meta)
        st1, msg1 = res["META-01"]
        st2, msg2 = res["META-02"]
        # META-01 は全件 Issue 参照ありなので PASS を維持。
        self.assertEqual(st1, "PASS", msg1)
        self.assertEqual(st2, "WARN", msg2)
        self.assertIn("1/5", msg2)
        self.assertTrue(
            any(s in msg2 for s in offender_subjects),
            f"expected an offender subject in: {msg2}",
        )

    def test_boundary_exactly_at_threshold_is_pass(self):
        """境界: 4/5 = 0.8 ちょうどは >= 閾値なので PASS（WARN ではない）。"""
        commit_all(self.root, msg="non-conventional subject (#100)")
        for i in range(4):
            commit_all(self.root, msg=f"chore(verify): fixture {i} (#{101 + i})")
        res = self.check(verify.verify_meta)
        st2, msg2 = res["META-02"]
        self.assertEqual(st2, "PASS", msg2)
        self.assertIn("4/5", msg2)
        self.assertIn("80%", msg2)


# ============================================================
# META-03 — コミットあたり diff 行数
# ============================================================
def _write_lines(tc, relpath, n):
    """n 行の新規ファイルを書く（コミット時の insertions を確定させる）。"""
    tc.write(relpath, "\n".join(f"line{i}" for i in range(n)) + "\n")


class Meta03Test(GitTestCase):
    def test_pass_small_commits(self):
        """PASS 側: 5 件すべて小さい変更 → PASS。メッセージに median を含む。"""
        for i in range(5):
            _write_lines(self, f"f{i}.txt", 3)
            commit_all(self.root, msg=f"chore(verify): fixture {i} (#{100 + i})")
        res = self.check(verify.verify_meta)
        st3, msg3 = res["META-03"]
        self.assertEqual(st3, "PASS", msg3)
        self.assertIn("median", msg3)

    def test_warn_big_commit_ratio(self):
        """WARN 側: 5 件中 2 件（40% > 30%）が 500 行超 → WARN。offender subject を含む。"""
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
        """境界: 3/10 = 0.3 ちょうどは > 閾値ではないので PASS（WARN ではない）。"""
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
        """空コミット（--allow-empty で差分無し）は 0 行として扱われ、parser が
        落ちないことを確認する。"""
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

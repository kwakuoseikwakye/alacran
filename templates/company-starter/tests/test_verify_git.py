"""verify.py の git 依存チェックの unittest スイート（Issue #42）。

対象カテゴリ:
  - STRUCTURE-02 (verify_structure の git-backed 部分)
  - HYGIENE-01   (verify_hygiene)
  - GEN-01       (verify_gen)
  - HARNESS-01/02 (verify_harness)

偽緑禁止の思想に従い、各 RQT の PASS 側だけでなく FAIL 側も必ず pin する。
禁止 literal（撤去済みドメイン用語 / TODO-temp マーカー等）はソースに直接書かず、
実行時に部品から組み立てる（本ファイル自身が real repo の GEN-01 / HYGIENE-01 の
git-grep に self-match して time-bomb 化するのを防ぐため）。

実行:
    python3 -m unittest discover -s tests -p "test_verify_git.py" -v
"""

import json
import os
import unittest

import helpers  # noqa: F401  (import 副作用で scripts/ が sys.path に入る)
import verify
from helpers import GitTestCase, VerifyTestCase, commit_all


def _hook_marker():
    """HYGIENE-01 のマーカー文字列を実行時に組み立てる。

    このリテラルをソースに直接書くと、real repo の HYGIENE-01 が tests/ を
    除外せず git-grep するため、本テストファイルが 30 日タイムボムになる。"""
    return "TODO(" + "temp)"


def _retired_needle():
    """GEN-01 が探す撤去済みドメイン用語（3 文字）を実行時に組み立てる。

    verify.py 本体と同じく literal を避ける（real repo の GEN-01 / CI が
    本テストファイルを FAIL 扱いにするのを防ぐため）。"""
    return "f" + "d" + "a"


def _settings_with_commands(*commands):
    """PreToolUse に command hook を配線した settings.json 文字列を作る。"""
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
# STRUCTURE-02 — .gitignore の実効的な secrets/ / .env 遮断
# ============================================================
class Structure02Test(GitTestCase):
    # 注: verify_structure は STRUCTURE-01/03/04 も rows に積むが、本テストは
    # -02 のみ検証する（他キーは res から無視する）。

    def test_pass_effective_gitignore(self):
        """PASS 側: secrets/** と .env が静的にも check-ignore 的にも遮断している。"""
        self.write(".gitignore", "secrets/**\n.env\n")
        st, msg = self.check(verify.verify_structure)["STRUCTURE-02"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("effectively blocks", msg)

    def test_fail_commented_out_rule_static(self):
        """FAIL 側（fake-green 検知）: secrets ルールをコメントアウトし否定行だけ
        残しても、有効行ロジックが静的に FAIL を出す。"""
        # `# secrets/**` は # 始まりで除外、`!secrets/**/` は ! 始まりで除外。
        # 部分文字列一致なら否定行に "secrets/" が残り PASS してしまうが、
        # 有効行ロジックはこれを見逃さない。
        self.write(".gitignore", "# secrets/**\n!secrets/**/\n.env\n")
        st, msg = self.check(verify.verify_structure)["STRUCTURE-02"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("does not effectively block", msg)
        self.assertIn("secrets/", msg)

    def test_fail_static_pass_dynamic_fail_backprobe(self):
        """FAIL 側（裏取り層）: 静的には "secrets/" / ".env" を部分文字列として含むが、
        実際には何も ignore しない行を仕込むと git check-ignore が not-ignored を返し FAIL。"""
        # "foo-secrets/bar" は "secrets/" を部分文字列に含むが secrets/probe.txt を
        # ignore しない。"x.envy" は ".env" を含むが .env を ignore しない。
        self.write(".gitignore", "foo-secrets/bar\nx.envy\n")
        st, msg = self.check(verify.verify_structure)["STRUCTURE-02"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("does not effectively block", msg)


# ============================================================
# HYGIENE-01 — 一時マーカー（実行時に組み立て）の 30 日超放置検知
# ============================================================
class Hygiene01SkipTest(VerifyTestCase):
    def test_skip_without_git(self):
        """SKIP 側: .git が無い fixture では git-blame チェックを飛ばす。"""
        st, msg = self.check(verify.verify_hygiene)["HYGIENE-01"]
        self.assertEqual(st, "SKIP", msg)
        self.assertIn("not a git repository", msg)


class Hygiene01GitTest(GitTestCase):
    def test_pass_no_markers(self):
        """PASS 側: マーカーの無いクリーンなコミット済みファイルは PASS。"""
        self.write("app/clean.py", "print('hello world')\n")
        commit_all(self.root, "chore: clean file")
        st, msg = self.check(verify.verify_hygiene)["HYGIENE-01"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("markers found", msg)

    def test_pass_marker_within_30_days(self):
        """PASS 側: 新鮮なコミットのマーカーは 30 日以内なので PASS。"""
        marker = _hook_marker()
        self.write("app/todo.py", "x = 1  # " + marker + " remove later\n")
        commit_all(self.root, "chore: fresh marker")  # 実時刻 = 30 日以内
        st, msg = self.check(verify.verify_hygiene)["HYGIENE-01"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("within 30 days", msg)

    def test_fail_marker_older_than_30_days(self):
        """FAIL 側: committer_date を 2020 に偽装したマーカーは 30 日超で FAIL。"""
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
        """PASS 側: fixture 内 scripts/verify.py のマーカーは self_ref_paths で除外され、
        他にマーカーが無ければ「マーカー無し」PASS になる。"""
        marker = _hook_marker()
        # self_ref_paths に含まれるパス。実時刻の古さに関係なく除外される。
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
# GEN-01 — 撤去済みドメイン用語の残存検知
# ============================================================
class Gen01SkipTest(VerifyTestCase):
    def test_skip_without_git(self):
        """SKIP 側: .git が無ければ残存スキャンを飛ばす。"""
        st, msg = self.check(verify.verify_gen)["GEN-01"]
        self.assertEqual(st, "SKIP", msg)
        self.assertIn("not a git repository", msg)


class Gen01GitTest(GitTestCase):
    def test_pass_clean_repo(self):
        """PASS 側: 追跡ファイルに撤去用語が無ければ PASS。"""
        self.write("app/clean.py", "value = 42\n")
        commit_all(self.root, "chore: clean tracked file")
        st, msg = self.check(verify.verify_gen)["GEN-01"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("no retired domain term residual", msg)

    def test_fail_needle_in_tracked_file(self):
        """FAIL 側: 追跡ファイルに撤去用語が残存すると FAIL。"""
        needle = _retired_needle()
        self.write("app/legacy.py", "term = '" + needle + "'\n")
        commit_all(self.root, "chore: residual term")
        st, msg = self.check(verify.verify_gen)["GEN-01"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("retired domain term residual found", msg)

    def test_pass_needle_in_excluded_workflow(self):
        """PASS 側: 撤去用語が .github/workflows/verify.yml 内（意図的な検出パターン）
        にあるだけなら除外され PASS。"""
        needle = _retired_needle()
        self.write(
            ".github/workflows/verify.yml", "# detects the " + needle + " term\n"
        )
        commit_all(self.root, "chore: excluded workflow")
        st, msg = self.check(verify.verify_gen)["GEN-01"]
        self.assertEqual(st, "PASS", msg)
        self.assertIn("no retired domain term residual", msg)


# ============================================================
# HARNESS-01/02 — .claude/settings.json の hooks 配線検証
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
        """INFO/INFO 側: settings.json が無ければ両 RQT とも INFO。"""
        res = self.check(verify.verify_harness)
        st1, msg1 = res["HARNESS-01"]
        st2, msg2 = res["HARNESS-02"]
        self.assertEqual(st1, "INFO", msg1)
        self.assertEqual(st2, "INFO", msg2)
        self.assertIn("not found", msg1)

    def test_fail_invalid_json(self):
        """FAIL/FAIL 側: settings.json が不正な JSON なら両 RQT とも FAIL。"""
        self._write_settings("{ this is not json ]")
        res = self.check(verify.verify_harness)
        st1, msg1 = res["HARNESS-01"]
        st2, msg2 = res["HARNESS-02"]
        self.assertEqual(st1, "FAIL", msg1)
        self.assertEqual(st2, "FAIL", msg2)
        self.assertIn("parse error", msg1)

    def test_fail_hook_file_not_found(self):
        """FAIL(HARNESS-01) 側: 配線された hook ファイルが存在しない。"""
        cmd = "$CLAUDE_PROJECT_DIR/.claude/hooks/missing.sh"
        self._write_settings(_settings_with_commands(cmd))
        st, msg = self.check(verify.verify_harness)["HARNESS-01"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("file not found", msg)

    def test_fail_hook_not_executable(self):
        """FAIL(HARNESS-01) 側: hook は在るが実行権限が無い。"""
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
        """FAIL(HARNESS-01) 側: 実行可能だが shebang が無い。"""
        cmd = "$CLAUDE_PROJECT_DIR/.claude/hooks/noshebang.sh"
        self._write_hook(".claude/hooks/noshebang.sh", "exit 0\n")
        self._write_settings(_settings_with_commands(cmd))
        st, msg = self.check(verify.verify_harness)["HARNESS-01"]
        self.assertEqual(st, "FAIL", msg)
        self.assertIn("missing shebang", msg)

    def test_pass_valid_hook(self):
        """PASS/PASS 側: 実行可能 + shebang + exit 0 の正常な hook。"""
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
        """FAIL(HARNESS-02) 側: 静的検証は通るが実行すると exit 1 になる hook。"""
        cmd = "$CLAUDE_PROJECT_DIR/.claude/hooks/boom.sh"
        self._write_hook(".claude/hooks/boom.sh", "#!/bin/sh\nexit 1\n")
        self._write_settings(_settings_with_commands(cmd))
        res = self.check(verify.verify_harness)
        st1, _ = res["HARNESS-01"]
        st2, msg2 = res["HARNESS-02"]
        self.assertEqual(st1, "PASS")  # 静的には問題なし
        self.assertEqual(st2, "FAIL", msg2)
        self.assertIn("exit 1", msg2)

    def test_command_outside_repo_root_skipped(self):
        """境界: repo 外コマンド（echo hi）は対象外。runnable 0 件で
        HARNESS-01 PASS（0 hooks）/ HARNESS-02 INFO（smoke test 対象なし）。"""
        self._write_settings(_settings_with_commands("echo hi"))
        res = self.check(verify.verify_harness)
        st1, msg1 = res["HARNESS-01"]
        st2, msg2 = res["HARNESS-02"]
        self.assertEqual(st1, "PASS", msg1)
        self.assertEqual(st2, "INFO", msg2)
        self.assertIn("no runnable hooks", msg2)


if __name__ == "__main__":
    unittest.main()

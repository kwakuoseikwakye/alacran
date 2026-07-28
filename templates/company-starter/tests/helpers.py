"""verify.py テストスイート共通ヘルパ（Issue #42）。

pytest ではなく標準ライブラリ unittest を採用する。本テンプレは
「git と python3 だけで動く」ことを約束しており（README / CLAUDE.md §0）、
検証器のテストが外部依存を持ち込むとその約束が崩れるため
（実際、ネットワーク制限環境では pip install 自体ができない）。

実行方法（repo root から）:
    python3 -m unittest discover -s tests -v

契約（test_verify_*.py はこのモジュールだけに依存する）:

- ``VerifyTestCase``: 空の一時 fixture root を作り ``verify.REPO_ROOT`` を
  そこへ差し替える基底クラス。各テストは自分のカテゴリが読むファイルだけを
  ``self.write()`` で配置し、該当する ``verify_*()`` を ``self.check()`` で呼ぶ
  （verify.py の各チェック関数は自カテゴリのパスしか読まないため全体骨格は不要）。
- ``GitTestCase``: 上記 + ``git init`` とコミット identity 設定済み。
- ``commit_all(root, msg, committer_date=None)``: 全ステージ + コミット。
  ``committer_date``（例: "2020-01-01T00:00:00 +0000"）で日付を偽装でき、
  HYGIENE-01 の「30 日超」判定を実時間を待たずにテストできる。
- ``run_check(fn)``: 新しい Report で fn を実行し ``{RQT_ID: (status, message)}`` を返す。

注意: verify.py 本体はテストのために改変しない（Issue #42 の制約）。
"""

import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import verify  # noqa: E402


def run_git(root, *args, env_extra=None):
    env = dict(os.environ)
    env.update(
        GIT_AUTHOR_NAME="tester",
        GIT_AUTHOR_EMAIL="tester@example.com",
        GIT_COMMITTER_NAME="tester",
        GIT_COMMITTER_EMAIL="tester@example.com",
    )
    if env_extra:
        env.update(env_extra)
    return subprocess.run(
        ["git", *args],
        cwd=root,
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )


def commit_all(root, msg="chore: fixture commit", committer_date=None):
    run_git(root, "add", "-A")
    env_extra = None
    if committer_date:
        env_extra = {
            "GIT_COMMITTER_DATE": committer_date,
            "GIT_AUTHOR_DATE": committer_date,
        }
    run_git(root, "commit", "-q", "--allow-empty", "-m", msg, env_extra=env_extra)


def run_check(fn):
    r = verify.Report()
    fn(r)
    return {id_: (st, msg) for _, id_, st, msg in r.rows}


class VerifyTestCase(unittest.TestCase):
    """空の fixture root を作り verify.REPO_ROOT を差し替える基底クラス。"""

    init_git = False

    def setUp(self):
        self._tmpdir = tempfile.mkdtemp(prefix="verify-test-")
        self.root = Path(self._tmpdir) / "repo"
        self.root.mkdir()
        self._orig_repo_root = verify.REPO_ROOT
        verify.REPO_ROOT = self.root
        self.addCleanup(self._restore)
        if self.init_git:
            run_git(self.root, "init", "-q")

    def _restore(self):
        verify.REPO_ROOT = self._orig_repo_root
        shutil.rmtree(self._tmpdir, ignore_errors=True)

    def write(self, relpath, content=""):
        p = self.root / relpath
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return p

    def check(self, fn):
        return run_check(fn)


class GitTestCase(VerifyTestCase):
    """git repo 化した fixture root（HYGIENE / GEN / STRUCTURE-02 裏取り等に使う）。"""

    init_git = True

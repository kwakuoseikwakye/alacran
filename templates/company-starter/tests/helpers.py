"""Shared test-suite helpers for verify.py (Issue #42).

Uses the standard library's unittest rather than pytest. This template
promises to run on "just git and python3" (README / CLAUDE.md §0), and the
verifier's own tests bringing in an external dependency would break that
promise (in practice, a network-restricted environment can't even run pip
install).

How to run (from the repo root):
    python3 -m unittest discover -s tests -v

Contract (test_verify_*.py depends only on this module):

- ``VerifyTestCase``: a base class that creates an empty temporary fixture
  root and points ``verify.REPO_ROOT`` at it. Each test places only the files
  its own category reads via ``self.write()``, and calls the relevant
  ``verify_*()`` via ``self.check()`` (each check function in verify.py only
  reads its own category's paths, so the whole skeleton isn't needed).
- ``GitTestCase``: the above, plus ``git init`` and commit identity already
  configured.
- ``commit_all(root, msg, committer_date=None)``: stage everything + commit.
  ``committer_date`` (e.g. "2020-01-01T00:00:00 +0000") can fake the date, so
  HYGIENE-01's "older than 30 days" check can be tested without waiting real time.
- ``run_check(fn)``: runs fn against a fresh Report and returns
  ``{RQT_ID: (status, message)}``.

Note: verify.py itself is never modified for the sake of a test (the
constraint from Issue #42).
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
    """Base class that creates an empty fixture root and points verify.REPO_ROOT at it."""

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
    """A fixture root turned into a git repo (used for HYGIENE / GEN / corroborating STRUCTURE-02, etc.)."""

    init_git = True

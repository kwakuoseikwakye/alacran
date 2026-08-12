#!/usr/bin/env python3
"""Check this company repo's own invariants.

Deliberately small. It checks the things that are cheap to get wrong and
expensive to discover late — a secret that would be committed, an ontology
that doesn't exist yet, a decision file with no reasoning in it. It does not
scan for secrets already committed; that needs a real scanner and a full
history walk, which is not this script's job.

Exit 0 = clean, 1 = at least one failure.
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _gitignore_blocks(path: str) -> bool:
    """True if git would ignore `path`. Falls back to a text match outside git."""
    try:
        result = subprocess.run(
            ["git", "-C", str(ROOT), "check-ignore", "-q", path],
            capture_output=True,
        )
        return result.returncode == 0
    except FileNotFoundError:
        return path.split("/")[0] in (ROOT / ".gitignore").read_text()


def check_secrets_ignored() -> list[str]:
    """secrets/ and .env must be ignored, or the next commit leaks them."""
    failures = []
    for path in ("secrets/example.txt", ".env"):
        if not _gitignore_blocks(path):
            failures.append(f".gitignore does not block {path}")
    return failures


def check_ontology_exists() -> list[str]:
    target = ROOT / "definitions" / "ontology" / "company.yaml"
    if not target.exists():
        return ["definitions/ontology/company.yaml is missing — run /define-company"]
    if "<<TODO" in target.read_text():
        return ["definitions/ontology/company.yaml still has <<TODO>> placeholders"]
    return []


def check_decisions_have_reasoning() -> list[str]:
    """A decision file that only says what, not why, is a rumour."""
    failures = []
    decisions = ROOT / "docs" / "decisions"
    if not decisions.is_dir():
        return failures
    for path in sorted(decisions.glob("*.md")):
        if path.name == "README.md":
            continue
        body = path.read_text()
        if not re.search(r"^##+\s*(why|reasoning|rationale)", body, re.I | re.M):
            failures.append(f"{path.relative_to(ROOT)} has no Why/Reasoning section")
    return failures


CHECKS = (
    ("secrets are git-ignored", check_secrets_ignored),
    ("company ontology is filled in", check_ontology_exists),
    ("decisions record their reasoning", check_decisions_have_reasoning),
)


def main() -> int:
    all_failures = []
    for label, check in CHECKS:
        failures = check()
        print(f"{'FAIL' if failures else ' ok '}  {label}")
        all_failures.extend(failures)

    if all_failures:
        sys.stdout.flush()  # else the stderr block below jumps ahead of the check lines
        print(f"\n{len(all_failures)} problem(s):", file=sys.stderr)
        for failure in all_failures:
            print(f"  - {failure}", file=sys.stderr)
        return 1

    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

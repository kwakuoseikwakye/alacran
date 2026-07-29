#!/usr/bin/env python3
"""Report remaining Japanese characters in the bundled company template.

    python3 scripts/jp-audit.py            # summary by area
    python3 scripts/jp-audit.py --files    # per-file counts, worst first
    python3 scripts/jp-audit.py <subpath>  # limit to one subtree

Used to track the Japanese -> English translation of templates/company-starter
objectively, rather than by eyeballing it.
"""

import re
import sys
import pathlib

JP = re.compile(r"[぀-ゟ゠-ヿ一-鿿]")
ROOT = pathlib.Path("templates/company-starter")
SKIP_SUFFIX = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".zip", ".pyc", ".woff2"}


def counts(subpath: str = ""):
    base = ROOT / subpath if subpath else ROOT
    out = []
    for p in sorted(base.rglob("*")):
        if not p.is_file() or p.suffix.lower() in SKIP_SUFFIX:
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        n = len(JP.findall(text))
        if n:
            out.append((n, str(p.relative_to(ROOT))))
    return sorted(out, reverse=True)


def area_of(rel: str) -> str:
    for prefix in (".claude/skills", ".claude/commands", ".claude/rules", ".claude/hooks",
                   "docs/templates", "docs", "definitions", "tests", "scripts",
                   "exercises", ".github", "notes", "state"):
        if rel.startswith(prefix):
            return prefix
    return "(root)"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    rows = counts(args[0] if args else "")
    total = sum(n for n, _ in rows)

    if "--files" in sys.argv:
        for n, rel in rows:
            print(f"{n:>7}  {rel}")
    else:
        areas: dict[str, list[int]] = {}
        for n, rel in rows:
            a = area_of(rel)
            areas.setdefault(a, [0, 0])
            areas[a][0] += n
            areas[a][1] += 1
        print(f"{'jp_chars':>9} {'files':>6}  area")
        for area, (chars, files) in sorted(areas.items(), key=lambda kv: -kv[1][0]):
            print(f"{chars:>9} {files:>6}  {area}")

    print(f"\nTOTAL: {total} Japanese characters across {len(rows)} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())

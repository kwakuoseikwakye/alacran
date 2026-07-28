#!/usr/bin/env python3
"""piro自己チェック: 生成したKiro互換specの機械検証。

使い方: python3 validate.py <specディレクトリ>
合格で exit 0、不合格で exit 1(エラーを列挙)。
"""
import json
import re
import sys
from pathlib import Path

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
EARS_START = re.compile(r"^(THE|WHEN|IF|WHILE|WHERE|FOR EACH)\b")
DESIGN_HEADINGS = [
    "## Overview",
    "## Architecture",
    "## Components and Interfaces",
    "## Data Models",
    "## Error Handling",
    "## Testing Strategy",
]


def check(spec_dir: Path) -> list:
    errors = []

    def need(name):
        p = spec_dir / name
        if not p.exists():
            errors.append(f"{name} が無い")
            return None
        return p

    req_p = need("requirements.md")
    des_p = need("design.md")
    tsk_p = need("tasks.md")
    cfg_p = need(".config.kiro")
    if errors:
        return errors

    if (spec_dir / "tasks.meta.json").exists():
        errors.append("tasks.meta.json を生成している(禁止。Kiroに作らせる)")

    # --- .config.kiro ---
    raw = cfg_p.read_text(encoding="utf-8")
    if "\n" in raw.strip():
        errors.append(".config.kiro が複数行(1行JSONにする)")
    try:
        cfg = json.loads(raw)
        if set(cfg) != {"specId", "workflowType", "specType"}:
            errors.append(f".config.kiro のフィールドが規定外: {sorted(cfg)}")
        if not UUID_RE.match(str(cfg.get("specId", ""))):
            errors.append(".config.kiro の specId が小文字UUIDv4形式でない")
        if cfg.get("workflowType") not in ("requirements-first", "design-first"):
            errors.append(f"workflowType が不正: {cfg.get('workflowType')}")
        if cfg.get("specType") not in ("feature", "bugfix"):
            errors.append(f"specType が不正: {cfg.get('specType')}")
    except json.JSONDecodeError as e:
        errors.append(f".config.kiro がJSONとして読めない: {e}")

    # --- requirements.md ---
    req = req_p.read_text(encoding="utf-8")
    if not req.startswith("# Requirements Document"):
        errors.append("requirements.md が '# Requirements Document' で始まっていない")
    for h in ("## Introduction", "## Requirements"):
        if h not in req:
            errors.append(f"requirements.md に '{h}' が無い")

    req_ids = set()   # {"1.1", "1.2", ...}
    req_nums = set()  # {"1", "2", ...}
    cur = None
    in_ac = False
    for line in req.splitlines():
        m = re.match(r"### Requirement (\d+)", line)
        if m:
            cur = m.group(1)
            req_nums.add(cur)
            in_ac = False
            continue
        if line.startswith("#### Acceptance Criteria"):
            in_ac = True
            continue
        if line.startswith("#"):
            in_ac = False
            continue
        m = re.match(r"(\d+)\.\s+(.*)", line.strip())
        if m and in_ac and cur:
            req_ids.add(f"{cur}.{m.group(1)}")
            body = m.group(2)
            if not EARS_START.match(body):
                errors.append(
                    f"受入基準 {cur}.{m.group(1)} がEARSキーワードで始まっていない: {body[:40]}"
                )
            elif " SHALL " not in f" {body} ":
                errors.append(f"受入基準 {cur}.{m.group(1)} に SHALL が無い")
    if not req_ids:
        errors.append("requirements.md に受入基準(番号付きEARS文)が1つも無い")

    # --- design.md ---
    des = des_p.read_text(encoding="utf-8")
    if not des.startswith("# Design Document"):
        errors.append("design.md が '# Design Document' で始まっていない")
    pos = -1
    for h in DESIGN_HEADINGS:
        idx = des.find(f"\n{h}\n")
        if idx < 0:
            errors.append(f"design.md に '{h}' が無い")
        elif idx < pos:
            errors.append(f"design.md の '{h}' の順序が公式順と違う")
        else:
            pos = idx

    # --- tasks.md ---
    tsk = tsk_p.read_text(encoding="utf-8")
    if not tsk.startswith("# Implementation Plan"):
        errors.append("tasks.md が '# Implementation Plan' で始まっていない")
    bad_markers = re.findall(r"- \[(x|-|~)\]", tsk)
    if bad_markers:
        errors.append(f"tasks.md に初期状態でない状態マーカーがある: {sorted(set(bad_markers))}")

    refs = set()
    for m in re.finditer(r"_Requirements:\s*([0-9.,\s]+)_", tsk):
        refs |= {t.strip() for t in m.group(1).split(",") if t.strip()}
    dangling = sorted(r for r in refs if r not in req_ids)
    if dangling:
        errors.append(f"tasks.md の _Requirements: 参照が実在しない: {dangling}")
    referenced_nums = {r.split(".")[0] for r in refs}
    orphans = sorted(req_nums - referenced_nums, key=int)
    if orphans:
        errors.append(f"どのタスクからも参照されていない Requirement: {orphans}")
    if not refs:
        errors.append("tasks.md に _Requirements: 参照が1つも無い")

    # --- 共通 ---
    for name, text in (("requirements.md", req), ("design.md", des), ("tasks.md", tsk)):
        if "—" in text:
            errors.append(f"{name} に em dash が含まれている")

    return errors


def main():
    if len(sys.argv) != 2:
        print("使い方: python3 validate.py <specディレクトリ>")
        return 2
    errors = check(Path(sys.argv[1]))
    if errors:
        print(f"NG: {len(errors)}件")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("OK: 全チェック合格")
    return 0


if __name__ == "__main__":
    sys.exit(main())

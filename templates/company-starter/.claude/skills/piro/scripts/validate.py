#!/usr/bin/env python3
"""piro self-check: machine verification of a generated Kiro-compatible spec.

Usage: python3 validate.py <spec directory>
Exits 0 on pass, 1 on failure (listing the errors).
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
            errors.append(f"{name} is missing")
            return None
        return p

    req_p = need("requirements.md")
    des_p = need("design.md")
    tsk_p = need("tasks.md")
    cfg_p = need(".config.kiro")
    if errors:
        return errors

    if (spec_dir / "tasks.meta.json").exists():
        errors.append("tasks.meta.json has been generated (forbidden. Let Kiro create it)")

    # --- .config.kiro ---
    raw = cfg_p.read_text(encoding="utf-8")
    if "\n" in raw.strip():
        errors.append(".config.kiro spans multiple lines (make it single-line JSON)")
    try:
        cfg = json.loads(raw)
        if set(cfg) != {"specId", "workflowType", "specType"}:
            errors.append(f".config.kiro has non-standard fields: {sorted(cfg)}")
        if not UUID_RE.match(str(cfg.get("specId", ""))):
            errors.append(".config.kiro specId is not a lowercase UUIDv4")
        if cfg.get("workflowType") not in ("requirements-first", "design-first"):
            errors.append(f"invalid workflowType: {cfg.get('workflowType')}")
        if cfg.get("specType") not in ("feature", "bugfix"):
            errors.append(f"invalid specType: {cfg.get('specType')}")
    except json.JSONDecodeError as e:
        errors.append(f".config.kiro is not readable as JSON: {e}")

    # --- requirements.md ---
    req = req_p.read_text(encoding="utf-8")
    if not req.startswith("# Requirements Document"):
        errors.append("requirements.md does not start with '# Requirements Document'")
    for h in ("## Introduction", "## Requirements"):
        if h not in req:
            errors.append(f"requirements.md is missing '{h}'")

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
                    f"acceptance criterion {cur}.{m.group(1)} does not start with an EARS keyword: {body[:40]}"
                )
            elif " SHALL " not in f" {body} ":
                errors.append(f"acceptance criterion {cur}.{m.group(1)} has no SHALL")
    if not req_ids:
        errors.append("requirements.md has no acceptance criteria (numbered EARS statements) at all")

    # --- design.md ---
    des = des_p.read_text(encoding="utf-8")
    if not des.startswith("# Design Document"):
        errors.append("design.md does not start with '# Design Document'")
    pos = -1
    for h in DESIGN_HEADINGS:
        idx = des.find(f"\n{h}\n")
        if idx < 0:
            errors.append(f"design.md is missing '{h}'")
        elif idx < pos:
            errors.append(f"design.md heading '{h}' is out of the official order")
        else:
            pos = idx

    # --- tasks.md ---
    tsk = tsk_p.read_text(encoding="utf-8")
    if not tsk.startswith("# Implementation Plan"):
        errors.append("tasks.md does not start with '# Implementation Plan'")
    bad_markers = re.findall(r"- \[(x|-|~)\]", tsk)
    if bad_markers:
        errors.append(f"tasks.md has state markers that are not the initial state: {sorted(set(bad_markers))}")

    refs = set()
    for m in re.finditer(r"_Requirements:\s*([0-9.,\s]+)_", tsk):
        refs |= {t.strip() for t in m.group(1).split(",") if t.strip()}
    dangling = sorted(r for r in refs if r not in req_ids)
    if dangling:
        errors.append(f"tasks.md _Requirements: references that do not exist: {dangling}")
    referenced_nums = {r.split(".")[0] for r in refs}
    orphans = sorted(req_nums - referenced_nums, key=int)
    if orphans:
        errors.append(f"Requirements not referenced by any task: {orphans}")
    if not refs:
        errors.append("tasks.md has no _Requirements: references at all")

    # --- shared ---
    for name, text in (("requirements.md", req), ("design.md", des), ("tasks.md", tsk)):
        if "—" in text:
            errors.append(f"{name} contains an em dash")

    return errors


def main():
    if len(sys.argv) != 2:
        print("Usage: python3 validate.py <spec directory>")
        return 2
    errors = check(Path(sys.argv[1]))
    if errors:
        print(f"FAIL: {len(errors)} error(s)")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("OK: all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())

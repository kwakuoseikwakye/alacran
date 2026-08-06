#!/usr/bin/env python3
"""
The RQT (Requirements Traceability) verification mechanism for this
company-starter template.

This script carries only a minimal set of base RQTs. You may add your own
company's RQTs as verify_*() functions (when you do, also add the call to
main()'s call list).

An RQT whose target doesn't exist is treated as SKIP (with an INFO log) rather
than FAIL. This is a deliberate design choice so the template doesn't come out
covered in red the moment it's unpacked — it assumes you grow the harness
incrementally.

Usage:
  python3 scripts/verify.py
  python3 scripts/verify.py --json
"""

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

try:
    import yaml
except ImportError:
    print("ERROR: pyyaml required. install: pip3 install pyyaml", file=sys.stderr)
    sys.exit(1)

REPO_ROOT = Path(__file__).resolve().parent.parent


class Report:
    """A thin container that accumulates PASS/WARN/FAIL/INFO rows by category."""

    def __init__(self):
        self.rows = []  # (category, id, status, message)

    def add(self, category, id_, status, msg=""):
        assert status in ("PASS", "WARN", "FAIL", "INFO", "SKIP")
        self.rows.append((category, id_, status, msg))

    def passed(self):
        return all(r[2] != "FAIL" for r in self.rows)

    def by_category(self):
        cats = {}
        for cat, id_, st, msg in self.rows:
            cats.setdefault(cat, []).append((id_, st, msg))
        return cats

    def summary(self):
        passed = sum(1 for r in self.rows if r[2] == "PASS")
        warned = sum(1 for r in self.rows if r[2] == "WARN")
        failed = sum(1 for r in self.rows if r[2] == "FAIL")
        skipped = sum(1 for r in self.rows if r[2] in ("SKIP", "INFO"))
        return passed, warned, failed, skipped, len(self.rows)

    def as_dict(self):
        return {
            "rows": [
                {"category": c, "id": i, "status": s, "message": m}
                for c, i, s, m in self.rows
            ],
        }


def load_yaml(path: Path):
    """Load yaml; return (data_or_None, err_or_None)."""
    try:
        with open(path, encoding="utf-8") as f:
            return yaml.safe_load(f), None
    except FileNotFoundError:
        return None, f"file not found: {path}"
    except yaml.YAMLError as e:
        return None, f"yaml parse error: {e}"


# ============================================================
# Category: STRUCTURE — the minimal repository skeleton
# ============================================================
def verify_structure(r: Report):
    cat = "STRUCTURE"

    # STRUCTURE-01: LICENSE.md
    if (REPO_ROOT / "LICENSE.md").exists():
        r.add(cat, "STRUCTURE-01", "PASS", "LICENSE.md exists")
    else:
        r.add(cat, "STRUCTURE-01", "FAIL", "LICENSE.md not found")

    # STRUCTURE-02: whether .gitignore EFFECTIVELY blocks secrets/ and .env.
    # A substring match ("secrets/" in body) would fake-green: commenting out
    # secrets/** (# secrets/**) still leaves the string present on a negated
    # line (!secrets/**/), so it would keep PASSing. So this judges by active
    # pattern lines only (excluding comment # / blank / negated ! lines), and
    # where .git exists also cross-checks with git check-ignore for real
    # (falling back to the static check in a .git-less environment).
    gitignore = REPO_ROOT / ".gitignore"
    if not gitignore.exists():
        r.add(cat, "STRUCTURE-02", "FAIL", ".gitignore not found")
    else:
        effective = [
            ln.strip()
            for ln in gitignore.read_text(encoding="utf-8").splitlines()
            if ln.strip() and not ln.lstrip().startswith(("#", "!"))
        ]
        unprotected = []
        if not any("secrets/" in ln for ln in effective):
            unprotected.append("secrets/")
        if not any(".env" in ln for ln in effective):
            unprotected.append(".env")
        # Only when the static check passes, corroborate with git check-ignore
        if not unprotected and (REPO_ROOT / ".git").exists():
            for probe, label in (("secrets/probe.txt", "secrets/"), (".env", ".env")):
                try:
                    ci = subprocess.run(
                        ["git", "check-ignore", "-q", probe],
                        cwd=REPO_ROOT,
                        capture_output=True,
                        timeout=10,
                    )
                except (subprocess.SubprocessError, OSError):
                    continue  # fall back to the static check if git etc. is unavailable
                if ci.returncode == 1:  # 1 = not ignored (not effectively blocked)
                    unprotected.append(label)
        if unprotected:
            r.add(
                cat,
                "STRUCTURE-02",
                "FAIL",
                f".gitignore does not effectively block: {unprotected}",
            )
        else:
            r.add(
                cat,
                "STRUCTURE-02",
                "PASS",
                ".gitignore effectively blocks secrets/ and .env",
            )

    # STRUCTURE-03: CLAUDE.md
    if (REPO_ROOT / "CLAUDE.md").exists():
        r.add(cat, "STRUCTURE-03", "PASS", "CLAUDE.md exists")
    else:
        r.add(cat, "STRUCTURE-03", "FAIL", "CLAUDE.md not found")

    # STRUCTURE-04: README.md
    if (REPO_ROOT / "README.md").exists():
        r.add(cat, "STRUCTURE-04", "PASS", "README.md exists")
    else:
        r.add(cat, "STRUCTURE-04", "FAIL", "README.md not found")


# ============================================================
# Category: HARNESS — verifying the hook wiring in .claude/settings.json
# ============================================================
def _resolve_project_dir_vars(cmd: str) -> str:
    """Resolve $CLAUDE_PROJECT_DIR / ${CLAUDE_PROJECT_DIR} to REPO_ROOT."""
    resolved = cmd.replace("${CLAUDE_PROJECT_DIR}", str(REPO_ROOT))
    return resolved.replace("$CLAUDE_PROJECT_DIR", str(REPO_ROOT))


def _iter_hook_commands(settings: dict):
    """Walk settings["hooks"] (event -> [{"matcher":..., "hooks":[{"type":"command",
    "command":...}]}]) and yield each command string."""
    hooks_cfg = settings.get("hooks")
    if not isinstance(hooks_cfg, dict):
        return
    for matchers in hooks_cfg.values():
        if not isinstance(matchers, list):
            continue
        for matcher in matchers:
            if not isinstance(matcher, dict):
                continue
            for hook in matcher.get("hooks", []) or []:
                if isinstance(hook, dict) and hook.get("type") == "command":
                    cmd = hook.get("command")
                    if isinstance(cmd, str) and cmd.strip():
                        yield cmd


def verify_harness(r: Report):
    """HARNESS-01/02: verifies that the hook wiring in .claude/settings.json is
    actually in a state where it will fire.

    This structures CLAUDE.md §6's most common sticking point (hooks not firing:
    execute permission / input contract) as an RQT. This checker only READS
    settings.json and never rewrites it (changing the wiring itself is a
    separate concern).
    """
    cat = "HARNESS"
    settings_path = REPO_ROOT / ".claude" / "settings.json"

    if not settings_path.exists():
        r.add(
            cat,
            "HARNESS-01",
            "INFO",
            f"{settings_path.relative_to(REPO_ROOT)} not found — "
            "add one to promote HARNESS-01 to a PASS/FAIL verdict",
        )
        r.add(
            cat,
            "HARNESS-02",
            "INFO",
            "settings.json not found, skipping hook smoke test",
        )
        return

    try:
        settings = json.loads(settings_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        r.add(cat, "HARNESS-01", "FAIL", f"settings.json parse error: {e}")
        r.add(
            cat,
            "HARNESS-02",
            "FAIL",
            "settings.json parse error, skipping hook smoke test",
        )
        return

    if not isinstance(settings, dict):
        r.add(cat, "HARNESS-01", "FAIL", "settings.json top-level is not a mapping")
        r.add(
            cat,
            "HARNESS-02",
            "FAIL",
            "settings.json malformed, skipping hook smoke test",
        )
        return

    commands = list(_iter_hook_commands(settings))
    if not commands:
        r.add(cat, "HARNESS-01", "INFO", "no hooks configured in settings.json")
        r.add(
            cat, "HARNESS-02", "INFO", "no hooks configured, skipping hook smoke test"
        )
        return

    # HARNESS-01: static verification (exists / executable / shebang)
    problems = []
    bad_cmds = set()
    runnable = []  # [(command_str, resolved_path), ...]
    for cmd in commands:
        resolved_cmd = _resolve_project_dir_vars(cmd)
        tokens = resolved_cmd.split()
        path_token = tokens[0] if tokens else resolved_cmd
        p = Path(path_token)
        if not p.is_absolute() or not str(p).startswith(str(REPO_ROOT)):
            continue  # out of scope: anything outside the repo (a command on PATH, etc.)
        if not p.exists():
            problems.append(f"{cmd}: file not found ({p})")
            bad_cmds.add(cmd)
            continue
        if not os.access(p, os.X_OK):
            problems.append(f"{cmd}: not executable (chmod +x required)")
            bad_cmds.add(cmd)
            continue
        try:
            with p.open(encoding="utf-8", errors="replace") as fh:
                first_line = fh.readline()
        except OSError as e:
            problems.append(f"{cmd}: cannot read file: {e}")
            bad_cmds.add(cmd)
            continue
        if not first_line.startswith("#!"):
            problems.append(f"{cmd}: missing shebang (#!) on line 1")
            bad_cmds.add(cmd)
            continue
        runnable.append((cmd, p))

    if problems:
        r.add(cat, "HARNESS-01", "FAIL", f"hook wiring issues: {problems}")
    else:
        r.add(
            cat,
            "HARNESS-01",
            "PASS",
            f"{len(runnable)} hook command(s) exist, executable, and have a shebang",
        )

    # HARNESS-02: the hook smoke test (dynamic verification).
    #
    # Hook scripts are not hard-coded — they are discovered dynamically from
    # settings.json (runnable is HARNESS-01's scan result). This means a hook
    # a participant adds later is automatically covered too.
    #
    # The sample input is composed so it exercises both the Bash-matcher and
    # the Edit/Write-matcher path in one shot: "git status" is a safe command
    # that doesn't match either the blocking or advisory branch of
    # git-ops-validator.sh, and file_path is deliberately a non-existent path
    # so format-check.sh exits 0 with no side effects.
    sample_input = json.dumps(
        {
            "tool_name": "Bash",
            "tool_input": {
                "command": "git status",
                "file_path": str(REPO_ROOT / "harness-probe-nonexistent.md"),
            },
        }
    )
    smoke_problems = []
    tested = 0
    for cmd, p in runnable:
        if cmd in bad_cmds:
            continue  # already reported by HARNESS-01 — avoid a duplicate report
        tested += 1
        try:
            proc = subprocess.run(
                [str(p)],
                input=sample_input,
                capture_output=True,
                text=True,
                timeout=15,
                cwd=REPO_ROOT,
            )
        except (subprocess.SubprocessError, OSError) as e:
            smoke_problems.append(f"{cmd}: failed to execute: {e}")
            continue
        if proc.returncode != 0:
            stderr_first = (proc.stderr or "").splitlines()[0] if proc.stderr else ""
            smoke_problems.append(
                f"{cmd}: exit {proc.returncode} (stderr: {stderr_first})"
            )

    if smoke_problems:
        r.add(cat, "HARNESS-02", "FAIL", f"hook smoke test issues: {smoke_problems}")
    elif tested:
        r.add(
            cat,
            "HARNESS-02",
            "PASS",
            f"{tested} hook(s) exit 0 on benign sample input",
        )
    else:
        r.add(
            cat,
            "HARNESS-02",
            "INFO",
            "no runnable hooks to smoke test (see HARNESS-01)",
        )


# ============================================================
# Category: HYGIENE — code hygiene
# ============================================================
def verify_hygiene(r: Report):
    cat = "HYGIENE"

    # HYGIENE-01: whether a TODO(temp) marker has been left for more than 30 days
    # Best-effort: SKIP in an environment where git blame is unavailable (no .git, etc.)
    if not (REPO_ROOT / ".git").exists():
        r.add(
            cat, "HYGIENE-01", "SKIP", "not a git repository, skipping git-blame check"
        )
        return

    # The RQT mechanism itself (verify.py), and docs that explain the TODO(temp)
    # pattern, are excluded — otherwise they become a self-reference time bomb.
    # Participants want to scan only their own company's code.
    self_ref_paths = {
        "scripts/verify.py",
        ".claude/commands/verify.md",
        ".claude/rules/scope-contract.md",
        "docs/setup-walkthrough.md",
    }
    try:
        grep = subprocess.run(
            ["git", "grep", "-n", "-I", "TODO(temp)"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (subprocess.SubprocessError, OSError) as e:
        r.add(cat, "HYGIENE-01", "SKIP", f"git grep unavailable: {e}")
        return

    if grep.returncode not in (0, 1):
        r.add(cat, "HYGIENE-01", "SKIP", f"git grep failed: {grep.stderr.strip()}")
        return

    hits = [
        line
        for line in grep.stdout.splitlines()
        if line.strip() and line.split(":", 1)[0] not in self_ref_paths
    ]
    if not hits:
        r.add(cat, "HYGIENE-01", "PASS", "no TODO(temp) markers found")
        return

    stale = []
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    for line in hits:
        try:
            file_path, line_no, _ = line.split(":", 2)
        except ValueError:
            continue
        blame = subprocess.run(
            ["git", "blame", "-L", f"{line_no},{line_no}", "--porcelain", file_path],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if blame.returncode != 0:
            continue
        ts = None
        for bline in blame.stdout.splitlines():
            if bline.startswith("committer-time "):
                ts = int(bline.split()[1])
                break
        if ts is None:
            continue
        committed_at = datetime.fromtimestamp(ts, tz=timezone.utc)
        if committed_at < cutoff:
            stale.append(f"{file_path}:{line_no} ({committed_at.date()})")

    if stale:
        r.add(cat, "HYGIENE-01", "FAIL", f"TODO(temp) older than 30 days: {stale}")
    else:
        r.add(
            cat,
            "HYGIENE-01",
            "PASS",
            f"{len(hits)} TODO(temp) found, all within 30 days",
        )


# ============================================================
# Category: ONTOLOGY — the YAML syntax of definitions/ontology/
# ============================================================
def verify_ontology(r: Report):
    cat = "ONTOLOGY"
    ontology_dir = REPO_ROOT / "definitions" / "ontology"

    if not ontology_dir.exists():
        r.add(
            cat,
            "ONTOLOGY-01",
            "INFO",
            f"{ontology_dir.relative_to(REPO_ROOT)} not found — "
            "add a yaml to promote ONTOLOGY-01 to a PASS/FAIL verdict "
            "(cf. docs/templates/ontology-starter.yaml)",
        )
        return

    yaml_files = sorted(ontology_dir.glob("*.yaml")) + sorted(
        ontology_dir.glob("*.yml")
    )
    if not yaml_files:
        r.add(
            cat,
            "ONTOLOGY-01",
            "INFO",
            "no yaml files under definitions/ontology/ — "
            "add a yaml to promote ONTOLOGY-01 to a PASS/FAIL verdict "
            "(cf. docs/templates/ontology-starter.yaml)",
        )
        return

    # Beyond just parsing, check a minimal schema. To allow a split-file setup
    # (customer.yaml etc.), it's OK as long as each yaml's top level is a mapping
    # containing at least one of customer / org / product
    # (cf. docs/templates/ontology-starter.yaml).
    ontology_keys = ("customer", "org", "product")
    problems = []
    for f in yaml_files:
        data, err = load_yaml(f)
        if err:
            problems.append(f"{f.name}: {err}")
            continue
        if not isinstance(data, dict):
            problems.append(
                f"{f.name}: top-level is not a mapping "
                "(cf. docs/templates/ontology-starter.yaml)"
            )
            continue
        if not any(k in data for k in ontology_keys):
            problems.append(
                f"{f.name}: none of {list(ontology_keys)} present at top level "
                "(cf. docs/templates/ontology-starter.yaml)"
            )
    if problems:
        r.add(cat, "ONTOLOGY-01", "FAIL", f"ontology yaml issues: {problems}")
    else:
        r.add(
            cat,
            "ONTOLOGY-01",
            "PASS",
            f"{len(yaml_files)} ontology yaml file(s) parse OK "
            "+ have customer/org/product",
        )


# ============================================================
# Category: HITL — HITL Gate trigger definitions
# ============================================================
def _load_approver_roles():
    """Return the set of role_assignments keys from
    definitions/hitl/approver-registry.yaml.

    Returns None if the file is absent, unfilled (a value still contains
    <<TODO), unparseable, or has no role_assignments — the caller then skips
    matching approver_role (falling to the INFO side). Treating a trigger's
    role as FAIL against an unfilled registry would force a specific fill-in
    order and create false negatives, so matching is only enabled once the
    registry has actually been filled in."""
    reg = REPO_ROOT / "definitions" / "hitl" / "approver-registry.yaml"
    if not reg.exists():
        return None
    body = reg.read_text(encoding="utf-8")
    # A registry whose value side (excluding anything after a YAML # comment)
    # still contains <<TODO is treated as unfilled.
    if any("<<TODO" in line.split("#", 1)[0] for line in body.splitlines()):
        return None
    data, err = load_yaml(reg)
    if err or not isinstance(data, dict):
        return None
    roles = data.get("role_assignments")
    if not isinstance(roles, dict) or not roles:
        return None
    return set(roles.keys())


# Issue #50: fixes HITL-01's fake-green.
# The old implementation PASSed as long as the body contained even one "|" and
# one "---", so it wrongly PASSed on nothing more than scattered | characters
# and a thematic-break --- line, even with the whole trigger table deleted
# (hitl-gate.md contains plenty of both). This detects, line by line, that a
# REAL Markdown table — a header row + a divider row + one or more data rows —
# actually sits adjacent to each other.
#   header: a line with a character on both sides of a pipe (2+ cells)
#   divider: | --- | --- | / |---|---| style (2+ divider cells, alignment colons allowed)
_MD_TABLE_HEADER_RE = re.compile(r"\S\s*\|\s*\S")
_MD_TABLE_DIVIDER_RE = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$")


def _count_md_table_rows(body: str) -> int:
    """Detect a real Markdown table and return the data-row count of the first one found (0 if none)."""
    lines = body.splitlines()
    for i in range(len(lines) - 1):
        if _MD_TABLE_HEADER_RE.search(lines[i]) and _MD_TABLE_DIVIDER_RE.match(
            lines[i + 1]
        ):
            data_rows = 0
            j = i + 2
            while j < len(lines) and lines[j].strip() and "|" in lines[j]:
                data_rows += 1
                j += 1
            if data_rows >= 1:
                return data_rows
    return 0


def verify_hitl(r: Report):
    cat = "HITL"
    hitl_rule = REPO_ROOT / ".claude" / "rules" / "hitl-gate.md"

    if not hitl_rule.exists():
        r.add(
            cat,
            "HITL-01",
            "INFO",
            f"{hitl_rule.relative_to(REPO_ROOT)} not found, skipping "
            "(add a HITL gate rule to activate this RQT)",
        )
        return

    body = hitl_rule.read_text(encoding="utf-8")
    # Whether a trigger table exists: detect a real Markdown table (header+divider+data rows) (Issue #50)
    data_rows = _count_md_table_rows(body)
    if data_rows >= 1:
        r.add(
            cat,
            "HITL-01",
            "PASS",
            f"hitl-gate.md has a trigger table ({data_rows} data row(s) detected)",
        )
    else:
        r.add(cat, "HITL-01", "FAIL", "hitl-gate.md exists but no trigger table found")

    # HITL-02: verifies definitions/hitl/triggers/*.yaml.
    #
    # Division of roles: the table in .claude/rules/hitl-gate.md §2 is the
    # category list of judgement principles (the overview a human or AI reads),
    # while here (triggers/*.yaml) is the operational SSOT of individual
    # triggers (what machine verification checks). When adding or changing a
    # trigger, the yaml side is authoritative.
    #
    # What is verified:
    #   (a) An unfilled template (a value still contains <<TODO) is INFO.
    #       Filling it in promotes it to a PASS/FAIL verdict.
    #   (b) A filled one is checked against the required keys in _schema.md §1.
    #   (c) A filled approver_role is matched against the role_assignments in
    #       approver-registry.yaml.
    # Files starting with _ (such as _schema) are notation guides, out of scope.
    # No yaml (unfilled) is a normal state, so INFO. The examples/ side is
    # covered by EXAMPLE-01/02.
    triggers_dir = REPO_ROOT / "definitions" / "hitl" / "triggers"
    if not triggers_dir.exists():
        r.add(
            cat,
            "HITL-02",
            "INFO",
            "definitions/hitl/triggers/ not found — "
            "add a trigger yaml to promote HITL-02 to a PASS/FAIL verdict "
            "(cf. definitions/hitl/triggers/_schema.md §1)",
        )
        return

    trigger_files = [
        f
        for f in sorted(triggers_dir.glob("*.yaml"))
        + sorted(triggers_dir.glob("*.yml"))
        if not f.name.startswith("_")
    ]
    if not trigger_files:
        r.add(
            cat,
            "HITL-02",
            "INFO",
            "no trigger yaml under definitions/hitl/triggers/ — "
            "add a trigger yaml to promote HITL-02 to a PASS/FAIL verdict "
            "(cf. definitions/hitl/triggers/_schema.md §1)",
        )
        return

    # Match the required keys in _schema.md §1 (expanded from the original 4).
    required_keys = (
        "id",
        "name",
        "severity",
        "fire_when",
        "approver_role",
        "notify",
        "on_timeout",
    )
    # The set of roles from the approver registry (None if unfilled/absent -> approver_role matching is skipped).
    approver_roles = _load_approver_roles()

    # A file whose value side (excluding anything after a YAML # comment) still
    # contains <<TODO is treated as an "unfilled template" = INFO.
    filled, unfilled = [], []
    for f in trigger_files:
        body = f.read_text(encoding="utf-8")
        if any("<<TODO" in line.split("#", 1)[0] for line in body.splitlines()):
            unfilled.append(f)
        else:
            filled.append(f)

    problems = []
    for f in filled:
        data, err = load_yaml(f)
        if err:
            problems.append(f"{f.name}: {err}")
            continue
        if not isinstance(data, dict):
            problems.append(f"{f.name}: top-level is not a mapping")
            continue
        missing = [k for k in required_keys if k not in data]
        if missing:
            problems.append(f"{f.name}: missing keys {missing} (cf. _schema.md §1)")
        role = data.get("approver_role")
        if role and approver_roles is not None and role not in approver_roles:
            problems.append(
                f"{f.name}: approver_role '{role}' not defined in "
                f"approver-registry.yaml role_assignments {sorted(approver_roles)}"
            )

    if problems:
        r.add(
            cat,
            "HITL-02",
            "FAIL",
            f"definitions/hitl/triggers/ issues: {problems} "
            "(please align the filled-in content with _schema.md §1 and approver-registry.yaml)",
        )
    elif filled:
        note = (
            f"; {len(unfilled)} template(s) still contain <<TODO>> (INFO)"
            if unfilled
            else ""
        )
        role_note = (
            "approver_role matched against the registry"
            if approver_roles is not None
            else "role matching skipped because approver-registry.yaml is not yet filled in"
        )
        r.add(
            cat,
            "HITL-02",
            "PASS",
            f"{len(filled)} filled trigger yaml OK "
            f"(required keys + {role_note}){note}",
        )
    else:
        r.add(
            cat,
            "HITL-02",
            "INFO",
            f"{len(unfilled)} trigger template(s) still contain <<TODO>> "
            "placeholders — fill it in to promote HITL-02 to a PASS/FAIL verdict "
            "(fill it in following the required keys in _schema.md §1)",
        )


# ============================================================
# Category: STRUCT-DEF — the shipped skeleton of definitions/
# ============================================================
def verify_struct_def(r: Report):
    cat = "STRUCT-DEF"
    defs = REPO_ROOT / "definitions"

    # Each subdirectory only needs a README.md or a .gitkeep to show it
    # "exists as shipped".
    def has_marker(d: Path):
        return d.is_dir() and ((d / "README.md").exists() or (d / ".gitkeep").exists())

    missing = []
    if not (defs / "README.md").exists():
        missing.append("definitions/README.md")
    for sub in (
        "ontology",
        "hitl",
        "hitl/triggers",
        "kpi",
        "cycles",
        "retro",
        "clients",
    ):
        if not has_marker(defs / sub):
            missing.append(f"definitions/{sub}/ (README.md or .gitkeep)")

    if missing:
        r.add(
            cat, "STRUCT-DEF-01", "FAIL", f"definitions/ skeleton incomplete: {missing}"
        )
    else:
        r.add(
            cat,
            "STRUCT-DEF-01",
            "PASS",
            "definitions/ skeleton present (README + 6 subdirs)",
        )


# ============================================================
# Category: STRUCT-DOC — docs/handover artefacts that should already exist as shipped
# ============================================================
def verify_struct_doc(r: Report):
    cat = "STRUCT-DOC"
    required = [
        "HANDOFF.md",
        "docs/decisions/README.md",
        "docs/retros/README.md",
        "docs/directory-map.md",
    ]
    missing = [p for p in required if not (REPO_ROOT / p).exists()]
    if missing:
        r.add(cat, "STRUCT-DOC-01", "FAIL", f"missing shipped docs: {missing}")
    else:
        r.add(cat, "STRUCT-DOC-01", "PASS", f"{len(required)} shipped doc(s) present")


# ============================================================
# Category: EXAMPLE — the health of the filled-in samples under examples/
# ============================================================
def verify_examples(r: Report):
    cat = "EXAMPLE"
    examples_dir = REPO_ROOT / "examples"

    if not examples_dir.exists():
        r.add(
            cat,
            "EXAMPLE-01",
            "INFO",
            "examples/ not found, skipping (no worked sample shipped)",
        )
        return

    yaml_files = sorted(examples_dir.rglob("*.yaml")) + sorted(
        examples_dir.rglob("*.yml")
    )
    if not yaml_files:
        r.add(cat, "EXAMPLE-01", "INFO", "no yaml files under examples/")
        return

    # EXAMPLE-01: every yaml must parse
    bad = []
    for f in yaml_files:
        _, err = load_yaml(f)
        if err:
            bad.append(f"{f.relative_to(REPO_ROOT)}: {err}")
    if bad:
        r.add(cat, "EXAMPLE-01", "FAIL", f"invalid yaml: {bad}")
    else:
        r.add(
            cat,
            "EXAMPLE-01",
            "PASS",
            f"{len(yaml_files)} example yaml file(s) parse OK",
        )

    # EXAMPLE-02: since this is a filled-in complete example, no <<TODO placeholder should remain
    leftover = []
    for f in yaml_files:
        try:
            if "<<TODO" in f.read_text(encoding="utf-8"):
                leftover.append(str(f.relative_to(REPO_ROOT)))
        except OSError:
            continue
    if leftover:
        r.add(
            cat,
            "EXAMPLE-02",
            "FAIL",
            f"unfilled <<TODO placeholder in worked example: {leftover}",
        )
    else:
        r.add(cat, "EXAMPLE-02", "PASS", "no <<TODO placeholder left in examples/")


def _verify_def_category(r: Report, cat: str, id_: str, subdir: str):
    """Only when a yaml is placed under definitions/<subdir>/, verify
    (a) it parses, (b) zero remaining <<TODO, and (c) the presence of a
    team_id or domain key. Unfilled (no yaml) is a normal state, so INFO/SKIP."""
    target = REPO_ROOT / "definitions" / subdir
    if not target.exists():
        r.add(
            cat,
            id_,
            "INFO",
            f"definitions/{subdir}/ not found — "
            f"add a yaml to promote {id_} to a PASS/FAIL verdict",
        )
        return

    yaml_files = sorted(target.glob("*.yaml")) + sorted(target.glob("*.yml"))
    if not yaml_files:
        r.add(
            cat,
            id_,
            "INFO",
            f"no yaml files under definitions/{subdir}/ — "
            f"add a yaml to promote {id_} to a PASS/FAIL verdict",
        )
        return

    problems = []
    for f in yaml_files:
        data, err = load_yaml(f)
        if err:
            problems.append(f"{f.name}: {err}")
            continue
        body = f.read_text(encoding="utf-8")
        # A mention of <<TODO written in a YAML comment (after #) is a false
        # positive, so it's excluded — only an unfilled placeholder still on
        # the value side is reported, with its line number.
        for ln_no, line in enumerate(body.splitlines(), start=1):
            if "<<TODO" in line.split("#", 1)[0]:
                problems.append(f"{f.name}:{ln_no}: unfilled <<TODO placeholder")
        if not (isinstance(data, dict) and ("team_id" in data or "domain" in data)):
            problems.append(f"{f.name}: missing 'team_id' or 'domain' key")

    if problems:
        r.add(cat, id_, "FAIL", f"definitions/{subdir}/ issues: {problems}")
    else:
        r.add(
            cat,
            id_,
            "PASS",
            f"{len(yaml_files)} yaml file(s) under definitions/{subdir}/ OK",
        )


def verify_definitions(r: Report):
    cat = "DEFINITIONS"
    _verify_def_category(r, cat, "DEF-KPI-01", "kpi")
    _verify_def_category(r, cat, "DEF-CYCLE-01", "cycles")
    _verify_def_category(r, cat, "DEF-RETRO-01", "retro")

    # DEF-CLIENT-01: if definitions/clients/<slug>/ exists, each slug should have a profile.yaml
    clients_dir = REPO_ROOT / "definitions" / "clients"
    if not clients_dir.exists():
        r.add(
            cat,
            "DEF-CLIENT-01",
            "INFO",
            "definitions/clients/ not found — "
            "create a client slug directory and add a profile.yaml etc. to "
            "promote DEF-CLIENT-01 to a PASS/FAIL verdict (an optional feature)",
        )
        return
    slugs = [
        d
        for d in sorted(clients_dir.iterdir())
        if d.is_dir() and not d.name.startswith(".")
    ]
    if not slugs:
        r.add(
            cat,
            "DEF-CLIENT-01",
            "INFO",
            "no client slug directory under definitions/clients/ — "
            "create a slug directory and add a profile.yaml etc. to "
            "promote DEF-CLIENT-01 to a PASS/FAIL verdict (an optional feature)",
        )
        return
    problems = []
    for slug in slugs:
        profile = slug / "profile.yaml"
        if not profile.exists():
            problems.append(f"{slug.name}/: missing profile.yaml")
            continue
        _, err = load_yaml(profile)
        if err:
            problems.append(f"{slug.name}/profile.yaml: {err}")
    if problems:
        r.add(cat, "DEF-CLIENT-01", "FAIL", f"client dir issues: {problems}")
    else:
        r.add(
            cat,
            "DEF-CLIENT-01",
            "PASS",
            f"{len(slugs)} client slug(s) each have a parseable profile.yaml",
        )


# ============================================================
# Category: STOCK — machine verification of the Obsidian-compatible
# conventions (the notes/ L2 description layer)
# ============================================================
# Implements the RQT candidates STOCK-01 through 05 proposed in
# docs/decisions/2026-07-03-obsidian-context-stock.md (Decision RFC, accepted)
# §6 (Phase C). Verifies mandatory frontmatter keys, wikilink resolution,
# inbox backlog, Obsidian syntax leaking into L1, and the freshness of market
# notes.
_FRONTMATTER_RE = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n", re.DOTALL)
_WIKILINK_RE = re.compile(r"(?<!!)\[\[([^\]|#^]+)")
_INLINE_CODE_RE = re.compile(r"`[^`]*`")  # STOCK-06: strips code spans (avoids false positives)
STOCK_L2_SHELF_DIRS = ("company", "market", "clients", "sops")
STOCK_LEGACY_DOC_DIRS = (
    "decisions",
    "retros",
)  # under docs/. Existing files are never retroactively edited
STOCK_REQUIRED_BASE = ("type", "status", "created", "updated", "tags")
STOCK_TYPE_EXTRA_REQUIRED = {
    "market": ("source", "observed_at"),
    "client-note": ("client",),
    "sop": ("team_id",),
}
STOCK_INBOX_STALE_DAYS = 7
STOCK_MARKET_STALE_DAYS = 90
STOCK_ALLOWED_TYPES = (
    "company-note",
    "market",
    "client-note",
    "sop",
    "inbox",
    "decision",
    "retro",
    "digest",
)


def _parse_frontmatter(path: Path):
    """Read an L2 note's frontmatter. Returns (data, err):
    - (dict, None): parsed successfully
    - (None, None): there is no frontmatter block (e.g. a legacy-format file)
    - (None, str): there is frontmatter, but it fails to parse or isn't a mapping
    """
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as e:
        return None, f"read error: {e}"
    m = _FRONTMATTER_RE.match(text)
    if not m:
        return None, None
    try:
        data = yaml.safe_load(m.group(1))
    except yaml.YAMLError as e:
        return None, f"frontmatter yaml parse error: {e}"
    if not isinstance(data, dict):
        return None, "frontmatter top-level is not a mapping"
    return data, None


def _git_file_last_commit_ts(path: Path):
    """The timestamp (epoch seconds) of path's most recent commit. None if it
    isn't tracked by git or hasn't been committed (the caller falls back to mtime)."""
    try:
        res = subprocess.run(
            [
                "git",
                "log",
                "-1",
                "--format=%ct",
                "--",
                str(path.relative_to(REPO_ROOT)),
            ],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=15,
        )
    except (subprocess.SubprocessError, OSError):
        return None
    out = res.stdout.strip()
    if res.returncode != 0 or not out:
        return None
    try:
        return int(out)
    except ValueError:
        return None


def verify_stock(r: Report):
    cat = "STOCK"
    notes_dir = REPO_ROOT / "notes"

    notes_files = []
    for sub in STOCK_L2_SHELF_DIRS:
        d = notes_dir / sub
        if d.exists():
            notes_files += [f for f in sorted(d.rglob("*.md")) if f.name != "README.md"]

    legacy_files = []
    for sub in STOCK_LEGACY_DOC_DIRS:
        d = REPO_ROOT / "docs" / sub
        if d.exists():
            legacy_files += [f for f in sorted(d.glob("*.md")) if f.name != "README.md"]

    # --- STOCK-01: mandatory frontmatter keys (per type) ---
    if not notes_files and not legacy_files:
        r.add(
            cat,
            "STOCK-01",
            "INFO",
            "no L2 notes under notes/{company,market,clients,sops}/ or "
            "docs/{decisions,retros}/ — create a note to promote STOCK-01 to a PASS/FAIL verdict",
        )
    else:
        problems, checked = [], 0

        def _check_required_keys(f: Path, data: dict):
            missing = [k for k in STOCK_REQUIRED_BASE if k not in data]
            missing += [
                k
                for k in STOCK_TYPE_EXTRA_REQUIRED.get(data.get("type"), ())
                if k not in data
            ]
            if missing:
                problems.append(
                    f"{f.relative_to(REPO_ROOT)}: missing frontmatter key(s) {missing}"
                )
            t = data.get("type")
            if t is not None and t not in STOCK_ALLOWED_TYPES:
                problems.append(
                    f"{f.relative_to(REPO_ROOT)}: unknown type '{t}' "
                    f"(allowed: {', '.join(STOCK_ALLOWED_TYPES)})"
                )

        for f in notes_files:
            data, err = _parse_frontmatter(f)
            if err:
                problems.append(f"{f.relative_to(REPO_ROOT)}: {err}")
            elif data is None:
                problems.append(
                    f"{f.relative_to(REPO_ROOT)}: missing frontmatter "
                    "(required for notes/, see .claude/rules/notes-touch.md)"
                )
            else:
                checked += 1
                _check_required_keys(f, data)
        for f in legacy_files:
            data, err = _parse_frontmatter(f)
            if err:
                problems.append(f"{f.relative_to(REPO_ROOT)}: {err}")
                continue
            if data is None or "type" not in data:
                continue  # out of scope — pre-Phase-A existing files are never retroactively edited
            checked += 1
            _check_required_keys(f, data)

        if problems:
            r.add(cat, "STOCK-01", "FAIL", f"L2 frontmatter issues: {problems}")
        elif checked:
            r.add(
                cat,
                "STOCK-01",
                "PASS",
                f"{checked} L2 note(s) have required frontmatter keys",
            )
        else:
            r.add(
                cat,
                "STOCK-01",
                "SKIP",
                "no L2 note applies the extended frontmatter schema yet (legacy-only)",
            )

    # --- STOCK-02: wikilink resolvability (notes/ only, root-relative or a unique filename) ---
    if not notes_files:
        r.add(cat, "STOCK-02", "INFO", "no notes/ files to scan for wikilinks")
    else:
        by_stem = {}
        for f in notes_files:
            by_stem.setdefault(f.stem, []).append(f)
        link_problems, link_checked = [], 0
        for f in notes_files:
            try:
                text = f.read_text(encoding="utf-8")
            except OSError:
                continue
            for m in _WIKILINK_RE.finditer(text):
                target = m.group(1).strip()
                if not target:
                    continue
                link_checked += 1
                rel = f.relative_to(REPO_ROOT)
                if "/" in target:
                    candidate = target if target.endswith(".md") else f"{target}.md"
                    if not (REPO_ROOT / candidate).exists():
                        link_problems.append(
                            f"{rel}: [[{target}]] unresolved (path not found)"
                        )
                else:
                    matches = by_stem.get(target, [])
                    if not matches:
                        link_problems.append(
                            f"{rel}: [[{target}]] unresolved (no matching file)"
                        )
                    elif len(matches) > 1:
                        link_problems.append(
                            f"{rel}: [[{target}]] ambiguous ({len(matches)} files match)"
                        )
        if link_problems:
            r.add(cat, "STOCK-02", "WARN", f"wikilink issues: {link_problems}")
        elif link_checked:
            r.add(cat, "STOCK-02", "PASS", f"{link_checked} wikilink(s) resolve OK")
        else:
            r.add(cat, "STOCK-02", "PASS", "no wikilinks found")

    # --- STOCK-03: notes/inbox/ backlog (older than 7 days) ---
    inbox_dir = notes_dir / "inbox"
    if not inbox_dir.exists():
        r.add(cat, "STOCK-03", "INFO", "notes/inbox/ not found")
    else:
        inbox_files = [
            f for f in sorted(inbox_dir.glob("*.md")) if f.name != "README.md"
        ]
        if not inbox_files:
            r.add(cat, "STOCK-03", "PASS", "notes/inbox/ has no unprocessed notes")
        else:
            cutoff = datetime.now(timezone.utc) - timedelta(days=STOCK_INBOX_STALE_DAYS)
            stale = []
            for f in inbox_files:
                ts = _git_file_last_commit_ts(f)
                if ts is None:
                    ts = int(f.stat().st_mtime)
                committed_at = datetime.fromtimestamp(ts, tz=timezone.utc)
                if committed_at < cutoff:
                    stale.append(f"{f.relative_to(REPO_ROOT)} ({committed_at.date()})")
            if stale:
                r.add(
                    cat,
                    "STOCK-03",
                    "WARN",
                    f"{len(stale)}/{len(inbox_files)} inbox note(s) stale "
                    f"(>{STOCK_INBOX_STALE_DAYS} days, /ingest-context inbox recommended): {stale}",
                )
            else:
                r.add(
                    cat,
                    "STOCK-03",
                    "PASS",
                    f"{len(inbox_files)} inbox note(s), none stale (>{STOCK_INBOX_STALE_DAYS} days)",
                )

    # --- STOCK-04: Obsidian syntax leaking into definitions/ (L1) ---
    definitions_dir = REPO_ROOT / "definitions"
    if not definitions_dir.exists():
        r.add(cat, "STOCK-04", "INFO", "definitions/ not found")
    else:
        yaml_files = sorted(definitions_dir.rglob("*.yaml")) + sorted(
            definitions_dir.rglob("*.yml")
        )
        if not yaml_files:
            r.add(cat, "STOCK-04", "INFO", "no yaml files under definitions/")
        else:
            pollution = []
            for f in yaml_files:
                try:
                    text = f.read_text(encoding="utf-8")
                except OSError:
                    continue
                if "[[" in text or "![[" in text or "```dataview" in text:
                    pollution.append(str(f.relative_to(REPO_ROOT)))
            if pollution:
                r.add(
                    cat,
                    "STOCK-04",
                    "FAIL",
                    "Obsidian syntax found in L1 yaml (forbidden, cf. "
                    f".claude/rules/notes-touch.md LINK-3): {pollution}",
                )
            else:
                r.add(
                    cat,
                    "STOCK-04",
                    "PASS",
                    f"{len(yaml_files)} definitions/ yaml file(s) free of Obsidian syntax",
                )

    # --- STOCK-05: freshness of notes/market/ (observed_at older than 90 days) ---
    market_dir = notes_dir / "market"
    if not market_dir.exists():
        r.add(cat, "STOCK-05", "INFO", "notes/market/ not found")
    else:
        market_files = [
            f for f in sorted(market_dir.glob("*.md")) if f.name != "README.md"
        ]
        if not market_files:
            r.add(cat, "STOCK-05", "INFO", "no market notes found")
        else:
            today = datetime.now(timezone.utc).date()
            stale = []
            for f in market_files:
                data, err = _parse_frontmatter(f)
                if err or not isinstance(data, dict):
                    continue
                observed = data.get("observed_at")
                if not observed:
                    continue
                if isinstance(observed, date):
                    observed_date = observed
                else:
                    try:
                        observed_date = datetime.strptime(
                            str(observed), "%Y-%m-%d"
                        ).date()
                    except ValueError:
                        continue
                age = (today - observed_date).days
                if age > STOCK_MARKET_STALE_DAYS:
                    stale.append(
                        f"{f.relative_to(REPO_ROOT)} (observed_at {observed_date}, {age} days elapsed)"
                    )
            if stale:
                r.add(
                    cat,
                    "STOCK-05",
                    "INFO",
                    f"market note(s) with observed_at > {STOCK_MARKET_STALE_DAYS} days: {stale}",
                )
            else:
                r.add(
                    cat,
                    "STOCK-05",
                    "INFO",
                    f"{len(market_files)} market note(s), all observed_at within "
                    f"{STOCK_MARKET_STALE_DAYS} days (or unset)",
                )

    # --- STOCK-06: check for Obsidian app-dependent syntax (embed / Dataview /
    # Bases) leaking into L2 ---
    # Scans notes/ L2 only. docs/decisions and docs/retros are out of scope
    # (the Decision RFC itself explains the ![[...]] syntax in its body, which
    # would be a false positive — see RFC SYNTAX-1).
    scan_files = list(notes_files)
    inbox_l2 = notes_dir / "inbox"
    if inbox_l2.exists():
        scan_files += [
            f for f in sorted(inbox_l2.glob("*.md")) if f.name != "README.md"
        ]
    if not notes_dir.exists() or not scan_files:
        r.add(
            cat, "STOCK-06", "INFO", "no notes/ L2 files to scan for forbidden syntax"
        )
    else:
        violations = []
        for f in scan_files:
            try:
                text = f.read_text(encoding="utf-8")
            except OSError:
                continue
            hits = set()
            for line in text.splitlines():
                stripped = line.lstrip()
                if stripped.startswith("```dataview") or stripped.startswith("```base"):
                    hits.add("dataview/base fence")
                if "![[" in _INLINE_CODE_RE.sub("", line):  # match after stripping code spans
                    hits.add("embed ![[")
            if hits:
                violations.append(f"{f.relative_to(REPO_ROOT)} {sorted(hits)}")
        if violations:
            r.add(
                cat,
                "STOCK-06",
                "FAIL",
                "forbidden Obsidian app-dependent syntax in L2 notes (RFC SYNTAX-1, "
                "docs/decisions/2026-07-03-obsidian-context-stock.md §6 / "
                f".claude/rules/notes-touch.md §5): {violations}",
            )
        else:
            r.add(
                cat,
                "STOCK-06",
                "PASS",
                f"{len(scan_files)} L2 note(s) free of embed/Dataview/Bases syntax",
            )


# ============================================================
# Category: GEN — the generalisation gate (detects residual traces of a
# retired domain term)
# ============================================================
def verify_gen(r: Report):
    """GEN-01: verifies that no residual trace remains in the repository of the
    old domain term (a 3-letter abbreviation) retired during Phase E's
    generalisation into a generic template, and structurally prevents it
    creeping back in.
    Excluded: .git / .github/workflows/verify.yml / .gitignore (both
    deliberately contain the term as a defensive detection pattern). Only
    git-tracked files are in scope; case is ignored.

    Implementation note: the search term is assembled from parts rather than
    written as a literal in the source. GEN-01's grep gate requires zero hits
    without excluding verify.py itself, so this is what stops this file
    self-matching on its own search term (the same idea as HYGIENE-01's
    self-reference guard)."""
    cat = "GEN"

    if not (REPO_ROOT / ".git").exists():
        r.add(cat, "GEN-01", "SKIP", "not a git repository, skipping residual scan")
        return

    needle = "f" + "d" + "a"

    try:
        grep = subprocess.run(
            [
                "git",
                "grep",
                "-n",
                "-I",
                "-i",
                needle,
                "--",
                ".",
                ":(exclude).github/workflows/verify.yml",
                ":(exclude).gitignore",
            ],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (subprocess.SubprocessError, OSError) as e:
        r.add(cat, "GEN-01", "SKIP", f"git grep unavailable: {e}")
        return

    if grep.returncode not in (0, 1):
        r.add(cat, "GEN-01", "SKIP", f"git grep failed: {grep.stderr.strip()}")
        return

    hits = [line for line in grep.stdout.splitlines() if line.strip()]
    if hits:
        r.add(
            cat,
            "GEN-01",
            "FAIL",
            f"retired domain term residual found ({len(hits)}): {hits[:5]}{'...' if len(hits) > 5 else ''}",
        )
    else:
        r.add(
            cat,
            "GEN-01",
            "PASS",
            "no retired domain term residual outside verify.yml / .gitignore",
        )


# ============================================================
# Category: META — measuring adherence to Issue-First / commit conventions
# ============================================================
# The first meta-KPI (Issue #45), measuring the Issue-reference rate and
# Conventional Commits compliance rate of recent commits. issue-first.md §7
# explicitly allows filing after the fact and an offline fallback, so gating
# this with FAIL would flag legitimate practice as red. So it falls to WARN
# (non-blocking, doesn't affect the exit code) — the first real use of the
# WARN status that was already defined on the Report class.
META_SAMPLE_SIZE = 20  # how many recent non-merge commits to sample
META_MIN_SAMPLE = 5  # below this, treat it as too soon after unpacking and fall to INFO
# 0.8: a loose initial value that allows the after-the-fact filing and
# exceptions permitted by issue-first.md §7, while still catching outright
# neglect (never filing at all). Raise the threshold to match your own
# company's practice (see the design comment at the top of this file:
# participants grow verify_*() over time).
META_ISSUE_REF_THRESHOLD = 0.8
META_CONVENTIONAL_THRESHOLD = 0.8
# Reuses scope-contract.md §3's 500-line "consider splitting" guideline for a
# Feature (single concern) as one loose initial value covering docs/tests too
# (tighten it for your own company).
META_BIG_COMMIT_LINES = 500
META_BIG_COMMIT_RATIO = 0.3
_ISSUE_REF_RE = re.compile(r"#[0-9]+")
# Follows the same type list and pattern as
# .claude/hooks/commit-msg-advisor.sh (to avoid drift, the Conventional
# Commits check logic is not implemented separately in two places).
_CONVENTIONAL_RE = re.compile(
    r"^(feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert)"
    r"(\([a-z0-9-]+\))?: .+"
)
_SHORTSTAT_RE = re.compile(
    r"\d+ files? changed"
    r"(?:, (\d+) insertions?\(\+\))?"
    r"(?:, (\d+) deletions?\(-\))?"
)


def _parse_commit_stats(text):
    """Parse the output of `git log --format=%h%x1f%s --shortstat` into
    [(hash, subject, changed_lines), ...] (META-03). The shortstat line only
    ever appears right after a blank line, and never for a commit with no diff
    (e.g. --allow-empty), which is treated as 0 lines changed."""
    stats = []
    lines = text.splitlines()
    n = len(lines)
    i = 0
    while i < n:
        if "\x1f" not in lines[i]:
            i += 1
            continue
        h, _, subject = lines[i].partition("\x1f")
        i += 1
        changed = 0
        if i < n and lines[i] == "" and i + 1 < n:
            m = _SHORTSTAT_RE.search(lines[i + 1])
            if m:
                changed = int(m.group(1) or 0) + int(m.group(2) or 0)
                i += 2
        stats.append((h, subject, changed))
    return stats


def _median(values):
    if not values:
        return 0
    s = sorted(values)
    mid = len(s) // 2
    return s[mid] if len(s) % 2 else (s[mid - 1] + s[mid]) / 2


def verify_meta(r: Report):
    """META-01/02: measures adherence to Issue-First (issue-first.md §5) and
    Conventional Commits (same §5) from recent commit history; META-03:
    adherence to the diff budget in scope-contract.md §3.

    In the spirit of no-fake-green this surfaces "hidden non-compliance", but
    since issue-first.md §7 and scope-contract.md §5 both explicitly allow for
    exceptions, adherence itself is never gated with FAIL (WARN = a
    non-blocking indicator).
    """
    cat = "META"

    if not (REPO_ROOT / ".git").exists():
        r.add(cat, "META-01", "SKIP", "not a git repository, skipping commit metrics")
        r.add(cat, "META-02", "SKIP", "not a git repository, skipping commit metrics")
        r.add(cat, "META-03", "SKIP", "not a git repository, skipping commit metrics")
        return

    try:
        log = subprocess.run(
            [
                "git",
                "log",
                "--no-merges",
                f"-n{META_SAMPLE_SIZE}",
                "--format=%s%x1f%b%x1e",
            ],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (subprocess.SubprocessError, OSError) as e:
        r.add(cat, "META-01", "SKIP", f"git log unavailable: {e}")
        r.add(cat, "META-02", "SKIP", f"git log unavailable: {e}")
        r.add(cat, "META-03", "SKIP", f"git log unavailable: {e}")
        return

    if log.returncode != 0:
        r.add(cat, "META-01", "SKIP", f"git log failed: {log.stderr.strip()}")
        r.add(cat, "META-02", "SKIP", f"git log failed: {log.stderr.strip()}")
        r.add(cat, "META-03", "SKIP", f"git log failed: {log.stderr.strip()}")
        return

    commits = []  # [(subject, body), ...]
    for chunk in log.stdout.split("\x1e"):
        chunk = chunk.strip("\n")
        if not chunk:
            continue
        subject, _, body = chunk.partition("\x1f")
        commits.append((subject, body))

    total = len(commits)
    if total < META_MIN_SAMPLE:
        msg = (
            f"only {total} commit(s) found — too soon after unpacking for a real sample. "
            f"Once there are {META_MIN_SAMPLE}+ commits this is promoted to a PASS/WARN verdict"
        )
        r.add(cat, "META-01", "INFO", msg)
        r.add(cat, "META-02", "INFO", msg)
        r.add(cat, "META-03", "INFO", msg)
        return

    # META-01: the Issue-reference rate (checks subject + body, for #N or "issue pending")
    referenced, unreferenced = [], []
    for subject, body in commits:
        combined = subject + "\n" + body
        if _ISSUE_REF_RE.search(combined) or "issue pending" in combined:
            referenced.append(subject)
        else:
            unreferenced.append(subject)
    issue_ref_rate = len(referenced) / total
    if issue_ref_rate >= META_ISSUE_REF_THRESHOLD:
        r.add(
            cat,
            "META-01",
            "PASS",
            f"issue-ref rate {len(referenced)}/{total} ({issue_ref_rate:.0%})",
        )
    else:
        r.add(
            cat,
            "META-01",
            "WARN",
            f"issue-ref rate {len(referenced)}/{total} ({issue_ref_rate:.0%}) "
            f"< {META_ISSUE_REF_THRESHOLD:.0%} — offenders: {unreferenced[:3]}",
        )

    # META-02: the Conventional Commits compliance rate (checks subject only)
    conventional, non_conventional = [], []
    for subject, _ in commits:
        if _CONVENTIONAL_RE.match(subject):
            conventional.append(subject)
        else:
            non_conventional.append(subject)
    conventional_rate = len(conventional) / total
    if conventional_rate >= META_CONVENTIONAL_THRESHOLD:
        r.add(
            cat,
            "META-02",
            "PASS",
            f"conventional-commit rate {len(conventional)}/{total} "
            f"({conventional_rate:.0%})",
        )
    else:
        r.add(
            cat,
            "META-02",
            "WARN",
            f"conventional-commit rate {len(conventional)}/{total} "
            f"({conventional_rate:.0%}) < {META_CONVENTIONAL_THRESHOLD:.0%} — "
            f"offenders: {non_conventional[:3]}",
        )

    # META-03: diff size per commit (self-measures the diff budget from scope-contract.md §3)
    try:
        stat_log = subprocess.run(
            [
                "git",
                "log",
                "--no-merges",
                f"-n{META_SAMPLE_SIZE}",
                "--format=%h%x1f%s",
                "--shortstat",
            ],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (subprocess.SubprocessError, OSError) as e:
        r.add(cat, "META-03", "SKIP", f"git log unavailable: {e}")
        return
    if stat_log.returncode != 0:
        r.add(cat, "META-03", "SKIP", f"git log failed: {stat_log.stderr.strip()}")
        return

    stats = _parse_commit_stats(stat_log.stdout)
    sizes = [c for _, _, c in stats]
    big = [(h, s, c) for h, s, c in stats if c > META_BIG_COMMIT_LINES]
    big_ratio = len(big) / len(stats) if stats else 0.0
    if big_ratio > META_BIG_COMMIT_RATIO:
        offenders = [f"{h} {s} ({c} lines)" for h, s, c in big]
        r.add(
            cat,
            "META-03",
            "WARN",
            f"big-commit ratio {len(big)}/{len(stats)} ({big_ratio:.0%}) "
            f"> {META_BIG_COMMIT_RATIO:.0%} (>{META_BIG_COMMIT_LINES} lines/commit) — "
            f"offenders: {offenders[:3]}",
        )
    else:
        r.add(
            cat,
            "META-03",
            "PASS",
            f"diff-size median {_median(sizes):g} / max {max(sizes, default=0)} lines "
            f"(big commits {len(big)}/{len(stats)})",
        )


# ============================================================
# Category: CONTEXT — the resident context budget (the total byte size of
# CLAUDE.md + its `@` imports)
# ============================================================
# An initial value of WARN at +20% headroom over the measured ~30.6KB
# (Japanese UTF-8 is roughly 3 bytes/character, ~8-12k tokens), and FAIL at
# about 1.8x that. Tighten the budget for your own company (see the design
# comment at the top of this file: participants grow verify_*() over time).
CONTEXT_WARN_BYTES = 36_000
CONTEXT_FAIL_BYTES = 56_000
# The "Rule imports" section is entirely lines of the form @+path, e.g.
# `@.claude/rules/scope-contract.md`. There is a residual risk of misreading a
# line that's just an email-like @token, but this is left deliberately as-is
# to keep the contract simple (`^@\S+$` on stripped lines is this check's contract).
_IMPORT_RE = re.compile(r"^@(\S+)$")


def verify_context(r: Report):
    """CONTEXT-01: the resident context budget (the total byte size of
    CLAUDE.md's body + its `@` import targets).

    An RQT that self-measures the "necessary-only" philosophy of
    docs/concepts/context-funnel.md. A broken import (`@path` pointing at
    nothing) means "a rule that never loads" — a silent harness failure — so
    it's FAILed at the same level as exceeding the budget. PATHREF-01 only
    looks at backtick-wrapped repo-relative path references (the `@import`
    syntax at the start of a line is never backtick-wrapped in the first
    place), so CONTEXT-01 is the only place a broken import is detected
    mechanically.
    """
    cat = "CONTEXT"
    claude_md = REPO_ROOT / "CLAUDE.md"
    if not claude_md.exists():
        r.add(cat, "CONTEXT-01", "INFO", "CLAUDE.md not found, skipping budget check")
        return

    imports = []
    for line in claude_md.read_text(encoding="utf-8").splitlines():
        m = _IMPORT_RE.match(line.strip())
        if m:
            imports.append(m.group(1))

    broken = [p for p in imports if not (REPO_ROOT / p).exists()]
    if broken:
        r.add(
            cat,
            "CONTEXT-01",
            "FAIL",
            f"broken import(s) in CLAUDE.md (rule silently not loaded): {broken}",
        )
        return

    total = claude_md.stat().st_size + sum(
        (REPO_ROOT / p).stat().st_size for p in imports
    )
    note = f"CLAUDE.md + {len(imports)} imports"
    if total < CONTEXT_WARN_BYTES:
        status, verdict = "PASS", f"within budget {CONTEXT_WARN_BYTES:,}"
    elif total < CONTEXT_FAIL_BYTES:
        status = "WARN"
        verdict = (
            f"exceeds budget {CONTEXT_WARN_BYTES:,} — there's room to push detail out "
            "into docs/ (cf. CLAUDE.md §4/§4.5)"
        )
    else:
        status, verdict = "FAIL", f"far exceeds budget {CONTEXT_FAIL_BYTES:,}"
    r.add(
        cat,
        "CONTEXT-01",
        status,
        f"persistent context {total:,} bytes ({note}) {verdict}",
    )


# ============================================================
# Category: PATHREF — verifies that repo-relative path references inside
# documents actually exist
# ============================================================
# Scoped to a limited target set: extracts backtick-wrapped repo-relative
# paths (starting with one of the prefixes below) and verifies they exist.
# Placeholders (<...> / {...}), globs (*), and a whitelist of generated
# artefacts are skipped, keeping this a conservative implementation that
# doesn't false-positive. A structural fix to prevent recurrence
# (PLAN-PHASE-E F-08 / Wave 2).
PATHREF_PREFIXES = (
    "definitions/",
    "docs/",
    "scripts/",
    "examples/",
    "state/",
    "secrets/",
    ".claude/",
)
# Generated artefacts (created later by a command/script) — not existing yet doesn't FAIL.
PATHREF_GENERATED_PREFIXES = (
    "docs/decisions/",
    "docs/retros/",
    "state/",
    "definitions/.staging/",
)
PATHREF_GENERATED_EXACT = {"definitions/ontology/company.yaml"}
_BACKTICK_RE = re.compile(r"`([^`]+)`")
# A ``` fenced code block desyncs backtick pairing and silently drops
# subsequent inline-code references from the check, so it must always be
# stripped before extraction (a tree diagram or command example inside a
# fence isn't a "single real path reference" anyway, so excluding it is correct).
_FENCE_RE = re.compile(r"```.*?```", re.DOTALL)


def verify_pathref(r: Report):
    cat = "PATHREF"
    targets = [
        REPO_ROOT / "CLAUDE.md",
        REPO_ROOT / "docs" / "directory-map.md",
        REPO_ROOT / "docs" / "setup-walkthrough.md",
        REPO_ROOT / "docs" / "starter-manual.md",
        REPO_ROOT / "HANDOFF.md",
    ]
    targets += sorted((REPO_ROOT / ".claude" / "commands").glob("*.md"))
    targets += sorted((REPO_ROOT / "docs" / "templates").glob("*.md"))
    targets += sorted((REPO_ROOT / "docs" / "concepts").glob("*.md"))

    unresolved = []
    checked = 0
    for tf in targets:
        if not tf.exists():
            continue
        text = _FENCE_RE.sub("", tf.read_text(encoding="utf-8"))
        for m in _BACKTICK_RE.finditer(text):
            token = m.group(1).strip()
            if not token.startswith(PATHREF_PREFIXES):
                continue
            # skip placeholder / glob / multi-token — not a "single real path"
            if any(c in token for c in "<>{}*") or " " in token:
                continue
            # skip the generated-artefact whitelist
            if token in PATHREF_GENERATED_EXACT:
                continue
            if token.startswith(PATHREF_GENERATED_PREFIXES):
                continue
            checked += 1
            if not (REPO_ROOT / token).exists():
                unresolved.append(f"{tf.relative_to(REPO_ROOT)}: `{token}`")

    if unresolved:
        r.add(
            cat,
            "PATHREF-01",
            "FAIL",
            f"unresolved repo path reference(s): {sorted(set(unresolved))}",
        )
    else:
        r.add(
            cat,
            "PATHREF-01",
            "PASS",
            f"{checked} repo path reference(s) all resolve "
            "(placeholders / globs / generated output skipped)",
        )


def main():
    parser = argparse.ArgumentParser(
        description="RQT verify for the company-starter template"
    )
    parser.add_argument(
        "--json", action="store_true", help="Output JSON instead of text"
    )
    args = parser.parse_args()

    r = Report()

    verify_structure(r)
    verify_harness(r)
    verify_hygiene(r)
    verify_ontology(r)
    verify_hitl(r)
    verify_struct_def(r)
    verify_struct_doc(r)
    verify_examples(r)
    verify_definitions(r)
    verify_stock(r)
    verify_gen(r)
    verify_meta(r)
    verify_context(r)
    verify_pathref(r)

    if args.json:
        print(json.dumps(r.as_dict(), ensure_ascii=False, indent=2))
    else:
        print("RQT verify — running...\n")
        for cat, items in r.by_category().items():
            print(f"## {cat}")
            for id_, st, msg in items:
                mark = {
                    "PASS": "✓",
                    "WARN": "!",
                    "FAIL": "✗",
                    "SKIP": "-",
                    "INFO": "i",
                }[st]
                print(f"  [{mark}] {id_:16s} {st:5s}  {msg}")
            print()

        passed, warned, failed, skipped, total = r.summary()
        print("========================================")
        print(
            f"Total: {total}  PASS: {passed}  WARN: {warned}  "
            f"FAIL: {failed}  SKIP/INFO: {skipped}"
        )
        print("========================================")

    return 0 if r.passed() else 1


if __name__ == "__main__":
    sys.exit(main())

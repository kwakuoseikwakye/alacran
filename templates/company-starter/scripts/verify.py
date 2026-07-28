#!/usr/bin/env python3
"""
AI 駆動経営合宿スターターテンプレの RQT (Requirements Traceability) 検証機構。

本 script は最小限の base RQT のみを持つ。参加者は自社向けの RQT を
verify_*() 関数として追加してよい（追加時は main() の呼び出しリストにも
追記すること）。

対象が存在しない RQT は FAIL ではなく SKIP（INFO ログ付き）として扱う。
これはテンプレ配布直後にいきなり赤字だらけにしないための設計判断で、
参加者がハーネスを段階的に育てていくことを前提にしている。

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
    """PASS/WARN/FAIL/INFO を category 別に積み上げる薄いコンテナ。"""

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
# Category: STRUCTURE — 最低限のリポジトリ骨格
# ============================================================
def verify_structure(r: Report):
    cat = "STRUCTURE"

    # STRUCTURE-01: LICENSE.md
    if (REPO_ROOT / "LICENSE.md").exists():
        r.add(cat, "STRUCTURE-01", "PASS", "LICENSE.md exists")
    else:
        r.add(cat, "STRUCTURE-01", "FAIL", "LICENSE.md not found")

    # STRUCTURE-02: .gitignore が secrets/ と .env を「実効的に」遮断しているか。
    # 部分文字列一致 ("secrets/" in body) だと secrets/** をコメントアウト
    # (# secrets/**) しても否定行 (!secrets/**/) に文字列が残り PASS のまま
    # という fake-green になる。そのため有効パターン行（コメント # / 空行 /
    # 否定 ! を除いた行）で判定し、.git があれば git check-ignore による実効
    # 確認も併用する（.git 無し環境では静的判定にフォールバック）。
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
        # 静的判定が通った場合のみ git check-ignore で実効確認（裏取り）
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
                    continue  # git 不在等は静的判定にフォールバック
                if ci.returncode == 1:  # 1 = not ignored（遮断できていない）
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
# Category: HARNESS — .claude/settings.json の hooks 配線検証
# ============================================================
def _resolve_project_dir_vars(cmd: str) -> str:
    """$CLAUDE_PROJECT_DIR / ${CLAUDE_PROJECT_DIR} を REPO_ROOT に解決する。"""
    resolved = cmd.replace("${CLAUDE_PROJECT_DIR}", str(REPO_ROOT))
    return resolved.replace("$CLAUDE_PROJECT_DIR", str(REPO_ROOT))


def _iter_hook_commands(settings: dict):
    """settings["hooks"]（event -> [{"matcher":..., "hooks":[{"type":"command",
    "command":...}]}]）を走査し、command 文字列を列挙する。"""
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
    """HARNESS-01/02: .claude/settings.json の hooks 配線が「発火する状態」であることを検証する。

    CLAUDE.md §6 の最頻出の詰まりどころ（hooks が発火しない: 実行権限 / 入力契約）を
    RQT として構造化したもの。この検証機構は settings.json を読むだけで書き換えない
    （配線の変更自体は別 concern）。
    """
    cat = "HARNESS"
    settings_path = REPO_ROOT / ".claude" / "settings.json"

    if not settings_path.exists():
        r.add(
            cat,
            "HARNESS-01",
            "INFO",
            f"{settings_path.relative_to(REPO_ROOT)} not found — "
            "配置すると HARNESS-01 が PASS/FAIL 判定に昇格します",
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

    # HARNESS-01: 静的検証（存在 / 実行権限 / shebang）
    problems = []
    bad_cmds = set()
    runnable = []  # [(command_str, resolved_path), ...]
    for cmd in commands:
        resolved_cmd = _resolve_project_dir_vars(cmd)
        tokens = resolved_cmd.split()
        path_token = tokens[0] if tokens else resolved_cmd
        p = Path(path_token)
        if not p.is_absolute() or not str(p).startswith(str(REPO_ROOT)):
            continue  # repo 外（PATH 上のコマンド等）は対象外
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

    # HARNESS-02: hook スモークテスト（動的検証）。
    #
    # hook スクリプトはハードコードせず settings.json から動的に発見する
    # （runnable は HARNESS-01 の走査結果）。これにより参加者が後から追加した
    # hook も自動的にカバー対象になる。
    #
    # サンプル入力は Bash-matcher / Edit・Write-matcher の両方を 1 発で
    # カバーできるよう合成する: "git status" は git-ops-validator.sh の
    # blocking/advisory どちらの分岐にも該当しない安全なコマンドで、
    # file_path はわざと存在しないパスにして format-check.sh が
    # 副作用なく exit 0 で抜けるようにしている。
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
            continue  # HARNESS-01 で既に報告済み、二重報告を避ける
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
# Category: HYGIENE — コード衛生
# ============================================================
def verify_hygiene(r: Report):
    cat = "HYGIENE"

    # HYGIENE-01: TODO(temp) マーカーが 30 日を超えて放置されていないか
    # ベストエフォート: git blame が使えない環境（.git 無し等）では SKIP する
    if not (REPO_ROOT / ".git").exists():
        r.add(
            cat, "HYGIENE-01", "SKIP", "not a git repository, skipping git-blame check"
        )
        return

    # RQT 機構自身 (verify.py) と、TODO(temp) パターンを説明する doc は自己参照ヒット
    # の time-bomb になるため除外する。参加者は自社コードのみを検査対象にしたい。
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
# Category: ONTOLOGY — definitions/ontology/ の YAML 構文
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
            "yaml を配置すると ONTOLOGY-01 が PASS/FAIL 判定に昇格します "
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
            "yaml を配置すると ONTOLOGY-01 が PASS/FAIL 判定に昇格します "
            "(cf. docs/templates/ontology-starter.yaml)",
        )
        return

    # parse に加え、最低限のスキーマを検査する。分割ファイル運用（customer.yaml
    # 等）を考慮し、各 yaml の top-level が mapping で customer / org / product の
    # いずれか 1 つ以上を持てば OK とする（cf. docs/templates/ontology-starter.yaml）。
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
# Category: HITL — HITL Gate トリガー定義
# ============================================================
def _load_approver_roles():
    """definitions/hitl/approver-registry.yaml の role_assignments キー集合を返す。

    ファイル不在 / 未記入（値側に <<TODO 残存）/ parse 不能 / role_assignments 不在の
    いずれかなら None を返し、呼び出し側は approver_role の照合をスキップする（INFO 側に倒す）。
    未記入のレジストリに対して trigger の役割を FAIL 扱いにすると、記入順序を強制して
    しまい偽陰性の元になるため、照合はレジストリが記入済みのときだけ有効化する。"""
    reg = REPO_ROOT / "definitions" / "hitl" / "approver-registry.yaml"
    if not reg.exists():
        return None
    body = reg.read_text(encoding="utf-8")
    # 値側（YAML コメント # 以降を除く）に <<TODO が残るレジストリは未記入とみなす。
    if any("<<TODO" in line.split("#", 1)[0] for line in body.splitlines()):
        return None
    data, err = load_yaml(reg)
    if err or not isinstance(data, dict):
        return None
    roles = data.get("role_assignments")
    if not isinstance(roles, dict) or not roles:
        return None
    return set(roles.keys())


# Issue #50: HITL-01 の fake-green 修正。
# 旧実装は body 中に "|" と "---" が 1 個でもあれば PASS していたため、
# トリガー表を丸ごと削除しても「散在する | と thematic-break の --- 行」だけで
# 誤って PASS していた（hitl-gate.md は両者を大量に含む）。本物の Markdown 表
# ＝ ヘッダ行 + 区切り行 + 1 行以上のデータ行 が隣接して存在することを行単位で検出する。
#   header: パイプの左右に文字を持つ（2 セル以上）行
#   divider: | --- | --- | / |---|---| 系（区切りセルが 2 個以上、alignment colon 可）
_MD_TABLE_HEADER_RE = re.compile(r"\S\s*\|\s*\S")
_MD_TABLE_DIVIDER_RE = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$")


def _count_md_table_rows(body: str) -> int:
    """本物の Markdown 表を検出し、最初に見つかった表のデータ行数を返す（無ければ 0）。"""
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
    # トリガーテーブルの存在判定: 本物の Markdown 表（header+divider+データ行）を検出する（Issue #50）
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

    # HITL-02: definitions/hitl/triggers/*.yaml を検証する。
    #
    # 役割分担: .claude/rules/hitl-gate.md §2 の表は判断原則の「思想カテゴリ」一覧
    # （人間と AI が読む全体像）、ここ (triggers/*.yaml) が個別トリガーの運用上の SSOT
    # （機械検証の対象）。トリガーを追加・変更するときは yaml 側が正。
    #
    # 検証内容:
    #   (a) 未記入雛形（値側に <<TODO 残存）は INFO。記入すると PASS/FAIL 判定に昇格。
    #   (b) 記入済みは _schema.md §1 の必須キーを検証。
    #   (c) 記入済みの approver_role は approver-registry.yaml の role_assignments と照合。
    # _ で始まるファイル (_schema 等) は記法ガイドなので対象外。
    # yaml 無し（未記入）は正常状態なので INFO。examples/ 側は EXAMPLE-01/02 がカバー。
    triggers_dir = REPO_ROOT / "definitions" / "hitl" / "triggers"
    if not triggers_dir.exists():
        r.add(
            cat,
            "HITL-02",
            "INFO",
            "definitions/hitl/triggers/ not found — "
            "trigger yaml を配置すると HITL-02 が PASS/FAIL 判定に昇格します "
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
            "trigger yaml を配置すると HITL-02 が PASS/FAIL 判定に昇格します "
            "(cf. definitions/hitl/triggers/_schema.md §1)",
        )
        return

    # _schema.md §1 の必須キーと一致させる（従来の 4 個から拡張）。
    required_keys = (
        "id",
        "name",
        "severity",
        "fire_when",
        "approver_role",
        "notify",
        "on_timeout",
    )
    # 承認者レジストリの役割集合（未記入 / 不在なら None → approver_role 照合はスキップ）。
    approver_roles = _load_approver_roles()

    # 値側（YAML コメント # 以降を除く）に <<TODO が残るファイルは「未記入雛形」= INFO 扱い。
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
            "(記入内容を _schema.md §1 と approver-registry.yaml に合わせてください)",
        )
    elif filled:
        note = (
            f"; {len(unfilled)} template(s) still contain <<TODO>> (INFO)"
            if unfilled
            else ""
        )
        role_note = (
            "approver_role registry 照合済"
            if approver_roles is not None
            else "approver-registry.yaml 未記入のため役割照合はスキップ"
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
            "placeholders — 記入すると HITL-02 が PASS/FAIL 判定に昇格します "
            "(_schema.md §1 の必須キーに沿って記入してください)",
        )


# ============================================================
# Category: STRUCT-DEF — definitions/ 骨格の出荷時実体
# ============================================================
def verify_struct_def(r: Report):
    cat = "STRUCT-DEF"
    defs = REPO_ROOT / "definitions"

    # 各サブディレクトリは README.md または .gitkeep のどちらかで
    # 「出荷物として存在する」ことを示せばよい。
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
# Category: STRUCT-DOC — 出荷時から実体化しているべき doc/引き継ぎ物
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
# Category: EXAMPLE — examples/ 記入済みサンプルの健全性
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

    # EXAMPLE-01: 全 yaml が parse できること
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

    # EXAMPLE-02: 記入済み完成例なので placeholder <<TODO が残っていないこと
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
    """definitions/<subdir>/ に yaml が置かれた場合のみ、
    (a) parse / (b) <<TODO 残存ゼロ / (c) team_id または domain キーの存在 を検証する。
    未記入（yaml 無し）は正常状態なので INFO/SKIP。"""
    target = REPO_ROOT / "definitions" / subdir
    if not target.exists():
        r.add(
            cat,
            id_,
            "INFO",
            f"definitions/{subdir}/ not found — "
            f"yaml を配置すると {id_} が PASS/FAIL 判定に昇格します",
        )
        return

    yaml_files = sorted(target.glob("*.yaml")) + sorted(target.glob("*.yml"))
    if not yaml_files:
        r.add(
            cat,
            id_,
            "INFO",
            f"no yaml files under definitions/{subdir}/ — "
            f"yaml を配置すると {id_} が PASS/FAIL 判定に昇格します",
        )
        return

    problems = []
    for f in yaml_files:
        data, err = load_yaml(f)
        if err:
            problems.append(f"{f.name}: {err}")
            continue
        body = f.read_text(encoding="utf-8")
        # YAML コメント部（# 以降）に書かれた <<TODO への言及は誤検知なので除外し、
        # 値側に残った未記入プレースホルダのみを行番号付きで報告する。
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

    # DEF-CLIENT-01: definitions/clients/<slug>/ があれば各 slug に profile.yaml
    clients_dir = REPO_ROOT / "definitions" / "clients"
    if not clients_dir.exists():
        r.add(
            cat,
            "DEF-CLIENT-01",
            "INFO",
            "definitions/clients/ not found — "
            "client slug directory を作成し profile.yaml 等を配置すると "
            "DEF-CLIENT-01 が PASS/FAIL 判定に昇格します (任意機能)",
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
            "slug ディレクトリを作成し profile.yaml 等を配置すると "
            "DEF-CLIENT-01 が PASS/FAIL 判定に昇格します (任意機能)",
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
# Category: STOCK — Obsidian 互換規約（notes/ L2 記述層）の機械検証
# ============================================================
# docs/decisions/2026-07-03-obsidian-context-stock.md（Decision RFC, accepted）§6 の
# RQT 追加候補 STOCK-01〜05 を実装する（Phase C）。frontmatter 必須キー・wikilink 解決・
# inbox 滞留・L1 への Obsidian 記法混入・market ノートの鮮度を検証する。
_FRONTMATTER_RE = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n", re.DOTALL)
_WIKILINK_RE = re.compile(r"(?<!!)\[\[([^\]|#^]+)")
_INLINE_CODE_RE = re.compile(r"`[^`]*`")  # STOCK-06: コードスパン除去用（偽陽性回避）
STOCK_L2_SHELF_DIRS = ("company", "market", "clients", "sops")
STOCK_LEGACY_DOC_DIRS = (
    "decisions",
    "retros",
)  # docs/ 配下。既存ファイルは遡及改変しない
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
    """L2 ノートの frontmatter を読む。戻り値は (data, err):
    - (dict, None): 正常にパースできた
    - (None, None): frontmatter ブロックが無い（旧形式ファイル等）
    - (None, str): frontmatter はあるが parse できない/mapping でない
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
    """path の最新コミット時刻（epoch秒）。git 管理外/未コミットなら None
    （呼び出し側が mtime にフォールバックする）。"""
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

    # --- STOCK-01: frontmatter 必須キー（type 別） ---
    if not notes_files and not legacy_files:
        r.add(
            cat,
            "STOCK-01",
            "INFO",
            "no L2 notes under notes/{company,market,clients,sops}/ or "
            "docs/{decisions,retros}/ — ノートを作成すると STOCK-01 が PASS/FAIL 判定に昇格します",
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
                continue  # Phase A 以前の既存ファイルは遡及改変しないため対象外
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

    # --- STOCK-02: wikilink 解決可能性（notes/ 内のみ、ルート相対または一意なファイル名） ---
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

    # --- STOCK-03: notes/inbox/ 滞留（7 日超） ---
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
                    f"(>{STOCK_INBOX_STALE_DAYS} days, /ingest-context inbox 推奨): {stale}",
                )
            else:
                r.add(
                    cat,
                    "STOCK-03",
                    "PASS",
                    f"{len(inbox_files)} inbox note(s), none stale (>{STOCK_INBOX_STALE_DAYS} days)",
                )

    # --- STOCK-04: definitions/（L1）への Obsidian 記法混入 ---
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

    # --- STOCK-05: notes/market/ の鮮度（observed_at 90 日超）---
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
                        f"{f.relative_to(REPO_ROOT)} (observed_at {observed_date}, {age}日経過)"
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

    # --- STOCK-06: L2 への Obsidian アプリ依存記法（embed / Dataview / Bases）の混入検査 ---
    # 走査対象は notes/ L2 のみ。docs/decisions・docs/retros は対象外（Decision RFC 自身が
    # 本文で ![[...]] 記法を解説しており偽陽性になるため — RFC SYNTAX-1 参照）。
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
                if "![[" in _INLINE_CODE_RE.sub("", line):  # コードスパン除去後にマッチ
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
# Category: GEN — 一般化ゲート（撤去済みドメイン用語の残存検知）
# ============================================================
def verify_gen(r: Report):
    """GEN-01: リポジトリ内に、Phase E の一般テンプレート化で撤去した旧ドメイン用語
    （3 文字の略語）が残存しないことを検証し、再混入を構造的に防ぐ。
    除外対象は .git / .github/workflows/verify.yml / .gitignore（どちらも defensive
    な検出パターンとして当該用語を意図的に含む）。git 追跡下のファイルのみ対象、
    大文字小文字は無視する。

    実装ノート: 検索語はソースに literal で書かず部品から組み立てる。GEN-01 の grep
    ゲートは verify.py 自身を除外せずゼロを要求するため、本ファイルが自分の検索語で
    self-match しないようにするための措置（HYGIENE-01 の self-reference 対策と同趣旨）。"""
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
# Category: META — Issue-First / commit 規約の遵守度計測
# ============================================================
# 直近コミットの Issue 参照率・Conventional Commits 準拠率を計測する、初めての
# メタ KPI（Issue #45）。issue-first.md §7 は事後起票・オフライン代替を明示的に
# 許容しているため、これを FAIL でゲートすると正当な運用まで赤くしてしまう。
# そのため WARN（非ブロッキング。exit code に影響しない）に倒す —
# Report クラスに元々定義されていた WARN status の初の実使用。
META_SAMPLE_SIZE = 20  # 直近何件の non-merge commit を対象にするか
META_MIN_SAMPLE = 5  # これ未満は配布直後のサンプル不足とみなし INFO に倒す
# 0.8: issue-first.md §7 の事後起票・例外運用を許容しつつ、怠慢（起票そのものを
# しない状態）を検知するための緩めの初期値。閾値は自社の運用実態に合わせて
# 引き上げてよい（本ファイル冒頭の設計コメント: 参加者は verify_*() を育てる）。
META_ISSUE_REF_THRESHOLD = 0.8
META_CONVENTIONAL_THRESHOLD = 0.8
# scope-contract.md §3 Feature（単一 concern）の「要分割検討」目安 500 行を、
# docs/test 系も含む単一の緩い初期値として流用する（自社で厳格化してよい）。
META_BIG_COMMIT_LINES = 500
META_BIG_COMMIT_RATIO = 0.3
_ISSUE_REF_RE = re.compile(r"#[0-9]+")
# .claude/hooks/commit-msg-advisor.sh と同じ type 一覧・パターンを踏襲する
# （表記ゆれを防ぐため、Conventional Commits 判定ロジックを 2 箇所に別々に
# 実装しない）。
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
    """`git log --format=%h%x1f%s --shortstat` 出力を [(hash, subject,
    changed_lines), ...] にパースする（META-03）。shortstat 行は空行の直後にのみ
    現れ、差分の無いコミット（--allow-empty 等）では現れないため 0 行扱いにする。"""
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
    """META-01/02: Issue-First（issue-first.md §5）と Conventional Commits
    （同 §5）の遵守度、META-03: scope-contract.md §3 の diff budget 遵守度を、
    直近コミット履歴から計測する。

    偽緑禁止の趣旨に沿って「隠れた不遵守」を可視化する一方、issue-first.md §7 /
    scope-contract.md §5 はいずれも例外運用を明示的に許容しているため、遵守度
    そのものを FAIL でゲートはしない（WARN=非ブロッキングな指標にとどめる）。
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
            f"only {total} commit(s) found — 配布直後はサンプル不足。"
            f"コミットが {META_MIN_SAMPLE} 件以上になると PASS/WARN 判定に昇格します"
        )
        r.add(cat, "META-01", "INFO", msg)
        r.add(cat, "META-02", "INFO", msg)
        r.add(cat, "META-03", "INFO", msg)
        return

    # META-01: Issue 参照率（subject + body を対象、#N または issue化予定）
    referenced, unreferenced = [], []
    for subject, body in commits:
        combined = subject + "\n" + body
        if _ISSUE_REF_RE.search(combined) or "issue化予定" in combined:
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

    # META-02: Conventional Commits 準拠率（subject のみを対象）
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

    # META-03: コミットあたり diff サイズ（scope-contract.md §3 の diff budget を自己計測）
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
        offenders = [f"{h} {s} ({c} 行)" for h, s, c in big]
        r.add(
            cat,
            "META-03",
            "WARN",
            f"big-commit ratio {len(big)}/{len(stats)} ({big_ratio:.0%}) "
            f"> {META_BIG_COMMIT_RATIO:.0%} (>{META_BIG_COMMIT_LINES} 行/commit) — "
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
# Category: CONTEXT — 常駐コンテキスト予算（CLAUDE.md + `@` import 群の合計バイト数）
# ============================================================
# 実測 ~30.6KB（日本語 UTF-8 ≈ 3 bytes/字、概算 8-12k トークン相当）に +20% の
# 余裕で WARN、その約 1.8 倍を FAIL とする初期値。自社で予算を厳しくしてよい
# （本ファイル冒頭の設計コメント: 参加者は verify_*() を育てる）。
CONTEXT_WARN_BYTES = 36_000
CONTEXT_FAIL_BYTES = 56_000
# 「Rule imports」節は `@.claude/rules/scope-contract.md` のように行全体が @+パス
# のみ。行頭 `@` の email 様トークン単体行を誤認するリスクは残るが、契約を単純に
# 保つため意図的にそのままにする（`^@\S+$` on stripped lines が本チェックの契約）。
_IMPORT_RE = re.compile(r"^@(\S+)$")


def verify_context(r: Report):
    """CONTEXT-01: 常駐コンテキスト予算（CLAUDE.md 本文 + `@` import 先の合計バイト数）。

    docs/concepts/context-funnel.md の「necessary-only」思想を自己計測する RQT。
    import 切れ（`@path` の実体が無い）は「読み込まれないルール」= 無言の harness
    故障なので予算超過と同格の FAIL とする。PATHREF-01 は backtick 囲みの repo 相対
    パス参照しか見ない（行頭 `@import` 構文はそもそも backtick で囲まれない）ため、
    import 切れを機械的に検知できるのはこの CONTEXT-01 だけである。
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
            f"exceeds budget {CONTEXT_WARN_BYTES:,} — 詳細を docs/ へ追い出す余地が"
            "あります (cf. CLAUDE.md §4/§4.5)"
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
# Category: PATHREF — ドキュメント内の repo 相対パス参照の実在検証
# ============================================================
# 対象を限定し、backtick で囲まれた repo 相対パス（下記 prefix で始まるもの）を抽出して
# 実在検証する。placeholder（<...> / {...}）・glob（*）・生成物ホワイトリストはスキップし、
# 誤検知を出さない保守的な実装にする。再発防止の構造化（PLAN-PHASE-E F-08 / Wave 2）。
PATHREF_PREFIXES = (
    "definitions/",
    "docs/",
    "scripts/",
    "examples/",
    "state/",
    "secrets/",
    ".claude/",
)
# 生成物（コマンド/スクリプトが後から作る）— 実在しなくても FAIL にしない。
PATHREF_GENERATED_PREFIXES = (
    "docs/decisions/",
    "docs/retros/",
    "state/",
    "definitions/.staging/",
)
PATHREF_GENERATED_EXACT = {"definitions/ontology/company.yaml"}
_BACKTICK_RE = re.compile(r"`([^`]+)`")
# ``` フェンスコードブロックは backtick のペアリングを desync させ、後続の inline-code
# 参照を検査対象から静かに取りこぼすため、抽出前に必ず除去する（フェンス内のツリー図・
# コマンド例は「単一の実パス参照」ではないので検査対象外で正しい）。
_FENCE_RE = re.compile(r"```.*?```", re.DOTALL)


def verify_pathref(r: Report):
    cat = "PATHREF"
    targets = [
        REPO_ROOT / "CLAUDE.md",
        REPO_ROOT / "docs" / "directory-map.md",
        REPO_ROOT / "docs" / "setup-walkthrough.md",
        REPO_ROOT / "docs" / "starter-manual.md",
        REPO_ROOT / "docs" / "participant-guide.md",
        REPO_ROOT / "docs" / "retreat-day-flow.md",
        REPO_ROOT / "docs" / "feedback-collection.md",
        REPO_ROOT / "HANDOFF.md",
    ]
    targets += sorted((REPO_ROOT / ".claude" / "commands").glob("*.md"))
    targets += sorted((REPO_ROOT / "docs" / "templates").glob("*.md"))
    targets += sorted((REPO_ROOT / "exercises").glob("*.md"))
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
            # placeholder / glob / multi-token は「単一の実パス」ではないのでスキップ
            if any(c in token for c in "<>{}*") or " " in token:
                continue
            # 生成物ホワイトリストはスキップ
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
        description="AI 駆動経営合宿スターターテンプレ RQT verify"
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

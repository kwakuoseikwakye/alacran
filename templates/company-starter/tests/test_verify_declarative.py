"""Declarative (non-git) RQT のテスト（Issue #42）。

verify.py の checker のうち git 操作を必要としないものだけを対象にする。
git 関連（HYGIENE-01 / GEN-01 / STRUCTURE-02 の check-ignore 裏取り）は
tests/test_verify_git.py が別途カバーする。

各テストは PASS 側だけでなく FAIL 側も pin する（偽緑禁止）。
"""

import json
import subprocess
import sys
import unittest
from pathlib import Path

import helpers
from helpers import VerifyTestCase

import verify


# ============================================================
# STRUCTURE
# ============================================================
class StructureTest(VerifyTestCase):
    def test_structure01_pass_when_license_present(self):
        """STRUCTURE-01: LICENSE.md が存在すれば PASS。"""
        self.write("LICENSE.md", "license body\n")
        result = self.check(verify.verify_structure)
        self.assertEqual(result["STRUCTURE-01"][0], "PASS")
        self.assertIn("LICENSE.md exists", result["STRUCTURE-01"][1])

    def test_structure01_fail_when_license_missing(self):
        """STRUCTURE-01: LICENSE.md が無ければ FAIL。"""
        result = self.check(verify.verify_structure)
        self.assertEqual(result["STRUCTURE-01"][0], "FAIL")
        self.assertIn("LICENSE.md not found", result["STRUCTURE-01"][1])

    def test_structure03_fail_when_claude_md_missing(self):
        """STRUCTURE-03: CLAUDE.md が無ければ FAIL。"""
        result = self.check(verify.verify_structure)
        self.assertEqual(result["STRUCTURE-03"][0], "FAIL")
        self.assertIn("CLAUDE.md not found", result["STRUCTURE-03"][1])

    def test_structure03_pass_when_claude_md_present(self):
        """STRUCTURE-03: CLAUDE.md が存在すれば PASS。"""
        self.write("CLAUDE.md", "# ops constitution\n")
        result = self.check(verify.verify_structure)
        self.assertEqual(result["STRUCTURE-03"][0], "PASS")

    def test_structure04_fail_when_readme_missing(self):
        """STRUCTURE-04: README.md が無ければ FAIL。"""
        result = self.check(verify.verify_structure)
        self.assertEqual(result["STRUCTURE-04"][0], "FAIL")
        self.assertIn("README.md not found", result["STRUCTURE-04"][1])

    def test_structure04_pass_when_readme_present(self):
        """STRUCTURE-04: README.md が存在すれば PASS。"""
        self.write("README.md", "# readme\n")
        result = self.check(verify.verify_structure)
        self.assertEqual(result["STRUCTURE-04"][0], "PASS")

    def test_structure02_fail_when_gitignore_missing(self):
        """STRUCTURE-02: .gitignore が無ければ FAIL。"""
        result = self.check(verify.verify_structure)
        self.assertEqual(result["STRUCTURE-02"][0], "FAIL")
        self.assertIn(".gitignore not found", result["STRUCTURE-02"][1])

    def test_structure02_pass_when_effective_lines_present(self):
        """STRUCTURE-02: secrets/ と .env の実効行があれば PASS（.git 無しなので静的判定のみ）。"""
        self.write(".gitignore", "secrets/\n.env\n")
        result = self.check(verify.verify_structure)
        self.assertEqual(result["STRUCTURE-02"][0], "PASS")
        self.assertIn("effectively blocks", result["STRUCTURE-02"][1])

    def test_structure02_fail_when_secrets_line_missing(self):
        """STRUCTURE-02: secrets/ の実効行が無ければ FAIL。"""
        self.write(".gitignore", ".env\n")
        result = self.check(verify.verify_structure)
        self.assertEqual(result["STRUCTURE-02"][0], "FAIL")
        self.assertIn("secrets/", result["STRUCTURE-02"][1])

    def test_structure02_fail_when_env_line_missing(self):
        """STRUCTURE-02: .env の実効行が無ければ FAIL。"""
        self.write(".gitignore", "secrets/\n")
        result = self.check(verify.verify_structure)
        self.assertEqual(result["STRUCTURE-02"][0], "FAIL")
        self.assertIn(".env", result["STRUCTURE-02"][1])

    def test_structure02_fail_when_only_comment_mentions_secrets(self):
        """STRUCTURE-02: secrets/ がコメント行にしか無ければ実効判定は FAIL。"""
        self.write(".gitignore", "# secrets/\n.env\n")
        result = self.check(verify.verify_structure)
        self.assertEqual(result["STRUCTURE-02"][0], "FAIL")
        self.assertIn("secrets/", result["STRUCTURE-02"][1])

    def test_structure02_fail_when_only_negation_mentions_secrets(self):
        """STRUCTURE-02: secrets/ が否定行にしか無ければ実効判定は FAIL。"""
        self.write(".gitignore", "!secrets/**\n.env\n")
        result = self.check(verify.verify_structure)
        self.assertEqual(result["STRUCTURE-02"][0], "FAIL")
        self.assertIn("secrets/", result["STRUCTURE-02"][1])


# ============================================================
# ONTOLOGY-01
# ============================================================
class OntologyTest(VerifyTestCase):
    def test_ontology01_info_when_dir_missing(self):
        """ONTOLOGY-01: definitions/ontology/ が無ければ INFO。"""
        result = self.check(verify.verify_ontology)
        self.assertEqual(result["ONTOLOGY-01"][0], "INFO")
        self.assertIn("not found", result["ONTOLOGY-01"][1])

    def test_ontology01_info_when_dir_empty(self):
        """ONTOLOGY-01: definitions/ontology/ はあるが yaml が無ければ INFO。"""
        (self.root / "definitions" / "ontology").mkdir(parents=True)
        result = self.check(verify.verify_ontology)
        self.assertEqual(result["ONTOLOGY-01"][0], "INFO")
        self.assertIn("no yaml files", result["ONTOLOGY-01"][1])

    def test_ontology01_pass_with_valid_customer_mapping(self):
        """ONTOLOGY-01: customer キーを持つ mapping なら PASS。"""
        self.write("definitions/ontology/customer.yaml", "customer:\n  name: acme\n")
        result = self.check(verify.verify_ontology)
        self.assertEqual(result["ONTOLOGY-01"][0], "PASS")
        self.assertIn("customer/org/product", result["ONTOLOGY-01"][1])

    def test_ontology01_fail_on_yaml_parse_error(self):
        """ONTOLOGY-01: yaml parse エラーで FAIL。"""
        self.write("definitions/ontology/broken.yaml", "customer: [unterminated\n")
        result = self.check(verify.verify_ontology)
        self.assertEqual(result["ONTOLOGY-01"][0], "FAIL")
        self.assertIn("broken.yaml", result["ONTOLOGY-01"][1])

    def test_ontology01_fail_when_toplevel_is_list(self):
        """ONTOLOGY-01: top-level が list だと FAIL。"""
        self.write("definitions/ontology/list.yaml", "- a\n- b\n")
        result = self.check(verify.verify_ontology)
        self.assertEqual(result["ONTOLOGY-01"][0], "FAIL")
        self.assertIn("not a mapping", result["ONTOLOGY-01"][1])

    def test_ontology01_fail_when_no_known_keys(self):
        """ONTOLOGY-01: customer/org/product どれも無ければ FAIL。"""
        self.write("definitions/ontology/other.yaml", "foo: bar\n")
        result = self.check(verify.verify_ontology)
        self.assertEqual(result["ONTOLOGY-01"][0], "FAIL")
        self.assertIn("none of", result["ONTOLOGY-01"][1])


# ============================================================
# HITL-01 / HITL-02
# ============================================================
TABLE_BODY = "| Category | Threshold |\n|---|---|\n| Money | $100 |\n"


class HitlTest(VerifyTestCase):
    def test_hitl01_info_when_rule_file_missing(self):
        """HITL-01: hitl-gate.md が無ければ INFO で、HITL-02 は行自体が発生しない。"""
        result = self.check(verify.verify_hitl)
        self.assertEqual(result["HITL-01"][0], "INFO")
        self.assertIn("not found", result["HITL-01"][1])
        self.assertNotIn("HITL-02", result)

    def test_hitl01_pass_with_markdown_table(self):
        """HITL-01: markdown table があれば PASS。"""
        self.write(".claude/rules/hitl-gate.md", TABLE_BODY)
        result = self.check(verify.verify_hitl)
        self.assertEqual(result["HITL-01"][0], "PASS")
        self.assertIn("trigger table", result["HITL-01"][1])

    def test_hitl01_fail_without_table(self):
        """HITL-01: table が無ければ FAIL。"""
        self.write(".claude/rules/hitl-gate.md", "no table here, just prose.\n")
        result = self.check(verify.verify_hitl)
        self.assertEqual(result["HITL-01"][0], "FAIL")
        self.assertIn("no trigger table", result["HITL-01"][1])

    def test_hitl01_fail_on_scattered_pipes_and_thematic_break(self):
        """HITL-01(回帰): 散在する | と thematic-break の --- だけでは FAIL（Issue #50）。

        旧実装は body 中に "|" と "---" が 1 個でもあれば PASS していた。表を丸ごと
        削除した状態を模し、隣接する header+divider ペアが無いことを pin する。"""
        body = (
            "Some prose with a | pipe in it.\n"
            "Another line with a | pipe here too.\n"
            "\n"
            "---\n"
            "\n"
            "More | text but no real table.\n"
        )
        self.write(".claude/rules/hitl-gate.md", body)
        result = self.check(verify.verify_hitl)
        self.assertEqual(result["HITL-01"][0], "FAIL")
        self.assertIn("no trigger table", result["HITL-01"][1])

    def test_hitl01_fail_on_header_divider_without_data_rows(self):
        """HITL-01: header + divider はあってもデータ行が 0 なら空表として FAIL。"""
        body = "| Category | Threshold |\n|---|---|\n"
        self.write(".claude/rules/hitl-gate.md", body)
        result = self.check(verify.verify_hitl)
        self.assertEqual(result["HITL-01"][0], "FAIL")
        self.assertIn("no trigger table", result["HITL-01"][1])

    def test_hitl02_info_when_triggers_dir_missing(self):
        """HITL-02: triggers/ が無ければ INFO。"""
        self.write(".claude/rules/hitl-gate.md", TABLE_BODY)
        result = self.check(verify.verify_hitl)
        self.assertEqual(result["HITL-02"][0], "INFO")
        self.assertIn("triggers/ not found", result["HITL-02"][1])

    def test_hitl02_info_when_no_yaml(self):
        """HITL-02: triggers/ はあるが yaml が無ければ INFO。"""
        self.write(".claude/rules/hitl-gate.md", TABLE_BODY)
        (self.root / "definitions" / "hitl" / "triggers").mkdir(parents=True)
        result = self.check(verify.verify_hitl)
        self.assertEqual(result["HITL-02"][0], "INFO")
        self.assertIn("no trigger yaml", result["HITL-02"][1])

    def test_hitl02_excludes_underscore_prefixed_files(self):
        """HITL-02: _ で始まるファイル（_schema 等）は対象外扱い。"""
        self.write(".claude/rules/hitl-gate.md", TABLE_BODY)
        self.write(
            "definitions/hitl/triggers/_schema.yaml", "note: not a real trigger\n"
        )
        result = self.check(verify.verify_hitl)
        self.assertEqual(result["HITL-02"][0], "INFO")
        self.assertIn("no trigger yaml", result["HITL-02"][1])

    def test_hitl02_info_when_all_unfilled(self):
        """HITL-02: 全 trigger が <<TODO 未記入なら INFO。"""
        self.write(".claude/rules/hitl-gate.md", TABLE_BODY)
        self.write(
            "definitions/hitl/triggers/money.yaml",
            "id: <<TODO fill id>>\nname: placeholder\n",
        )
        result = self.check(verify.verify_hitl)
        self.assertEqual(result["HITL-02"][0], "INFO")
        self.assertIn("<<TODO>>", result["HITL-02"][1])

    FILLED_TRIGGER = (
        "id: payment-1\n"
        "name: Payment approval\n"
        "severity: high\n"
        "fire_when: amount_usd > 100\n"
        "approver_role: owner\n"
        "notify: slack-channel\n"
        "on_timeout: escalate_to_owner\n"
    )
    FILLED_REGISTRY = "role_assignments:\n  owner: Jane Doe\n  finance: John Roe\n"

    def test_hitl02_pass_with_filled_trigger_and_matching_registry(self):
        """HITL-02: 7 必須キーが揃い approver_role がレジストリと一致すれば PASS。"""
        self.write(".claude/rules/hitl-gate.md", TABLE_BODY)
        self.write("definitions/hitl/triggers/payment.yaml", self.FILLED_TRIGGER)
        self.write("definitions/hitl/approver-registry.yaml", self.FILLED_REGISTRY)
        result = self.check(verify.verify_hitl)
        self.assertEqual(result["HITL-02"][0], "PASS")
        self.assertIn("required keys", result["HITL-02"][1])

    def test_hitl02_fail_on_missing_keys(self):
        """HITL-02: 必須キー欠落で FAIL。"""
        self.write(".claude/rules/hitl-gate.md", TABLE_BODY)
        missing_on_timeout = self.FILLED_TRIGGER.replace(
            "on_timeout: escalate_to_owner\n", ""
        )
        self.write("definitions/hitl/triggers/payment.yaml", missing_on_timeout)
        self.write("definitions/hitl/approver-registry.yaml", self.FILLED_REGISTRY)
        result = self.check(verify.verify_hitl)
        self.assertEqual(result["HITL-02"][0], "FAIL")
        self.assertIn("missing keys", result["HITL-02"][1])
        self.assertIn("on_timeout", result["HITL-02"][1])

    def test_hitl02_fail_on_approver_role_not_in_registry(self):
        """HITL-02: approver_role がレジストリに無ければ FAIL。"""
        self.write(".claude/rules/hitl-gate.md", TABLE_BODY)
        bad_role = self.FILLED_TRIGGER.replace(
            "approver_role: owner\n", "approver_role: compliance\n"
        )
        self.write("definitions/hitl/triggers/payment.yaml", bad_role)
        self.write("definitions/hitl/approver-registry.yaml", self.FILLED_REGISTRY)
        result = self.check(verify.verify_hitl)
        self.assertEqual(result["HITL-02"][0], "FAIL")
        self.assertIn("not defined in", result["HITL-02"][1])
        self.assertIn("compliance", result["HITL-02"][1])

    def test_hitl02_pass_and_skips_role_check_when_registry_unfilled(self):
        """HITL-02: registry が未記入（値側に <<TODO）なら role 照合をスキップし PASS。"""
        self.write(".claude/rules/hitl-gate.md", TABLE_BODY)
        self.write("definitions/hitl/triggers/payment.yaml", self.FILLED_TRIGGER)
        self.write(
            "definitions/hitl/approver-registry.yaml",
            "role_assignments:\n  owner: <<TODO fill approver name>>\n",
        )
        result = self.check(verify.verify_hitl)
        self.assertEqual(result["HITL-02"][0], "PASS")
        self.assertIn("スキップ", result["HITL-02"][1])


# ============================================================
# STRUCT-DEF-01
# ============================================================
class StructDefTest(VerifyTestCase):
    SUBDIRS = ("ontology", "hitl", "hitl/triggers", "kpi", "cycles", "retro", "clients")

    def _write_full_skeleton(self):
        self.write("definitions/README.md", "# definitions\n")
        for sub in self.SUBDIRS:
            self.write(f"definitions/{sub}/README.md", "placeholder\n")

    def test_struct_def01_pass_with_full_skeleton(self):
        """STRUCT-DEF-01: README + 全 7 サブディレクトリが揃えば PASS。"""
        self._write_full_skeleton()
        result = self.check(verify.verify_struct_def)
        self.assertEqual(result["STRUCT-DEF-01"][0], "PASS")
        self.assertIn("6 subdirs", result["STRUCT-DEF-01"][1])

    def test_struct_def01_fail_when_subdir_missing(self):
        """STRUCT-DEF-01: サブディレクトリが 1 つ欠けると FAIL でその名を列挙。"""
        self.write("definitions/README.md", "# definitions\n")
        for sub in self.SUBDIRS:
            if sub == "kpi":
                continue
            self.write(f"definitions/{sub}/README.md", "placeholder\n")
        result = self.check(verify.verify_struct_def)
        self.assertEqual(result["STRUCT-DEF-01"][0], "FAIL")
        self.assertIn("definitions/kpi/", result["STRUCT-DEF-01"][1])


# ============================================================
# STRUCT-DOC-01
# ============================================================
class StructDocTest(VerifyTestCase):
    REQUIRED = [
        "HANDOFF.md",
        "docs/decisions/README.md",
        "docs/retros/README.md",
        "docs/directory-map.md",
    ]

    def test_struct_doc01_pass_with_all_files(self):
        """STRUCT-DOC-01: 4 つの出荷時 doc が揃えば PASS。"""
        for p in self.REQUIRED:
            self.write(p, "content\n")
        result = self.check(verify.verify_struct_doc)
        self.assertEqual(result["STRUCT-DOC-01"][0], "PASS")
        self.assertIn("4 shipped doc", result["STRUCT-DOC-01"][1])

    def test_struct_doc01_fail_when_one_missing(self):
        """STRUCT-DOC-01: 1 つでも欠けると FAIL でそのパスを列挙。"""
        for p in self.REQUIRED:
            if p == "docs/retros/README.md":
                continue
            self.write(p, "content\n")
        result = self.check(verify.verify_struct_doc)
        self.assertEqual(result["STRUCT-DOC-01"][0], "FAIL")
        self.assertIn("docs/retros/README.md", result["STRUCT-DOC-01"][1])


# ============================================================
# EXAMPLE-01 / EXAMPLE-02
# ============================================================
class ExampleTest(VerifyTestCase):
    def test_example01_info_when_examples_dir_missing(self):
        """EXAMPLE-01: examples/ が無ければ INFO。EXAMPLE-02 の行も発生しない。"""
        result = self.check(verify.verify_examples)
        self.assertEqual(result["EXAMPLE-01"][0], "INFO")
        self.assertNotIn("EXAMPLE-02", result)

    def test_example01_and_02_pass_with_valid_yaml(self):
        """EXAMPLE-01/02: 正常な記入済み yaml なら両方 PASS。"""
        self.write("examples/co/data.yaml", "team_id: t1\nname: acme\n")
        result = self.check(verify.verify_examples)
        self.assertEqual(result["EXAMPLE-01"][0], "PASS")
        self.assertEqual(result["EXAMPLE-02"][0], "PASS")

    def test_example01_fail_on_broken_yaml(self):
        """EXAMPLE-01: yaml parse エラーで FAIL。"""
        self.write("examples/co/bad.yaml", "key: [unterminated\n")
        result = self.check(verify.verify_examples)
        self.assertEqual(result["EXAMPLE-01"][0], "FAIL")
        self.assertIn("bad.yaml", result["EXAMPLE-01"][1])

    def test_example02_fail_on_unfilled_placeholder(self):
        """EXAMPLE-02: 記入済みサンプルに <<TODO が残っていれば FAIL。"""
        self.write("examples/co/good.yaml", "name: <<TODO fill in>>\n")
        result = self.check(verify.verify_examples)
        self.assertEqual(result["EXAMPLE-01"][0], "PASS")
        self.assertEqual(result["EXAMPLE-02"][0], "FAIL")
        self.assertIn("good.yaml", result["EXAMPLE-02"][1])


# ============================================================
# DEFINITIONS: DEF-KPI-01 / DEF-CYCLE-01 / DEF-RETRO-01 / DEF-CLIENT-01
# ============================================================
class DefinitionsTest(VerifyTestCase):
    def test_def_kpi01_info_when_dir_missing(self):
        """DEF-KPI-01: definitions/kpi/ が無ければ INFO。"""
        result = self.check(verify.verify_definitions)
        self.assertEqual(result["DEF-KPI-01"][0], "INFO")
        self.assertIn("kpi/ not found", result["DEF-KPI-01"][1])

    def test_def_cycle01_info_when_dir_missing(self):
        """DEF-CYCLE-01: definitions/cycles/ が無ければ INFO。"""
        result = self.check(verify.verify_definitions)
        self.assertEqual(result["DEF-CYCLE-01"][0], "INFO")
        self.assertIn("cycles/ not found", result["DEF-CYCLE-01"][1])

    def test_def_retro01_info_when_dir_missing(self):
        """DEF-RETRO-01: definitions/retro/ が無ければ INFO。"""
        result = self.check(verify.verify_definitions)
        self.assertEqual(result["DEF-RETRO-01"][0], "INFO")
        self.assertIn("retro/ not found", result["DEF-RETRO-01"][1])

    def test_def_kpi01_info_when_dir_empty(self):
        """DEF-KPI-01: definitions/kpi/ はあるが yaml 無しなら INFO。"""
        (self.root / "definitions" / "kpi").mkdir(parents=True)
        result = self.check(verify.verify_definitions)
        self.assertEqual(result["DEF-KPI-01"][0], "INFO")
        self.assertIn("no yaml files", result["DEF-KPI-01"][1])

    def test_def_kpi01_pass_with_team_id(self):
        """DEF-KPI-01: team_id キーがあれば PASS。"""
        self.write("definitions/kpi/team-a.yaml", "team_id: team-a\nmetric: mrr\n")
        result = self.check(verify.verify_definitions)
        self.assertEqual(result["DEF-KPI-01"][0], "PASS")

    def test_def_cycle01_pass_with_domain(self):
        """DEF-CYCLE-01: domain キーがあれば PASS。"""
        self.write("definitions/cycles/q3.yaml", "domain: sales\n")
        result = self.check(verify.verify_definitions)
        self.assertEqual(result["DEF-CYCLE-01"][0], "PASS")

    def test_def_kpi01_fail_on_unfilled_placeholder_reports_line_number(self):
        """DEF-KPI-01: 値側の <<TODO は行番号付きで FAIL。"""
        self.write(
            "definitions/kpi/team-a.yaml",
            "team_id: team-a\nnote: <<TODO fill this in>>\n",
        )
        result = self.check(verify.verify_definitions)
        self.assertEqual(result["DEF-KPI-01"][0], "FAIL")
        self.assertIn("team-a.yaml:2:", result["DEF-KPI-01"][1])

    def test_def_kpi01_fail_when_team_id_and_domain_missing(self):
        """DEF-KPI-01: team_id も domain も無ければ FAIL。"""
        self.write("definitions/kpi/team-a.yaml", "other_key: val\n")
        result = self.check(verify.verify_definitions)
        self.assertEqual(result["DEF-KPI-01"][0], "FAIL")
        self.assertIn("missing 'team_id' or 'domain'", result["DEF-KPI-01"][1])

    def test_def_kpi01_pass_when_placeholder_only_in_comment(self):
        """DEF-KPI-01: <<TODO がコメント側だけなら FAIL 対象にならない。"""
        self.write(
            "definitions/kpi/team-a.yaml",
            "team_id: team-a\n# reminder: <<TODO update later>>\n",
        )
        result = self.check(verify.verify_definitions)
        self.assertEqual(result["DEF-KPI-01"][0], "PASS")

    def test_def_client01_info_when_no_slugs(self):
        """DEF-CLIENT-01: clients/ はあるが slug ディレクトリが無ければ INFO。"""
        (self.root / "definitions" / "clients").mkdir(parents=True)
        result = self.check(verify.verify_definitions)
        self.assertEqual(result["DEF-CLIENT-01"][0], "INFO")
        self.assertIn("no client slug directory", result["DEF-CLIENT-01"][1])

    def test_def_client01_pass_with_parseable_profile(self):
        """DEF-CLIENT-01: slug に profile.yaml があり parse できれば PASS。"""
        self.write("definitions/clients/acme/profile.yaml", "name: Acme Corp\n")
        result = self.check(verify.verify_definitions)
        self.assertEqual(result["DEF-CLIENT-01"][0], "PASS")

    def test_def_client01_fail_when_profile_missing(self):
        """DEF-CLIENT-01: slug に profile.yaml が無ければ FAIL。"""
        self.write("definitions/clients/acme/.gitkeep", "")
        result = self.check(verify.verify_definitions)
        self.assertEqual(result["DEF-CLIENT-01"][0], "FAIL")
        self.assertIn("missing profile.yaml", result["DEF-CLIENT-01"][1])


# ============================================================
# PATHREF-01
# ============================================================
class PathrefTest(VerifyTestCase):
    def test_pathref01_pass_when_ref_resolves(self):
        """PATHREF-01: backtick 参照先が実在すれば PASS で count を報告。"""
        self.write("docs/foo.md", "# foo\n")
        self.write("CLAUDE.md", "See `docs/foo.md` for details.\n")
        result = self.check(verify.verify_pathref)
        self.assertEqual(result["PATHREF-01"][0], "PASS")
        self.assertIn("1 repo path reference(s) all resolve", result["PATHREF-01"][1])

    def test_pathref01_fail_when_ref_unresolved(self):
        """PATHREF-01: backtick 参照先が無ければ FAIL でファイル名とトークンを列挙。"""
        self.write("CLAUDE.md", "See `docs/missing-guide.md` for details.\n")
        result = self.check(verify.verify_pathref)
        self.assertEqual(result["PATHREF-01"][0], "FAIL")
        self.assertIn("CLAUDE.md", result["PATHREF-01"][1])
        self.assertIn("docs/missing-guide.md", result["PATHREF-01"][1])

    def test_pathref01_skips_placeholder_and_glob_tokens(self):
        """PATHREF-01: <...> / {...} / * / スペース入りトークンは検査対象外。"""
        self.write(
            "CLAUDE.md",
            "See `docs/<slug>.md` and `docs/{name}.md` "
            "and `docs/*.md` and `docs/a b.md` for details.\n",
        )
        result = self.check(verify.verify_pathref)
        self.assertEqual(result["PATHREF-01"][0], "PASS")
        self.assertIn("0 repo path reference(s) all resolve", result["PATHREF-01"][1])

    def test_pathref01_skips_generated_prefixes(self):
        """PATHREF-01: docs/decisions/... のような生成物パスはスキップされる。"""
        self.write("CLAUDE.md", "See `docs/decisions/2026-01-01-example.md` too.\n")
        result = self.check(verify.verify_pathref)
        self.assertEqual(result["PATHREF-01"][0], "PASS")
        self.assertIn("0 repo path reference(s) all resolve", result["PATHREF-01"][1])

    def test_pathref01_ignores_refs_inside_fences(self):
        """PATHREF-01: ``` フェンス内の参照は抽出前に除去され検査対象外。"""
        self.write(
            "CLAUDE.md",
            "Example:\n\n```\nSee `docs/missing-in-fence.md` inside code.\n```\n",
        )
        result = self.check(verify.verify_pathref)
        self.assertEqual(result["PATHREF-01"][0], "PASS")
        self.assertIn("0 repo path reference(s) all resolve", result["PATHREF-01"][1])


# ============================================================
# Report
# ============================================================
class ReportTest(unittest.TestCase):
    def test_passed_false_iff_any_fail(self):
        """Report.passed(): FAIL 行が 1 つでもあれば False、無ければ True。"""
        r = verify.Report()
        r.add("CAT", "X-01", "PASS", "ok")
        r.add("CAT", "X-02", "WARN", "warn")
        r.add("CAT", "X-03", "INFO", "info")
        r.add("CAT", "X-04", "SKIP", "skip")
        self.assertTrue(r.passed())
        r.add("CAT", "X-05", "FAIL", "bad")
        self.assertFalse(r.passed())

    def test_summary_counts(self):
        """Report.summary(): PASS/WARN/FAIL を個別集計し SKIP+INFO をまとめる。"""
        r = verify.Report()
        r.add("CAT", "X-01", "PASS", "")
        r.add("CAT", "X-02", "PASS", "")
        r.add("CAT", "X-03", "WARN", "")
        r.add("CAT", "X-04", "FAIL", "")
        r.add("CAT", "X-05", "SKIP", "")
        r.add("CAT", "X-06", "INFO", "")
        passed, warned, failed, skipped, total = r.summary()
        self.assertEqual((passed, warned, failed, skipped, total), (2, 1, 1, 2, 6))

    def test_as_dict_shape(self):
        """Report.as_dict(): rows リストの各要素が category/id/status/message を持つ。"""
        r = verify.Report()
        r.add("CAT", "X-01", "PASS", "msg")
        self.assertEqual(
            r.as_dict(),
            {
                "rows": [
                    {
                        "category": "CAT",
                        "id": "X-01",
                        "status": "PASS",
                        "message": "msg",
                    }
                ]
            },
        )

    def test_add_asserts_on_invalid_status(self):
        """Report.add(): 未知の status を渡すと AssertionError。"""
        r = verify.Report()
        with self.assertRaises(AssertionError):
            r.add("CAT", "X-01", "NOT_A_STATUS", "")


# ============================================================
# End-to-end smoke
# ============================================================
class EndToEndSmokeTest(unittest.TestCase):
    def test_verify_py_json_runs_clean_on_real_repo(self):
        """python3 scripts/verify.py --json が実リポジトリ相手に exit 0 で有効な JSON を返す。"""
        repo_root = Path(__file__).resolve().parent.parent
        proc = subprocess.run(
            [sys.executable, str(repo_root / "scripts" / "verify.py"), "--json"],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=120,
        )
        self.assertEqual(proc.returncode, 0, msg=proc.stdout + proc.stderr)
        data = json.loads(proc.stdout)
        self.assertIn("rows", data)
        self.assertGreater(len(data["rows"]), 0)
        known_statuses = {"PASS", "WARN", "FAIL", "INFO", "SKIP"}
        for row in data["rows"]:
            self.assertIn(row["status"], known_statuses)


if __name__ == "__main__":
    unittest.main()

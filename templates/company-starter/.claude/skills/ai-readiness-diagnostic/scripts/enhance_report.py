#!/usr/bin/env python3
"""
AI Readiness Diagnostic Report Enhancer
generate_report.py で生成したExcelレポートを以下の観点で強化する：
  1. 読者層別の表現変換（--audience executive で経営者向け平易表現に）
  2. カスタムDAG画像への差し替え（--custom-dag-image で説明用の図に）
  3. 業務ブロック対応表の追加（--block-mapping で図のブロックとタスクIDの紐付け）

Usage:
    python3 enhance_report.py \
        --input "AI活用診断レポート.xlsx" \
        --output "AI活用診断レポート_最終版.xlsx" \
        --audience executive \
        --custom-dag-image dag.png \
        --block-mapping mapping.json
"""

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

import openpyxl
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import PatternFill, Font, Alignment
from openpyxl.utils import get_column_letter

# スキルのreferencesディレクトリ
SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_TERMINOLOGY = SKILL_DIR / "references" / "terminology_executive.json"


# ─────────────────────────────────────────────
# 用語辞書のロード
# ─────────────────────────────────────────────
def load_terminology(path: Path) -> dict:
    """経営者向け平易表現の辞書をロード"""
    if not path.exists():
        print(f"[!] 用語辞書が見つかりません: {path}", file=sys.stderr)
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ─────────────────────────────────────────────
# Sheet 1: サマリーの平易化
# ─────────────────────────────────────────────
def enhance_summary_sheet(ws, terminology: dict):
    """サマリーシートのラベルを平易表現に置換"""
    label_map = terminology.get("summary_labels", {})
    if not label_map:
        return

    for row in ws.iter_rows():
        for cell in row:
            if cell.value and isinstance(cell.value, str):
                for old, new in label_map.items():
                    if cell.value.startswith(old):
                        cell.value = cell.value.replace(old, new)


# ─────────────────────────────────────────────
# Sheet 2: タスク一覧の列名・適合度ラベルを平易化
# ─────────────────────────────────────────────
def enhance_task_sheet(ws, terminology: dict):
    """タスク一覧シートの列名・適合度・クリティカルパス表記を平易化"""
    header_map = terminology.get("task_sheet_headers", {})
    fit_label_map = terminology.get("ai_fit_labels", {})
    critical_label = terminology.get("critical_path_label")

    # ヘッダ行の列名を書き換え
    for ci in range(1, ws.max_column + 1):
        cell = ws.cell(row=1, column=ci)
        if cell.value in header_map:
            cell.value = header_map[cell.value]

    # AI適合性列を探す
    fit_col = None
    critical_col = None
    for ci in range(1, ws.max_column + 1):
        h = ws.cell(row=1, column=ci).value
        if h in ("AIの任せやすさ", "AI適合性"):
            fit_col = ci
        if h in ("全体への影響度", "クリティカル"):
            critical_col = ci

    # AI適合度の「高/中/低」を平易ラベルに
    if fit_col and fit_label_map:
        for ri in range(2, ws.max_row + 1):
            cell = ws.cell(row=ri, column=fit_col)
            if cell.value in fit_label_map:
                cell.value = fit_label_map[cell.value]

    # クリティカルパス表記を変更
    if critical_col and critical_label:
        for ri in range(2, ws.max_row + 1):
            cell = ws.cell(row=ri, column=critical_col)
            if cell.value == "★ クリティカル":
                cell.value = critical_label


# ─────────────────────────────────────────────
# Sheet 3: DAGシートの差し替え＋対応表追加
# ─────────────────────────────────────────────
def replace_dag_image(ws, custom_dag_path: str, block_mapping: list,
                     subtitle: str = None):
    """DAGシートの画像を差し替え、業務ブロック対応表を追加"""
    # 既存画像を削除
    ws._images = []

    # サブタイトル追加（任意）
    if subtitle:
        ws.merge_cells("A2:N2")
        sub = ws.cell(row=2, column=1, value=subtitle)
        sub.font = Font(italic=True, color="595959", size=10, name="Meiryo UI")
        sub.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[2].height = 24

    # カスタムDAG画像の挿入（アスペクト比を保持）
    if custom_dag_path and os.path.exists(custom_dag_path):
        from PIL import Image as PILImage
        with PILImage.open(custom_dag_path) as pil_img:
            aspect = pil_img.size[0] / pil_img.size[1]

        img = XLImage(custom_dag_path)
        img.width = 900
        img.height = int(900 / aspect)
        ws.add_image(img, "A4")

    # 業務ブロック対応表の追加
    if block_mapping:
        caption_row = 41
        ws.merge_cells(f"A{caption_row}:N{caption_row}")
        cap_title = ws.cell(row=caption_row, column=1,
                            value="── 図の業務ブロックと、タスク一覧の作業の対応 ──")
        cap_title.font = Font(bold=True, color="1F3864", size=11, name="Meiryo UI")
        cap_title.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[caption_row].height = 28

        start_row = caption_row + 1
        for i, item in enumerate(block_mapping):
            block = item.get("block", "")
            ids = item.get("tasks", "")
            r = start_row + i
            ws.row_dimensions[r].height = 22

            c1 = ws.cell(row=r, column=1, value=block)
            c1.font = Font(bold=True, color="1F3864", size=10, name="Meiryo UI")
            c1.alignment = Alignment(horizontal="center", vertical="center")
            c1.fill = PatternFill("solid", fgColor="D6E4F0")
            ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=2)

            c2 = ws.cell(row=r, column=3, value=ids)
            c2.font = Font(color="000000", size=10, name="Meiryo UI")
            c2.alignment = Alignment(horizontal="left", vertical="center", indent=1)
            ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=14)

        # 列幅調整
        ws.column_dimensions["A"].width = 12
        ws.column_dimensions["B"].width = 12
        for col in range(3, 15):
            ws.column_dimensions[get_column_letter(col)].width = 12


# ─────────────────────────────────────────────
# Sheet 4: ロードマップの平易化
# ─────────────────────────────────────────────
def enhance_roadmap_sheet(ws, terminology: dict):
    """ロードマップシートの表現を平易化"""
    # タイトル
    roadmap_title = terminology.get("roadmap_title")
    if roadmap_title:
        ws.cell(row=1, column=1).value = roadmap_title

    # 列ヘッダ
    header_map = terminology.get("roadmap_headers", {})
    for ci in range(1, 6):
        cell = ws.cell(row=2, column=ci)
        if cell.value in header_map:
            cell.value = header_map[cell.value]

    # フェーズ名の書き換え
    phase_label_map = terminology.get("phase_labels", {})
    for ri in range(3, 6):
        cell = ws.cell(row=ri, column=1)
        if cell.value in phase_label_map:
            cell.value = phase_label_map[cell.value]

    # 注意事項列(5列目)の書き換え
    caution_map = terminology.get("caution_phrases", {})
    for ri in range(3, 6):
        cell = ws.cell(row=ri, column=5)
        if cell.value in caution_map:
            cell.value = caution_map[cell.value]
        cell.alignment = Alignment(wrap_text=True, vertical="center")

    # 効果列(4列目)の表現置換
    effect_map = terminology.get("effect_phrases", {})
    for ri in range(3, 6):
        cell = ws.cell(row=ri, column=4)
        if cell.value:
            v = cell.value
            for old, new in effect_map.items():
                v = v.replace(old, new)
            cell.value = v
        cell.alignment = Alignment(wrap_text=True, vertical="center")

    # 注記行（Human-in-the-loop原則）の柔らかい表現への置換
    governance_note = terminology.get("governance_note")
    if governance_note:
        for ri in range(6, 12):
            cell = ws.cell(row=ri, column=1)
            if cell.value and "Human-in-the-loop" in str(cell.value):
                cell.value = governance_note
                cell.font = Font(italic=True, color="595959", size=9, name="Meiryo UI")
                cell.alignment = Alignment(horizontal="left", vertical="center",
                                           wrap_text=True)


# ─────────────────────────────────────────────
# 用語の自動置換（description内の専門用語）
# ─────────────────────────────────────────────
def substitute_terminology_in_cells(ws, terminology: dict):
    """全セルの文字列に対し、専門用語を平易表現に置換する"""
    substitutions = terminology.get("terminology_substitutions", {})
    # _comment フィールドはスキップ
    substitutions = {k: v for k, v in substitutions.items()
                     if not k.startswith("_")}
    if not substitutions:
        return

    for row in ws.iter_rows():
        for cell in row:
            if cell.value and isinstance(cell.value, str):
                v = cell.value
                changed = False
                for old, new in substitutions.items():
                    if old in v:
                        v = v.replace(old, new)
                        changed = True
                if changed:
                    cell.value = v


# ─────────────────────────────────────────────
# メイン処理
# ─────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="AI活用診断レポートの強化（読者層変換・DAG差し替え・対応表追加）"
    )
    parser.add_argument("--input", required=True,
                        help="generate_report.py が生成したExcelファイル")
    parser.add_argument("--output", required=True,
                        help="出力Excelファイル")
    parser.add_argument("--audience", choices=["executive", "practitioner"],
                        default="practitioner",
                        help="読者層: executive=経営者向け平易表現 / practitioner=実務者向け")
    parser.add_argument("--custom-dag-image", default=None,
                        help="差し替え用のDAG画像（PNG）。Step 3で描いたSVGのエクスポート画像")
    parser.add_argument("--block-mapping", default=None,
                        help="業務ブロック対応表のJSONファイル")
    parser.add_argument("--terminology", default=str(DEFAULT_TERMINOLOGY),
                        help=f"用語辞書JSON（デフォルト: {DEFAULT_TERMINOLOGY}）")
    args = parser.parse_args()

    # 入力チェック
    if not os.path.exists(args.input):
        print(f"[エラー] 入力ファイルが見つかりません: {args.input}", file=sys.stderr)
        sys.exit(1)

    # コピーして編集
    shutil.copy(args.input, args.output)
    wb = openpyxl.load_workbook(args.output)

    # 用語辞書ロード（executive モード時のみ適用）
    terminology = {}
    if args.audience == "executive":
        terminology = load_terminology(Path(args.terminology))
        print(f"[1/4] 用語辞書ロード: {args.terminology}")

    # ブロック対応表ロード
    block_mapping = []
    if args.block_mapping and os.path.exists(args.block_mapping):
        with open(args.block_mapping, encoding="utf-8") as f:
            block_mapping = json.load(f)
        print(f"[2/4] ブロック対応表ロード: {args.block_mapping}（{len(block_mapping)}項目）")
    else:
        print("[2/4] ブロック対応表: なし（スキップ）")

    # シート別の処理
    sheet_names = wb.sheetnames

    # Sheet 1: サマリー
    if sheet_names:
        ws1 = wb.worksheets[0]
        if terminology:
            enhance_summary_sheet(ws1, terminology)
            substitute_terminology_in_cells(ws1, terminology)

    # Sheet 2: タスク一覧
    task_sheet_candidates = [s for s in sheet_names if "タスク" in s]
    if task_sheet_candidates:
        ws2 = wb[task_sheet_candidates[0]]
        if terminology:
            enhance_task_sheet(ws2, terminology)
            substitute_terminology_in_cells(ws2, terminology)

    # Sheet 3: DAG
    dag_sheet_candidates = [s for s in sheet_names if "DAG" in s or "依存" in s]
    if dag_sheet_candidates:
        ws3 = wb[dag_sheet_candidates[0]]
        subtitle = terminology.get("dag_subtitle") if terminology else None
        if args.custom_dag_image or block_mapping:
            replace_dag_image(ws3, args.custom_dag_image, block_mapping, subtitle)
            print(f"[3/4] DAGシート更新: 画像差し替え={bool(args.custom_dag_image)}, "
                  f"対応表追加={bool(block_mapping)}")

    # Sheet 4: ロードマップ
    roadmap_sheet_candidates = [s for s in sheet_names
                                if "ロードマップ" in s or "導入" in s]
    if roadmap_sheet_candidates:
        ws4 = wb[roadmap_sheet_candidates[0]]
        if terminology:
            enhance_roadmap_sheet(ws4, terminology)
            substitute_terminology_in_cells(ws4, terminology)

    wb.save(args.output)
    print(f"[4/4] 保存完了: {args.output}")
    print(f"\n完了！ 読者層={args.audience}")


if __name__ == "__main__":
    main()

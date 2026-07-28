#!/usr/bin/env python3
"""
AI Readiness Diagnostic Report Generator
ヒアリング結果からタスクDAGを構築し、Excel診断レポートを生成するスクリプト。

Usage:
    python3 generate_report.py --input tasks.json --output report.xlsx
    python3 generate_report.py --demo  # サンプルデータで動作確認
"""

import argparse
import json
import sys
import os
from datetime import datetime

import networkx as nx
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.font_manager as fm
import openpyxl
from openpyxl.styles import (
    PatternFill, Font, Alignment, Border, Side, GradientFill
)
from openpyxl.utils import get_column_letter
from openpyxl.drawing.image import Image as XLImage

# ─────────────────────────────────────────────
# 日本語フォントの設定
# ─────────────────────────────────────────────
def setup_japanese_font():
    """利用可能な日本語フォントを探して設定する"""
    candidates = [
        "Noto Sans CJK JP", "Noto Sans JP", "IPAGothic", "IPAPGothic",
        "VL Gothic", "TakaoGothic", "DejaVu Sans"
    ]
    available = {f.name for f in fm.fontManager.ttflist}
    for font in candidates:
        if font in available:
            plt.rcParams["font.family"] = font
            return font
    plt.rcParams["font.family"] = "DejaVu Sans"
    return "DejaVu Sans"

# ─────────────────────────────────────────────
# データ構造
# ─────────────────────────────────────────────
# タスクのJSONスキーマ:
# {
#   "business_name": "月次決算業務",
#   "company": "株式会社サンプル",
#   "interviewer_notes": "...",
#   "tasks": [
#     {
#       "id": "T01",
#       "name": "売上データの収集",
#       "description": "各部門から売上データをExcelで収集する",
#       "input": "各部門のExcelファイル",
#       "output": "統合売上データ",
#       "owner": "経理部",
#       "duration_hours": 4,
#       "frequency": "月次",
#       "is_confidential": false,
#       "requires_human_approval": false,
#       "ai_fit": "高",           # 高/中/低
#       "ai_fit_reason": "反復的なデータ集計作業",
#       "ai_role": "自動集計・フォーマット統一",
#       "dependencies": []        # 先行タスクのIDリスト
#     },
#     ...
#   ]
# }

DEMO_DATA = {
    "business_name": "月次決算業務",
    "company": "株式会社サンプル",
    "interviewer_notes": "毎月末に4〜5日かかる。データ収集と転記作業が最大のボトルネック。",
    "tasks": [
        {
            "id": "T01",
            "name": "売上データ収集",
            "description": "各部門から売上データをExcelで収集する",
            "input": "各部門のExcelファイル（メール添付）",
            "output": "統合前の売上データ群",
            "owner": "経理部",
            "duration_hours": 4,
            "frequency": "月次",
            "is_confidential": False,
            "requires_human_approval": False,
            "ai_fit": "高",
            "ai_fit_reason": "定型フォーマットの反復収集作業。メール添付ファイルの自動取り込みが可能",
            "ai_role": "メール自動仕分け・ファイル収集・フォーマット統一",
            "dependencies": []
        },
        {
            "id": "T02",
            "name": "データ転記・統合",
            "description": "収集したExcelを1つのマスターシートに転記・統合する",
            "input": "各部門のExcelファイル",
            "output": "統合売上マスターシート",
            "owner": "経理部",
            "duration_hours": 6,
            "frequency": "月次",
            "is_confidential": False,
            "requires_human_approval": False,
            "ai_fit": "高",
            "ai_fit_reason": "ルールベースの転記作業。エラー検知も自動化可能",
            "ai_role": "自動転記・重複チェック・集計",
            "dependencies": ["T01"]
        },
        {
            "id": "T03",
            "name": "仕訳入力",
            "description": "統合データをもとに会計システムへ仕訳を入力する",
            "input": "統合売上マスターシート",
            "output": "会計システムへの入力済み仕訳",
            "owner": "経理部",
            "duration_hours": 5,
            "frequency": "月次",
            "is_confidential": True,
            "requires_human_approval": True,
            "ai_fit": "中",
            "ai_fit_reason": "仕訳パターンはルール化できるが、例外処理と最終確認は人間が必要",
            "ai_role": "仕訳下書き作成・パターンマッチング（最終承認は人間）",
            "dependencies": ["T02"]
        },
        {
            "id": "T04",
            "name": "差異分析",
            "description": "前月比・予算比の差異を分析し、コメントを作成する",
            "input": "会計システムの試算表",
            "output": "差異分析コメント",
            "owner": "CFO・経理部長",
            "duration_hours": 3,
            "frequency": "月次",
            "is_confidential": True,
            "requires_human_approval": False,
            "ai_fit": "中",
            "ai_fit_reason": "数値の比較・コメント下書きはAI可能。経営判断を伴う解釈は人間が担う",
            "ai_role": "差異計算・コメント下書き生成",
            "dependencies": ["T03"]
        },
        {
            "id": "T05",
            "name": "経営報告書作成",
            "description": "取締役会向けの月次経営報告書を作成する",
            "input": "差異分析コメント・試算表",
            "output": "月次経営報告書（PowerPoint）",
            "owner": "CFO",
            "duration_hours": 4,
            "frequency": "月次",
            "is_confidential": True,
            "requires_human_approval": True,
            "ai_fit": "中",
            "ai_fit_reason": "スライド構成・数値の自動挿入はAI可能。経営メッセージは人間が執筆",
            "ai_role": "テンプレートへの数値自動挿入・スライド構成案の作成",
            "dependencies": ["T04"]
        },
        {
            "id": "T06",
            "name": "監査対応資料準備",
            "description": "外部監査法人への証憑資料を整理・提出する",
            "input": "会計データ・証憑書類",
            "output": "監査対応ファイル一式",
            "owner": "経理部",
            "duration_hours": 8,
            "frequency": "四半期",
            "is_confidential": True,
            "requires_human_approval": True,
            "ai_fit": "低",
            "ai_fit_reason": "法的・コンプライアンス上の重要性が高く、最終判断は必ず人間が行う必要がある",
            "ai_role": "書類チェックリスト作成・ファイル整理補助のみ",
            "dependencies": ["T03"]
        },
        {
            "id": "T07",
            "name": "請求書処理",
            "description": "仕入先からの請求書を受領・照合・支払い登録する",
            "input": "請求書（PDF・紙）",
            "output": "支払い登録済みデータ",
            "owner": "経理部",
            "duration_hours": 5,
            "frequency": "月次",
            "is_confidential": False,
            "requires_human_approval": True,
            "ai_fit": "高",
            "ai_fit_reason": "OCRによるデータ抽出・照合は自動化の親和性が高い",
            "ai_role": "OCR読み取り・発注データとの自動照合・支払い登録下書き",
            "dependencies": []
        }
    ]
}

# ─────────────────────────────────────────────
# カラーパレット
# ─────────────────────────────────────────────
COLOR = {
    "high":     {"hex": "C6EFCE", "font": "276221", "label": "高"},
    "medium":   {"hex": "FFEB9C", "font": "9C5700", "label": "中"},
    "low":      {"hex": "FFC7CE", "font": "9C0006", "label": "低"},
    "header":   {"hex": "1F3864", "font": "FFFFFF"},
    "subheader":{"hex": "2F5496", "font": "FFFFFF"},
    "section":  {"hex": "D6E4F0", "font": "1F3864"},
    "alt_row":  {"hex": "F2F7FB", "font": "000000"},
    "border":   "B8CCE4",
    "dag_high": "#2ECC71",
    "dag_med":  "#F39C12",
    "dag_low":  "#E74C3C",
    "dag_edge": "#7F8C8D",
}

def fit_color(ai_fit: str) -> dict:
    mapping = {"高": COLOR["high"], "中": COLOR["medium"], "低": COLOR["low"]}
    return mapping.get(ai_fit, COLOR["medium"])

# ─────────────────────────────────────────────
# DAG構築
# ─────────────────────────────────────────────
def build_dag(tasks: list) -> nx.DiGraph:
    G = nx.DiGraph()
    for t in tasks:
        G.add_node(t["id"], **t)
    for t in tasks:
        for dep in t.get("dependencies", []):
            G.add_edge(dep, t["id"])
    if not nx.is_directed_acyclic_graph(G):
        raise ValueError("タスク依存関係にサイクルが検出されました。依存関係を見直してください。")
    return G

def compute_dag_metrics(G: nx.DiGraph, tasks: list) -> list:
    """各タスクにDAGメトリクス（トポロジカル順序・並列グループ・クリティカルパス）を付与"""
    task_map = {t["id"]: t for t in tasks}

    # トポロジカルソート
    topo_order = list(nx.topological_sort(G))

    # 最早開始時刻（EST）の計算
    est = {}
    for node in topo_order:
        preds = list(G.predecessors(node))
        if not preds:
            est[node] = 0
        else:
            est[node] = max(
                est[p] + task_map[p]["duration_hours"] for p in preds
            )

    # 並列グループ（同じESTを持つタスクは並列実行可能）
    groups = {}
    for node in topo_order:
        g = est[node]
        groups.setdefault(g, []).append(node)

    parallel_group = {}
    for g_idx, (_, nodes) in enumerate(sorted(groups.items()), 1):
        for node in nodes:
            parallel_group[node] = g_idx

    # クリティカルパスの特定
    critical_path = set(nx.dag_longest_path(G))

    # 各タスクにメトリクスを付与
    enriched = []
    for t in tasks:
        tid = t["id"]
        enriched.append({
            **t,
            "topo_order":      topo_order.index(tid) + 1,
            "est_hours":       est[tid],
            "parallel_group":  parallel_group[tid],
            "is_critical_path": tid in critical_path,
        })
    return enriched

# ─────────────────────────────────────────────
# DAG可視化（PNG出力）
# ─────────────────────────────────────────────
def hierarchical_layout(G: nx.DiGraph) -> dict:
    """トポロジカル順序に基づく左→右の階層レイアウトを手動計算する"""
    topo = list(nx.topological_sort(G))
    # 各ノードの「層」を最長パスで決定
    layer = {}
    for node in topo:
        preds = list(G.predecessors(node))
        layer[node] = max((layer[p] + 1 for p in preds), default=0)

    # 同一層のノードをy方向に並べる
    from collections import defaultdict
    layer_nodes = defaultdict(list)
    for node, l in layer.items():
        layer_nodes[l].append(node)

    pos = {}
    x_gap = 4.5
    y_gap = 2.5
    for l, nodes in sorted(layer_nodes.items()):
        n = len(nodes)
        for i, node in enumerate(nodes):
            x = l * x_gap
            y = (i - (n - 1) / 2.0) * y_gap
            pos[node] = (x, -y)  # y反転で上から下へ
    return pos

def render_dag(G: nx.DiGraph, tasks: list, output_path: str, font_name: str):
    task_map = {t["id"]: t for t in tasks}
    fig, ax = plt.subplots(figsize=(18, 10))
    ax.set_facecolor("#F8FBFF")
    fig.patch.set_facecolor("#F8FBFF")

    # レイアウト：階層的に配置（左→右）
    pos = hierarchical_layout(G)

    # ノードの色設定
    node_colors = []
    for node in G.nodes():
        fit = task_map[node]["ai_fit"]
        if fit == "高":
            node_colors.append(COLOR["dag_high"])
        elif fit == "中":
            node_colors.append(COLOR["dag_med"])
        else:
            node_colors.append(COLOR["dag_low"])

    # クリティカルパスのエッジを強調
    critical_path_nodes = set(nx.dag_longest_path(G))
    edge_colors = []
    edge_widths = []
    for u, v in G.edges():
        if u in critical_path_nodes and v in critical_path_nodes:
            edge_colors.append("#C0392B")
            edge_widths.append(3.0)
        else:
            edge_colors.append(COLOR["dag_edge"])
            edge_widths.append(1.5)

    nx.draw_networkx_edges(
        G, pos, ax=ax,
        edge_color=edge_colors, width=edge_widths,
        arrows=True, arrowsize=20,
        connectionstyle="arc3,rad=0.05"
    )
    nx.draw_networkx_nodes(
        G, pos, ax=ax,
        node_color=node_colors, node_size=3600,
        alpha=0.95, linewidths=2.5, edgecolors="#2C3E50"
    )

    # ラベル（ID + 名前）
    labels = {}
    for node in G.nodes():
        name = task_map[node]["name"]
        short = name if len(name) <= 7 else name[:6] + "…"
        labels[node] = f"{node}\n{short}"
    nx.draw_networkx_labels(
        G, pos, labels, ax=ax,
        font_size=10, font_family=font_name, font_color="white", font_weight="bold"
    )

    # 凡例
    legend_handles = [
        mpatches.Patch(color=COLOR["dag_high"], label="AI適合性：高"),
        mpatches.Patch(color=COLOR["dag_med"],  label="AI適合性：中"),
        mpatches.Patch(color=COLOR["dag_low"],  label="AI適合性：低"),
        mpatches.Patch(color="#C0392B",         label="クリティカルパス"),
    ]
    ax.legend(handles=legend_handles, loc="upper left", fontsize=10,
              prop={"family": font_name, "size": 10})

    ax.set_title("タスク依存関係 DAG（AI適合性マッピング）",
                 fontsize=14, fontfamily=font_name, pad=15, fontweight="bold")
    ax.axis("off")
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()

# ─────────────────────────────────────────────
# Excelレポート生成
# ─────────────────────────────────────────────
def thin_border():
    s = Side(style="thin", color=COLOR["border"])
    return Border(left=s, right=s, top=s, bottom=s)

def header_style(ws, row, col, value, bg=None, font_color=None, bold=True, size=11):
    cell = ws.cell(row=row, column=col, value=value)
    bg = bg or COLOR["header"]["hex"]
    fc = font_color or COLOR["header"]["font"]
    cell.fill = PatternFill("solid", fgColor=bg)
    cell.font = Font(bold=bold, color=fc, size=size, name="Meiryo UI")
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    cell.border = thin_border()
    return cell

def data_cell(ws, row, col, value, bg=None, bold=False, align="left", wrap=True):
    cell = ws.cell(row=row, column=col, value=value)
    if bg:
        cell.fill = PatternFill("solid", fgColor=bg)
    cell.font = Font(bold=bold, size=10, name="Meiryo UI")
    cell.alignment = Alignment(horizontal=align, vertical="center", wrap_text=wrap)
    cell.border = thin_border()
    return cell

def generate_excel(data: dict, enriched_tasks: list, dag_image_path: str, output_path: str):
    wb = openpyxl.Workbook()

    # ─── Sheet 1: サマリー ───────────────────────────
    ws1 = wb.active
    ws1.title = "📊 診断サマリー"
    ws1.sheet_view.showGridLines = False
    ws1.column_dimensions["A"].width = 22
    ws1.column_dimensions["B"].width = 55

    # タイトルブロック
    ws1.merge_cells("A1:B1")
    c = ws1.cell(row=1, column=1, value="AI活用可能性 診断レポート")
    c.fill = PatternFill("solid", fgColor=COLOR["header"]["hex"])
    c.font = Font(bold=True, color=COLOR["header"]["font"], size=16, name="Meiryo UI")
    c.alignment = Alignment(horizontal="center", vertical="center")
    ws1.row_dimensions[1].height = 40

    meta = [
        ("対象業務",   data.get("business_name", "")),
        ("会社名",     data.get("company", "")),
        ("診断日",     datetime.now().strftime("%Y年%m月%d日")),
        ("ヒアリングメモ", data.get("interviewer_notes", "")),
    ]
    for i, (k, v) in enumerate(meta, start=2):
        ws1.row_dimensions[i].height = 28
        data_cell(ws1, i, 1, k, bg=COLOR["section"]["hex"], bold=True, align="center")
        data_cell(ws1, i, 2, v)

    # 集計
    total = len(enriched_tasks)
    high  = sum(1 for t in enriched_tasks if t["ai_fit"] == "高")
    med   = sum(1 for t in enriched_tasks if t["ai_fit"] == "中")
    low   = sum(1 for t in enriched_tasks if t["ai_fit"] == "低")
    total_h = sum(t["duration_hours"] for t in enriched_tasks)
    auto_h  = sum(t["duration_hours"] for t in enriched_tasks if t["ai_fit"] == "高")
    assist_h= sum(t["duration_hours"] for t in enriched_tasks if t["ai_fit"] == "中")

    ws1.row_dimensions[7].height = 30
    ws1.merge_cells("A7:B7")
    header_style(ws1, 7, 1, "■ 集計結果", bg=COLOR["subheader"]["hex"], size=12)

    summary_rows = [
        ("総タスク数",          f"{total} タスク"),
        ("AI適合性：高",        f"{high} タスク（自動化・大幅効率化が見込める）"),
        ("AI適合性：中",        f"{med} タスク（AIによる補助・下書き生成が有効）"),
        ("AI適合性：低",        f"{low} タスク（人間の判断・監督が必要）"),
        ("月次総工数",          f"{total_h:.1f} 時間"),
        ("AI自動化見込み工数",  f"{auto_h:.1f} 時間（{auto_h/total_h*100:.0f}%）"),
        ("AI補助見込み工数",    f"{assist_h:.1f} 時間（{assist_h/total_h*100:.0f}%）"),
    ]
    for i, (k, v) in enumerate(summary_rows, start=8):
        ws1.row_dimensions[i].height = 24
        data_cell(ws1, i, 1, k, bg=COLOR["alt_row"]["hex"], bold=True, align="center")
        data_cell(ws1, i, 2, v)

    # ─── Sheet 2: タスク一覧 ─────────────────────────
    ws2 = wb.create_sheet("📋 タスク一覧")
    ws2.sheet_view.showGridLines = False

    col_defs = [
        ("ID",           8),
        ("タスク名",     22),
        ("説明",         38),
        ("入力",         22),
        ("出力",         22),
        ("担当者",       14),
        ("工数(h)",       9),
        ("頻度",          9),
        ("機密情報",      9),
        ("要承認",        9),
        ("AI適合性",     10),
        ("AI活用理由",   38),
        ("AIの役割",     38),
        ("先行タスク",   14),
        ("実行順序",      9),
        ("並列グループ", 12),
        ("クリティカル", 12),
        ("最早開始(h)",  12),
    ]
    for ci, (title, width) in enumerate(col_defs, start=1):
        ws2.column_dimensions[get_column_letter(ci)].width = width
        header_style(ws2, 1, ci, title)
    ws2.row_dimensions[1].height = 32
    ws2.freeze_panes = "A2"

    for ri, t in enumerate(enriched_tasks, start=2):
        ws2.row_dimensions[ri].height = 52
        row_bg = None if ri % 2 == 0 else COLOR["alt_row"]["hex"]
        fc = fit_color(t["ai_fit"])

        data_cell(ws2, ri, 1,  t["id"],              bg=row_bg, bold=True, align="center")
        data_cell(ws2, ri, 2,  t["name"],             bg=row_bg, bold=True)
        data_cell(ws2, ri, 3,  t["description"],      bg=row_bg)
        data_cell(ws2, ri, 4,  t["input"],            bg=row_bg)
        data_cell(ws2, ri, 5,  t["output"],           bg=row_bg)
        data_cell(ws2, ri, 6,  t["owner"],            bg=row_bg, align="center")
        data_cell(ws2, ri, 7,  t["duration_hours"],   bg=row_bg, align="center")
        data_cell(ws2, ri, 8,  t["frequency"],        bg=row_bg, align="center")
        data_cell(ws2, ri, 9,  "●" if t["is_confidential"] else "○",
                  bg=row_bg, align="center",
                  bold=t["is_confidential"])
        data_cell(ws2, ri, 10, "●" if t["requires_human_approval"] else "○",
                  bg=row_bg, align="center",
                  bold=t["requires_human_approval"])

        # AI適合性セル（色付き）
        fit_cell = ws2.cell(row=ri, column=11, value=t["ai_fit"])
        fit_cell.fill = PatternFill("solid", fgColor=fc["hex"])
        fit_cell.font = Font(bold=True, color=fc["font"], size=11, name="Meiryo UI")
        fit_cell.alignment = Alignment(horizontal="center", vertical="center")
        fit_cell.border = thin_border()

        data_cell(ws2, ri, 12, t["ai_fit_reason"],    bg=row_bg)
        data_cell(ws2, ri, 13, t["ai_role"],          bg=row_bg)
        deps = ", ".join(t.get("dependencies", [])) or "なし"
        data_cell(ws2, ri, 14, deps,                  bg=row_bg, align="center")
        data_cell(ws2, ri, 15, t["topo_order"],       bg=row_bg, align="center")
        data_cell(ws2, ri, 16, t["parallel_group"],   bg=row_bg, align="center")

        cp_cell = ws2.cell(row=ri, column=17,
                           value="★ クリティカル" if t["is_critical_path"] else "")
        cp_bg = "FFE0E0" if t["is_critical_path"] else (row_bg or "FFFFFF")
        cp_cell.fill = PatternFill("solid", fgColor=cp_bg)
        cp_cell.font = Font(bold=t["is_critical_path"], color="C00000" if t["is_critical_path"] else "000000",
                            size=10, name="Meiryo UI")
        cp_cell.alignment = Alignment(horizontal="center", vertical="center")
        cp_cell.border = thin_border()

        data_cell(ws2, ri, 18, t["est_hours"],        bg=row_bg, align="center")

    # ─── Sheet 3: DAGビジュアル ───────────────────────
    ws3 = wb.create_sheet("🔗 依存関係DAG")
    ws3.sheet_view.showGridLines = False
    ws3.merge_cells("A1:N1")
    c = ws3.cell(row=1, column=1, value="タスク依存関係 DAG（AI適合性マッピング）")
    c.fill = PatternFill("solid", fgColor=COLOR["header"]["hex"])
    c.font = Font(bold=True, color=COLOR["header"]["font"], size=14, name="Meiryo UI")
    c.alignment = Alignment(horizontal="center", vertical="center")
    ws3.row_dimensions[1].height = 36

    if os.path.exists(dag_image_path):
        img = XLImage(dag_image_path)
        img.width  = 900
        img.height = 506
        ws3.add_image(img, "A3")
        for r in range(3, 40):
            ws3.row_dimensions[r].height = 15

    # ─── Sheet 4: ロードマップ ────────────────────────
    ws4 = wb.create_sheet("🚀 導入ロードマップ")
    ws4.sheet_view.showGridLines = False
    ws4.column_dimensions["A"].width = 16
    ws4.column_dimensions["B"].width = 24
    ws4.column_dimensions["C"].width = 45
    ws4.column_dimensions["D"].width = 30
    ws4.column_dimensions["E"].width = 30

    ws4.merge_cells("A1:E1")
    c = ws4.cell(row=1, column=1, value="AI導入ロードマップ（推奨フェーズ）")
    c.fill = PatternFill("solid", fgColor=COLOR["header"]["hex"])
    c.font = Font(bold=True, color=COLOR["header"]["font"], size=14, name="Meiryo UI")
    c.alignment = Alignment(horizontal="center", vertical="center")
    ws4.row_dimensions[1].height = 36

    for ci, (title, _) in enumerate([
        ("フェーズ", 16), ("対象タスク", 24), ("AIの役割", 45),
        ("期待効果", 30), ("注意事項", 30)
    ], start=1):
        header_style(ws4, 2, ci, title, bg=COLOR["subheader"]["hex"])
    ws4.row_dimensions[2].height = 28

    # フェーズ1: AI適合性「高」のタスクを優先
    high_tasks = [t for t in enriched_tasks if t["ai_fit"] == "高"]
    med_tasks  = [t for t in enriched_tasks if t["ai_fit"] == "中"]
    low_tasks  = [t for t in enriched_tasks if t["ai_fit"] == "低"]

    phases = [
        (
            "フェーズ1\n（〜3ヶ月）",
            "\n".join(f"{t['id']}: {t['name']}" for t in high_tasks) or "—",
            "\n".join(t["ai_role"] for t in high_tasks) or "—",
            f"月次工数を最大 {sum(t['duration_hours'] for t in high_tasks):.0f}h 削減見込み",
            "フォーマット標準化が前提条件。まず1タスクで試験運用を推奨"
        ),
        (
            "フェーズ2\n（3〜6ヶ月）",
            "\n".join(f"{t['id']}: {t['name']}" for t in med_tasks) or "—",
            "\n".join(t["ai_role"] for t in med_tasks) or "—",
            f"AI補助により品質向上・{sum(t['duration_hours'] for t in med_tasks):.0f}h相当の工数削減見込み",
            "最終承認は必ず人間が実施。AI出力のレビュープロセスを設計すること"
        ),
        (
            "フェーズ3\n（6ヶ月〜）",
            "\n".join(f"{t['id']}: {t['name']}" for t in low_tasks) or "—",
            "\n".join(t["ai_role"] for t in low_tasks) or "—",
            "補助的な活用に留め、人間の監督コストを最小化",
            "機密情報・法的判断を含むため、AIは補助ツールに限定。外部送信禁止"
        ),
    ]

    for ri, (phase, tasks_str, roles, effect, caution) in enumerate(phases, start=3):
        ws4.row_dimensions[ri].height = 80
        bg = COLOR["alt_row"]["hex"] if ri % 2 == 0 else None
        data_cell(ws4, ri, 1, phase,     bg=COLOR["section"]["hex"], bold=True, align="center")
        data_cell(ws4, ri, 2, tasks_str, bg=bg)
        data_cell(ws4, ri, 3, roles,     bg=bg)
        data_cell(ws4, ri, 4, effect,    bg=bg)
        data_cell(ws4, ri, 5, caution,   bg=bg)

    # 注記行
    ws4.row_dimensions[6].height = 20
    ws4.merge_cells("A7:E7")
    note = ws4.cell(row=7, column=1,
                    value="※ 機密情報・個人情報を含む業務では、必ずアクセス制限を設け、最終判断は人間が行うことを徹底してください（Human-in-the-loop原則）")
    note.font = Font(italic=True, color="C00000", size=9, name="Meiryo UI")
    note.alignment = Alignment(horizontal="left", vertical="center")

    wb.save(output_path)
    print(f"[✓] Excelレポートを生成しました: {output_path}")

# ─────────────────────────────────────────────
# メインエントリポイント
# ─────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="AI Readiness Diagnostic Report Generator")
    parser.add_argument("--input",  help="タスクJSONファイルのパス")
    parser.add_argument("--output", default="AI活用診断レポート.xlsx", help="出力Excelファイル名")
    parser.add_argument("--demo",   action="store_true", help="サンプルデータで実行")
    args = parser.parse_args()

    if args.demo:
        data = DEMO_DATA
    elif args.input:
        with open(args.input, encoding="utf-8") as f:
            data = json.load(f)
    else:
        print("--input または --demo を指定してください。")
        sys.exit(1)

    print("[1/4] 日本語フォントを設定中...")
    font_name = setup_japanese_font()
    print(f"      使用フォント: {font_name}")

    print("[2/4] DAGを構築中...")
    G = build_dag(data["tasks"])
    enriched = compute_dag_metrics(G, data["tasks"])
    print(f"      タスク数: {len(enriched)}, エッジ数: {G.number_of_edges()}")

    print("[3/4] DAGを可視化中...")
    dag_img = args.output.replace(".xlsx", "_dag.png")
    render_dag(G, data["tasks"], dag_img, font_name)
    print(f"      DAG画像: {dag_img}")

    print("[4/4] Excelレポートを生成中...")
    generate_excel(data, enriched, dag_img, args.output)

    print("\n完了！")
    print(f"  Excel: {args.output}")
    print(f"  DAG:   {dag_img}")

if __name__ == "__main__":
    main()

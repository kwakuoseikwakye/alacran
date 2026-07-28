# scripts/cycle/ — 業務サイクル運用スクリプト（advanced）

> **合宿の必須範囲外です**。合宿本編（Phase 1〜5 の 5 サイクル）は plain Claude Code +
> `scripts/verify.py` だけで完結します。ここは日次・週次で業務サイクルを回すチームが
> **自社導入後に** 使う advanced ツール群です。

## 何をするスクリプトか

| スクリプト | 役割 | 前提となる SSOT |
|-----------|------|----------------|
| `cycle-event.sh` | サイクルイベントを `state/cycles/<team-id>/cycle.jsonl` に append | `definitions/cycles/<team>-cycle-plan.yaml` |
| `cycle-verify.py` | サイクルの必須イベント抜けや schema 不整合を検証 | 同上 |
| `cycle-kpi-snapshot.py` | cycle.jsonl から `kpi.json` を集計（cycle_completion_rate 等の共通 2 KPI） | 同上 + `definitions/kpi/<team>-kpi.yaml` |
| `retro-render.py` | `docs/templates/retro-weekly.md` に KPI を差し込んで retro md を生成 | 同上 |
| `session-handoff.py` | サイクル境界で `HANDOFF.md` の該当節を自動更新 | `HANDOFF.md` の見出し規約 |

## 合宿本編との関係

CLAUDE.md §1 の 5-Phase 軽量ワークフロー（定義 → 計画 → 実行 → 検証 → 記録）は、
このディレクトリの Python スクリプトを一切呼び出さずに 1 サイクル完結できるように
設計されています。演習 3 本（`exercises/01-03`）もこのディレクトリには触れません。

このディレクトリが有用になるのは、次のいずれかを満たすタイミングです:

- 日次・週次で複数チームの業務サイクルを回し始めた（KPI 自動集計が欲しくなる）
- HANDOFF.md の更新頻度が高くなり、機械化したくなった
- サイクル完了率・HITL 介入率などの共通 2 KPI をトラッキングし始めた

## 使い方の入口

- 全体設計: `docs/concepts/context-funnel.md`（コンテキスト漏斗設計）
- スキーマ: `docs/templates/cycle-execution-log-schema.yaml`
- 出力先: `state/cycles/<team-id>/cycle.jsonl` と `docs/retros/<team-id>/`

## 参加者は編集不要

このディレクトリのスクリプトは「導入後の運用」に属するため、合宿中に読む・改造する
必要はありません。もし興味があれば、`retro-render.py` から順に読むと `retro-weekly.md`
テンプレートとの繋がりが見えます。

---

*ai-retreat-starter — scripts/cycle/ (advanced tools, 合宿本編の範囲外)*

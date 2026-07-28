---
name: create-epic
description: Epic Issue を起票し、3-6 個の子 Issue に分解して GitHub に登録する（Phase 2: 計画）
---

# /create-epic

Issue-First 原則（`.claude/rules/issue-first.md`）に従い、Epic Issue と子 Issue を GitHub に起票します。

## 初回セットアップ（ラベル準備）

"Use this template" でリポジトリを作成した直後は、テンプレ元にあった `type:epic` /
`type:child` / `phase:planning` ラベルはコピーされていない（GitHub の Template 機能は
ラベルを複製先に引き継がない）。起票前に一度だけ、実在確認と作成を行う。

```bash
gh label list
```

上記の出力に無いラベルがあれば作成する:

```bash
gh label create "type:epic" --color 5319E7 --description "Epic Issue（親）"
gh label create "type:child" --color 1D76DB --description "Epic 配下の子 Issue"
gh label create "phase:planning" --color 0E8A16 --description "Phase 2（計画）で起票"
```

> **注意**: ラベルが未存在のまま起票すると、実行手段によって挙動が異なる。
> `gh` CLI はエラーで起票そのものが失敗するが、GitHub API 経由・MCP 経由では
> 未存在ラベルが**色・説明なしで黙って自動生成**されてしまう。どちらの手段でも、
> 起票前に `gh label list` でラベルの実在を確認しておくこと。

## 進め方

1. ユーザーに以下を質問する（順番に、一度に全部聞かない）:
   - **Epic のゴールは何ですか？**（1-2 文で、完了したときに何が変わっているか）
   - **自然に分解できるサブタスクは何がありますか？**（3-6 個を目安に。多すぎる場合はさらに分解を提案する）
2. 既存の関連 Issue が無いか確認する:
   ```bash
   gh issue list --search "<キーワード>" --state all
   ```
   類似 Issue があれば重複起票を避け、ユーザーに確認する。
3. Epic Issue を作成する:
   ```bash
   gh issue create \
     --title "Epic: <ゴール>" \
     --label "type:epic,phase:planning" \
     --body "$(cat <<'EOF'
   ## ゴール
   <ユーザーの回答>

   ## 子 Issue
   - [ ] #<子Issue番号1> <タイトル>
   - [ ] #<子Issue番号2> <タイトル>
   ...

   ## 完了条件
   すべての子 Issue が Close されたら Epic を Close する。
   EOF
   )"
   ```
4. 子 Issue を 1 つずつ作成し、本文に Epic 番号を参照させる:
   ```bash
   gh issue create \
     --title "<子タスク名>" \
     --label "type:child,phase:planning" \
     --body "Epic: #<Epic番号>"
   ```
   作成コマンドの出力（Issue の URL）末尾から子 Issue 番号を都度控えておく。
5. 控えた子 Issue 番号をもとに、Epic Issue 本文をチェックリスト（実際の Issue 番号入り）に更新する:
   ```bash
   gh issue edit <Epic番号> --body "..."
   ```
6. 作成した Issue 一覧（Epic + 子 Issue の番号とタイトル）をユーザーに提示する。

## ラベル規約

| ラベル | 用途 |
|--------|------|
| `type:epic` | Epic Issue に付与 |
| `type:child` | 子 Issue に付与 |
| `phase:planning` | Phase 2（計画）で起票された Issue であることを示す |

## gh CLI が使えない環境

Claude Code on the web など `gh` CLI が使えない環境では、GitHub MCP ツールや GitHub の Web UI
から同等の Epic Issue / 子 Issue 起票を行ってよい。その場合も上記「初回セットアップ（ラベル準備）」
の注意はそのまま当てはまる — MCP 経由の起票は未存在ラベルを黙って自動生成するため、起票前に
ラベル一覧（Web UI の Issues > Labels、または MCP のラベル取得系ツール）で実在確認すること。

## Issue-First リマインダー

- 単純な typo・設定変更のような軽微な作業には Epic 分解は不要。通常 Issue 1 本で足りる場合は
  Epic 化せず、ユーザーにその旨を伝える。
- Epic のブランチ・コミット・PR には対応する子 Issue 番号を必ず含めること
  （`fix/12-description` / `fix(scope): description (#12)` / PR に `Resolves #12`）。
- 作業を始める前に Issue が存在することを確認する。無ければまずこのコマンドで起票する。

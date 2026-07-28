# オンボーディング・チェックリスト（新しい会社の立ち上げ）

> このテンプレを自社に導入するときの手順書です。必要なのは GitHub アカウント、
> Claude Code が使えるプラン、`git` と `python3` だけ。外部 SDK・MCP サーバーは要りません。

各ステップは上から順に。詰まったら `docs/starter-manual.md` と `CLAUDE.md` を再読してください。

---

## Step 1. リポジトリを用意する

- [ ] このテンプレを "Use this template" で自社の private リポジトリとして複製する
- [ ] 手元に clone する（`git clone <your-repo>`）
- [ ] `python3 --version` と `git --version` が通ることを確認する
- [ ] `pip3 install pyyaml`（`scripts/verify.py` が使う）

## Step 2. 運用憲法を読む

- [ ] `CLAUDE.md` を読む（5-Phase ワークフロー + 6 原則 + コンテキスト地図）
- [ ] `.claude/rules/` の 3 大規律（`scope-contract` / `issue-first` / `hitl-gate`）に目を通す
- [ ] `docs/directory-map.md` で「記入前 / 記入後」のフォルダ構成の違いを掴む

## Step 3. 完成例を眺める（1 分）

- [ ] `examples/harukaze-ec/` を開き、記入済みの会社がどう見えるか確認する
      （オントロジー・KPI・サイクル・振り返り・HITL・クライアント）
- [ ] 「読むだけ」。ここはコピー元にしない（自社定義は `definitions/` 側に作る）

## Step 4. 自社オントロジーを定義する（Phase 1）

- [ ] Claude Code で `/define-company` を実行する
- [ ] 対話に答えて `definitions/ontology/company.yaml` を生成する
- [ ] 業種固有の entity（例: EC なら `sku`）を追記する。記法は
      `docs/templates/ontology-schema-reference.md` を参照

## Step 5. 承認ゲートを整える（任意だが推奨）

- [ ] `.claude/rules/hitl-gate.md` のトリガー表に自社固有の行を足す
- [ ] 一定額の発注など個別トリガーが要るなら、`definitions/hitl/triggers/` に
      雛形（`large-deal.yaml` 等）をコピーして記入する
- [ ] 承認者が実質 1 人なら `definitions/hitl/approver-registry.yaml` を正直に埋める
      （代理は `vacant`。考え方は `docs/concepts/hitl-async-approval.md`）

## Step 6. KPI・サイクル・振り返りを立てる（任意）

- [ ] `docs/templates/kpi-measurement-template.yaml` を `definitions/kpi/<team>-kpi.yaml` に記入
- [ ] `docs/templates/cycle-plan-template.yaml` を `definitions/cycles/<team>-cycle-plan.yaml` に記入
- [ ] `docs/templates/retrospective-template.yaml` を `definitions/retro/<team>-retrospective.yaml` に記入
- [ ] `team_id` で対象チームを明示し、`<<TODO_*>>` を全部埋める

## Step 7. 検証する（Phase 4）

- [ ] `python3 scripts/verify.py`（または `/verify`）を実行する
- [ ] FAIL があれば中身を読んで直す（偽緑禁止。検証側を弱めない）
- [ ] 未記入の棚が INFO/SKIP で出るのは正常（段階的に育てる前提）

## Step 8. 合宿の演習をやる

- [ ] `exercises/01-define-your-company.md`
- [ ] `exercises/02-first-hitl-gate.md`
- [ ] `exercises/03-run-verify-loop.md`

## Step 9. 引き継ぎを残す（Phase 5）

- [ ] `/handoff` で `HANDOFF.md` を更新する（今回やったこと・次にやること）
- [ ] 意思決定をしたら `/decision` で Decision RFC を残す

---

## 関連

- `docs/starter-manual.md` — 15 分セットアップから始める初心者ガイド
- `docs/templates/README-template.md` — 同梱テンプレの一覧と役割
- `.claude/commands/ingest-context.md` — 外部資料を安全に取り込む `/ingest-context`

# スターターマニュアル — AI駆動経営合宿

> 想定読了時間: 約15分。読み終えたら `exercises/01-define-your-company.md` に進んでください。

---

## 1. このテンプレートは何か

本テンプレートは、**plain Claude Code（+ GitHub）だけで完結する**、AI自律経営ハーネスの雛形です。
外部SDKや専用MCPサーバー群は不要で、`git clone` してすぐに Claude Code から使い始められます。

含まれているもの:

- 5フェーズの軽量ワークフロー（定義 → 計画 → 実行 → 検証 → 記録）
- Issue-First / HITL Gate / SSOT / Scope Contract / 偽緑禁止 という5つの運用原則
- 自社オントロジー・KPI・サイクル・振り返りなどのYAML/Markdownテンプレート
- 動く検証スクリプト（`scripts/verify.py`）とそれを回すCI
- 合宿当日に手を動かす3本の演習

含まれていないもの（意図的に）:

- 外部SDK・専用エージェント群・専用MCPサーバー
- 課金モデルやGTM設計などの経営中枢情報（各自の合宿ワークで設計するもの）
- あなたの会社固有の答え（テンプレートは「型」であり「答え」ではありません）

---

## 2. 15分セットアップ

### 2.1 前提の準備

```bash
git --version        # 必須
python3 --version    # 3.9+ 推奨
claude --version      # Claude Code CLI（Pro以上、または Claude Code 対応プラン）
```

いずれかが無ければ、先に用意してください。GitHubアカウントも必要です。

### 2.2 自分のリポジトリを作る

本テンプレートは GitHub の **Template Repository** として配布されています。
"Use this template" ボタンから、**自分の private リポジトリ**として複製してください
（fork ではなく複製なので、履歴やネットワーク関係は本テンプレートと切り離されます）。

```bash
git clone git@github.com:<your-account>/<your-repo-name>.git
cd <your-repo-name>
```

> ⚠️ **必ず private リポジトリで開始してください。** 自社の機密情報を扱うワークが
> 合宿には含まれます。詳細は README.md のセキュリティ運用セクションを参照。

### 2.3 Claude Code を起動して読み込ませる

```bash
claude
```

起動したら、まず `CLAUDE.md` を読ませてください。これがこのテンプレートの
「運用憲法」で、Claude Code はセッション開始時にこれを自動的に読み込みます。

### 2.4 検証ループを一度動かす

```bash
python3 scripts/verify.py
```

これは RQT（要件トレーサビリティ）検証スクリプトです。最初はほぼ全て `INFO`（対象
ファイルがまだ存在しないためスキップ）になりますが、それで正常です。合宿を進める
につれて `PASS` が増えていきます。使い方の詳細は `scripts/verify.py` 冒頭の
docstring と `.claude/rules/scope-contract.md` を参照してください。

以上で15分セットアップは完了です。

---

## 3. 5フェーズワークフロー（概要）

本テンプレートは、元となった自律経営ハーネスの8フェーズワークフローを、
plain Claude Code で回せる**軽量5フェーズ**に縮約しています。

```
Phase 1 定義   — 自社オントロジー記述（templates/ontology-starter.yaml）
Phase 2 計画   — GitHub Issue起票（Issue-First原則、Epic → 子Issue分解）
Phase 3 実行   — Claude Codeで実装/文書化（Scope Contract規律を守る）
Phase 4 検証   — scripts/verify.py（RQT）で機械検証
Phase 5 記録   — Decision記録 + HANDOFF更新（セッション引き継ぎ）
```

各フェーズの詳しい手順とテンプレートの使い方は `CLAUDE.md` に記載されています。
本マニュアルでは概要のみ扱い、実際に手を動かす詳細は各 `exercises/*.md` に譲ります。

---

## 4. あなたの最初のIssue（Issue-First原則）

このテンプレートでは、**すべての作業はGitHub Issueから始まります**。
「ラベルが状態を定義する」— つまり、今何が進行中で何が完了しているかは、
コードやドキュメントを漁らなくても Issue 一覧を見れば分かる、という設計です。

### 例: 「自社の定義」というEpicを起票する

1. 既存Issueを確認する: `gh issue list`
2. 該当するものが無ければ Epic Issue を起票する:
   ```bash
   gh issue create --title "Epic: 自社オントロジーを定義する" \
     --body "templates/ontology-starter.yaml をベースに、自社の顧客・組織・
   プロダクトの構造を定義する。子Issueに分解して進める。"
   ```
3. 複合タスクなら子Issueに分解する（1子Issue = 1 concern）
4. ブランチ名にIssue番号を含める: `feature/12-define-customer-ontology`
5. コミットメッセージにIssue参照を含める: `feat(ontology): define customer entity (#12)`
6. 作業が終わったらPRに `Resolves #12` を記載する

`/define-company` の演習は `exercises/01-define-your-company.md` にあります。
Issue起票を含む合宿当日の流れは `docs/retreat-day-flow.md` を参照してください。

---

## 5. HITL Gate — 人間が判断すべきとき

AIエージェントに「なんでも自動でやらせる」のは危険です。特に以下のような
**金額・契約・不可逆な操作**は、人間の承認を挟むべきタイミングとして
`.claude/rules/hitl-gate.md` にトリガー表としてまとめてあります。

典型的なHITLトリガーの例:

| カテゴリ | 例 |
|---|---|
| 大型金額 | 一定額以上の取引・契約 |
| 契約 | 契約書へのサイン、法的拘束力のある合意 |
| 不可逆操作 | 本番データの削除、force push、対外発表 |
| 重大インシデント | サービス停止クラスの障害対応 |
| 採用・解雇 | 人事の最終判断 |

「AIに何を任せて、何を人間が握るか」を最初に決めておくことが、合宿全体の
出発点になります。実際に1つのHITLトリガーを設計する演習が
`exercises/02-first-hitl-gate.md` です（Phase B完了後に追加されます）。

---

## 6. SSOTとディレクトリの歩き方

「真実は1か所だけ」— SSOT（Single Source of Truth）原則です。同じ情報を
スプレッドシート・ドキュメント・コードにバラバラに持つと、どれが最新か
分からなくなり、AIも人間も混乱します。

```
<your-repo>/
├─ CLAUDE.md                    ← Claude Codeへの指示書（最優先で読まれる）
├─ README.md                    ← リポジトリの入口・利用条件
├─ LICENSE.md                   ← 合宿参加者限定ライセンス
├─ .claude/
│   ├─ hooks/                   ← git commit時などの advisory チェック
│   ├─ rules/                   ← scope-contract / hitl-gate 等の運用規律
│   └─ commands/                ← 厳選コマンド（/define-company 等）
├─ docs/
│   ├─ starter-manual.md        ← このファイル
│   ├─ concepts/                ← 設計思想の解説（context-funnel / hitl-async-approval）
│   └─ templates/               ← 雛形群（オントロジー・KPI・サイクル・振り返り）と
│                                  path-selector / onboarding-checklist ガイド
├─ definitions/                 ← 自社コンテキストの SSOT（記入先。雛形をコピーして記入）
├─ examples/                    ← 記入済みサンプル（読むだけ）
├─ scripts/
│   ├─ cycle/                   ← 業務サイクル運用スクリプト（advanced・演習範囲外）
│   └─ verify.py                ← RQT機械検証スクリプト
├─ state/                       ← サイクル運用ログの置き場（scripts/cycle/ が書き出す）
├─ .github/workflows/
│   └─ verify.yml                ← CI gate（verify.pyを自動実行）
└─ exercises/                   ← 合宿当日の演習3本
```

新しい定義を追加するときは、まず `templates/` の該当雛形をコピーして、
1箇所（YAMLまたはMarkdown）に書きます。生成物やコピーを複数箇所に
散らかさないでください。

---

## 7. よくある落とし穴

### 7.1 secrets/ にAPIキーや契約書をコミットしてしまう

`secrets/` は `.gitignore` で遮断されていますが、**間違えて別の場所に置いた**
機密情報はガードされません。commit前に必ず `git status` で差分を確認する
習慣をつけてください。private リポジトルで開始するのも、この事故を防ぐ
ための保険の1つです。

### 7.2 1つのPRに複数の関心事を混ぜる

「ついでにこっちも直した」が積み重なると、レビューが困難になり、
regressionが紛れ込んでも気づけなくなります。`.claude/rules/scope-contract.md`
の「着手前5秒チェック」を毎回通してください。CHANGE / NOT CHANGE / diff
budget を最初に決めてから着手するだけで、ほとんどのscope inflationは防げます。

### 7.3 verify.pyを実行せずに「動いたつもり」で進める

見た目が動いているように見えても、機械検証を通していない変更は
「偽緑（false green）」の温床です。作業の節目では必ず
`python3 scripts/verify.py` を実行し、FAILが無いことを確認してから
次に進んでください。詳しくは `exercises/03-run-verify-loop.md` で
体験できます。

### 7.4 HITLトリガーを決めずに自動化を進めてしまう

「とりあえず全部AIに任せる」から始めると、後から金額や契約に関わる
判断まで自動化されていたことに気づいて慌てることになります。
自動化の設計と同時に、HITLトリガー（§5）も必ず設計してください。

---

## 8. 次にやること

このマニュアルを読み終えたら、次のファイルに進んでください:

👉 **`exercises/01-define-your-company.md`** — 自社オントロジーを定義する
最初の演習です。

その後は `exercises/02-first-hitl-gate.md`（HITLゲート体験）、
`exercises/03-run-verify-loop.md`（検証ループ体験）と続きます。

各演習を終えるごとに、自分の経営課題についてのEpic Issueを1つ起票する
ことをお勧めします。合宿終了時には、あなたのリポジトリには「自社に
適用したAI駆動経営ハーネスの雛形」が育っているはずです。

---

*ai-retreat-starter — スターターマニュアル*

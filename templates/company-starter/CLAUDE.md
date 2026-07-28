# ai-retreat-starter — 運用憲法

> **本テンプレは plain Claude Code + GitHub だけで完結します。** 必要なのは GitHub アカウント、
> Claude Code が使えるプラン、`git` と `python3` だけ。
> MCP サーバー・外部 SDK・追加ツールは **任意（optional）** です。繋ぎたいものは繋いでよい
> （freee / Notion / Slack など、自社業務に効くものは積極的に活用推奨）。
> ただし本テンプレの検証（`scripts/verify.py`）・hooks・合宿演習は plain Claude Code のみで
> 完結するよう設計されており、MCP 未接続でも全機能が動きます。

このファイルは、あなたの会社に「AI 自律経営ハーネス」を立ち上げるための運用憲法です。
Claude Code はセッション開始時に本ファイルを読み、ここに書かれた原則とワークフローに従って動きます。

---

## 0. このテンプレが目指すもの

会ったことのない人にリモートで仕事を任せるとき、何が必要か？
→ 明確な指示、手順書、開けば迷わないファイル構造。

AI エージェントも同じです。むしろ人間より察してくれない分、構造がすべてです。
このテンプレは「人間がリモートで協働できる仕組み」を先に作り、それを AI が動ける形に構造化したものです。
5 つの軽量フェーズと 6 つの原則だけで構成されており、特殊なツールを何も要求しません。

---

## 1. 5-Phase 軽量ワークフロー

大掛かりな Phase 分割の重量級ワークフローではなく、plain Claude Code だけで回せる
**5 フェーズ**に縮約しています。大きな施策でも小さな修正でも、このサイクルを回します。

| Phase | 名称 | やること | 主な入出力 |
|-------|------|---------|-----------|
| 1 | 定義 | 自社オントロジーを記述する | `docs/templates/ontology-starter.yaml` を `definitions/ontology/` に記入 |
| 2 | 計画 | GitHub Issue を起票する（Issue-First、Epic → 子 Issue 分解） | GitHub Issue |
| 3 | 実行 | Claude Code で実装・文書化する（Scope Contract 規律、必要なら Plan Mode） | コード / ドキュメント |
| 4 | 検証 | `scripts/verify.py`（RQT）+ CI ゲートで確認する（偽緑禁止） | 検証レポート / CI green |
| 5 | 記録 | Decision RFC を書き、HANDOFF.md を更新する（セッション引き継ぎ） | `docs/decisions/*.md`, `HANDOFF.md` |

小さな typo 修正や 1 ファイルの設定変更のような軽微な作業は、Phase 1-2 を省略してよい。
複数ファイルにまたがる変更や、後戻りしにくい判断（お金・契約・不可逆操作）が絡む作業は、
必ず Phase 1 から通しで回す。

```
Phase 1 定義 → Phase 2 計画 → Phase 3 実行 → Phase 4 検証 → Phase 5 記録
     ↑______________________________________________________|
              (次のサイクルへ、または HANDOFF から再開)
```

---

## 2. 6 つの原則

AI 自律経営ハーネスの実践から積み上がった「思想」のうち、外部 SDK なしでも成立するものだけを残しています。

### 2.1 Issue-First

> "Everything starts with an Issue. Labels define the state."

すべての作業は GitHub Issue から始まります。ラベルが状態を定義します。
複合タスク（3 ステップ以上）は Epic Issue を起票し、子 Issue に分解してから着手する。
単純な typo・設定変更は Issue を省略してよいが、事後でも記録が必要なら起票する。

- ブランチ名に Issue 番号を含める: `fix/123-description`
- コミットメッセージに Issue 参照を入れる: `fix(scope): description (#123)`
- PR に `Resolves #123` を記載する

### 2.2 HITL Gate

> 金額・契約・不可逆操作は人間承認必須。

外部への送金・契約締結・本番データの削除・force push のような後戻りしにくい操作は、
AI が単独で完結させてはいけません。トリガー表とエスカレーション手順は
`.claude/rules/hitl-gate.md` を参照してください。

### 2.3 SSOT（Single Source of Truth）

定義は 1 箇所の宣言的ファイル（YAML/Markdown）に置き、そこから生成された成果物を
手で直接編集しない。`docs/templates/` 配下のオントロジー・KPI・サイクル計画テンプレートは
すべてこの原則に従っています。記入済みの実データは `definitions/` に置きます。
生成物を直接書き換えたくなったら、まず元の定義を直す。

### 2.4 Scope Contract

着手前に **CHANGE**（何を変えるか）と **NOT CHANGE**（何を触らないか）、
そしてだいたいの diff サイズを宣言してから Edit / Write に入る。
「ついでに直したい」衝動は必ず別 Issue・別コミットに隔離する。
詳細は `.claude/rules/scope-contract.md`。

### 2.5 偽緑禁止（No fake-green）

動かない検証・stub な CI・常に PASS するだけのテストを残さない。
`scripts/verify.py` が FAIL を返したら、それを隠さずに向き合う。
「とりあえず green にする」ための改ざんは禁止。

### 2.6 セッション引き継ぎ

合宿は複数日・複数セッションにまたがります。セッション終了時に `HANDOFF.md` を更新し、
次に着手する人（未来の自分を含む）が迷わないようにする。`/handoff` コマンドが補助します。

---

## 3. コマンド一覧

以下は本テンプレに同梱される、実体のある少数精鋭コマンドです。
外部ツールの委譲スタブではなく、すべて plain Claude Code 上でそのまま動きます。

| コマンド | 役割 | 対応する Phase |
|---------|------|---------------|
| `/define-company` | 自社オントロジーを対話的に定義する | Phase 1 |
| `/ingest-context` | 外部資料を検疫してから definitions/ の正しい棚へ取り込む（inbox モードで `notes/inbox/` の昇格も可） | Phase 1 |
| `/create-epic` | Epic Issue + 子 Issue 分解を起票する | Phase 2 |
| `/stock-note` | L2 ノート（company-note / market / client-note / sop）を正しい棚 + frontmatter で起票する | 随時 |
| `/verify` | `scripts/verify.py` を実行し結果を解釈する | Phase 4 |
| `/handoff` | HANDOFF.md を更新し、未完了タスクを棚卸しする | Phase 5 |
| `/decision` | Decision RFC のテンプレートを起票する | Phase 5 |
| `/retro` | `retrospective-template.yaml` ベースの振り返りを行う | Phase 5 |
| `/digest` | notes/ と decisions/retros の frontmatter を集計しオーナー向け週次ダイジェストを生成する | Phase 5 / 随時 |

---

## 4. ディレクトリ構成

```
ai-retreat-starter/
├── CLAUDE.md                # 本ファイル — 運用憲法
├── README.md                # セットアップ手順
├── LICENSE.md                # 参加者限定ライセンス
├── .claude/
│   ├── settings.json         # hooks 配線のみの最小構成
│   ├── hooks/                # git-ops-validator / format-check 等
│   ├── rules/                # scope-contract / issue-first / hitl-gate / definitions-touch
│   └── commands/              # §3 の少数精鋭コマンド
├── definitions/               # 自社コンテキストの SSOT（記入先。骨格を同梱）
│   ├── README.md              # ツリー全体の読み方・記入順序
│   ├── ontology/              # 事業構造の定義（/define-company が company.yaml を生成）
│   ├── hitl/                  # 承認トリガー定義（triggers/）
│   ├── kpi/                   # チーム/部門単位の KPI 計測仕様
│   ├── cycles/                # 業務サイクル計画
│   ├── retro/                 # 振り返り（KPT + pivot 判定）の型
│   └── clients/               # クライアントの非機密な構造情報（任意）
├── notes/                     # L2 記述層（Obsidian 互換、詳細は notes/README.md）
│   └── company|market|clients|sops|inbox/  # 物語・観察・手順の棚
├── examples/                  # 記入済みサンプル（読むだけ、verify 対象外）
│   └── harukaze-ec/           # 架空 EC 会社の完成例一式
├── docs/
│   ├── directory-map.md       # コンテキスト記入前/後のツリー対比
│   ├── starter-manual.md      # ハーネスの使い方
│   ├── concepts/              # 設計思想の解説（context-funnel / hitl-async-approval）
│   ├── templates/             # オントロジー / KPI / サイクル計画等の雛形（記入元）
│   ├── decisions/             # Decision RFC 置き場（/decision で生成）
│   └── retros/                # 振り返り記録置き場（/retro で生成）
├── state/                     # 業務サイクルログの git 追跡置き場（state/cycles/<team-id>/）
├── scripts/
│   ├── verify.py               # RQT ベースの検証ランナー
│   └── cycle/                  # 業務サイクル運用スクリプト（advanced・合宿演習の範囲外、詳細は scripts/cycle/README.md）
├── exercises/                  # 合宿当日の演習 3 本
├── secrets/                    # 常に .gitignore 対象。認証情報はここに置かない
└── HANDOFF.md                  # セッション引き継ぎ（Phase 5 で更新）
```

---

## 4.5. コンテキスト地図（情報カテゴリ → 保存先）

「この情報はどこに置くのか」を迷わないための対応表です。エージェントは情報が必要なとき、
下記のパスを直接 Read します（push ではなく pull）。

| 情報カテゴリ | 保存先 |
|-------------|--------|
| **自社オントロジー（事業構造の定義）** | `definitions/ontology/` |
| **HITL 承認トリガー定義** | `definitions/hitl/` |
| **KPI 計測仕様** | `definitions/kpi/` |
| **業務サイクル計画** | `definitions/cycles/` |
| **振り返り（KPT + pivot 判定）の型** | `definitions/retro/` |
| **クライアントの非機密な構造情報** | `definitions/clients/<slug>/` |
| **自社の物語（沿革・戦略メモ）** | `notes/company/` |
| **他社情報（競合・市場・パートナー候補）** | `notes/market/` |
| **クライアントの随時メモ（商談メモ・議事録要旨）** | `notes/clients/<slug>/` |
| **業務手順（SOP）** | `notes/sops/` |
| **未分類の生メモ（オーナーの受信箱）** | `notes/inbox/`（唯一オーナーが直接書いてよい棚） |
| **機密（実名・実額・認証情報・契約書原本）** | `secrets/`（`.gitignore` 対象） |
| **意思決定記録（Decision RFC）** | `docs/decisions/`（`/decision` で生成） |
| **振り返り記録** | `docs/retros/`（`/retro` で生成） |
| **セッション引き継ぎ** | `HANDOFF.md`（`/handoff` で更新） |
| **記入済みの完成例** | `examples/harukaze-ec/`（読むだけ） |

> 記入前/後のフォルダ構成の変化は `docs/directory-map.md` を参照。

---

## 5. セッションフロー

### 開始時

1. 本ファイル（CLAUDE.md）と `HANDOFF.md` を読み、現在地を把握する（SessionStart hook が最新セクションを自動注入するが、全文・過去の経緯は従来どおり `HANDOFF.md` を Read する）
2. 未完了の Issue / TODO があれば確認する（`gh issue list` 等）
3. 今回のセッションで着手する Phase を決める

### 作業中

1. Phase 2 で Issue が無ければ起票してから着手する（Issue-First）
2. Edit / Write の前に Scope Contract（CHANGE / NOT CHANGE / diff budget）を宣言する
3. HITL Gate に該当する操作（お金・契約・不可逆操作）は必ず人間に確認する
4. まとまった変更のあと `scripts/verify.py` を実行する（偽緑禁止）

### 終了時

1. `/verify` で最終確認する
2. `/handoff` で `HANDOFF.md` を更新する（次に何をやるか、詰まっている点があれば明記）
3. 意思決定をした場合は `/decision` で Decision RFC を残す

---

## 6. よくある詰まりどころ

- **hooks が発火しない**: `.claude/settings.json` の hooks 配線と、hook スクリプトの実行権限
  （`chmod +x`）を確認する。hooks は失敗しても `exit 0` で非ブロッキングになるよう作られているので、
  「動かない」ことと「エラーで止まる」ことは別問題として切り分ける。あわせて、hook が期待する
  入力形式（stdin JSON か argv か）と実装が一致しているかも確認する（Claude Code の
  PostToolUse/PreToolUse hook は JSON を stdin で渡す。argv 前提で書くと常に空入力を掴んで
  無言で何もしなくなる — Issue #26 参照）。
- **`/verify` が FAIL する**: 偽緑禁止の原則に従い、FAIL の中身をそのまま読んで直す。
  既存の判定を弱めて通す編集は禁止（偽緑禁止）。一方、自社独自の RQT を `scripts/verify.py` に
  **追加**するのは歓迎される（`exercises/03-run-verify-loop.md` 参照）。
- **Issue を作らずに実装を始めてしまった**: 事後でもよいので Issue を起票し、
  コミットメッセージ・PR に参照を残す。Issue-First は「先に作る」が理想だが、
  「記録を残す」ことの方が優先度が高い。

---

## 7. 利用条件

本テンプレは AI 駆動経営合宿の登録参加者向けに限定提供されています。
再配布・商用再配布・公開リポジトリでの派生物公開は禁止です。詳細は [LICENSE.md](./LICENSE.md) を参照してください。

---

## Rule imports

@.claude/rules/scope-contract.md
@.claude/rules/issue-first.md
@.claude/rules/hitl-gate.md

---

*ai-retreat-starter — AI 駆動経営合宿 参加者向けテンプレート*

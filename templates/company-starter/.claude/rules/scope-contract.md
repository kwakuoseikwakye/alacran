# Scope Contract Rule

scope inflation（小さいタスクが肥大化する事故）を防ぐ、着手前の契約ルール。
「小さく直すつもりが気づけば大改造していた」を構造的に防ぐための最小規律。

## 0. 原則

> "The diff you didn't write is safer than the diff you did."

- 着手前 5 秒の自問で、ほとんどの scope inflation は防げる
- Commit = 1 concern。2 concern が混ざった瞬間に契約違反
- 「ついでに直したい」衝動は **必ず別 commit / 別 Issue** に隔離する
- 見た目の美しさ（きれいなリファクタ・one-liner 化）は scope 判断とは独立させる

## 1. 着手前 Scope Statement（必須）

Edit / Write ツールを呼ぶ前に、以下 2 つを明示する:

| 項目 | 内容 |
|---|---|
| **CHANGE** | 何を変更するか（ファイル名:行範囲 / 関数名 / 追加する内容） |
| **NOT CHANGE** | 何を触らないか（同一ファイル内の他関数 / 周辺のリファクタ / フォーマット / 型変更） |

コミットメッセージの下書きを **着手前に** 書くと自然にこれが達成できる。
書いていないことはコミットに含めない。

### 例（良い scope statement）

```
CHANGE: scripts/verify.py の HYGIENE-01 チェック関数内、
        git blame で 30 日超の TODO(temp) を検出するロジックを追加
NOT CHANGE: 他の RQT チェック関数
            Report クラスの内部実装
            CLI 引数パースの構造
DIFF BUDGET: 60 行以内
```

### 例（悪い scope statement）

```
verify.py を改善する
```
→ 動詞「改善」に上限がない。NOT CHANGE が書かれていない。budget もない。

## 2. Discovery-first: 標準ツールで見積もる

Scope statement を書く前に、以下を実行してから見積もる:

| Step | Tool | 目的 | 結果の使い方 |
|---|---|---|---|
| 1 | `Grep "<keyword>"` | 対象概念が既にどこで使われているか探す | 既存パターンに合わせる |
| 2 | `Glob "**/<name>*"` | 関連ファイルの所在を把握 | 触るべきファイル一覧を確定 |
| 3 | `Read <target file>` | 対象ファイル全体の文脈を理解する | 影響範囲・依存を把握 |
| 4 | `Grep -r "<symbol>" .` | 対象 symbol の呼び出し元を洗い出す（簡易 impact 分析） | 変更が波及する箇所を確認 |

この 4 ステップを飛ばして Edit に入ると scope inflation が起きやすい。
特に「他のファイルからも参照されている関数・変数」を変更する場合は、Step 4 の
grep で呼び出し元を確認してから着手する。

## 3. Diff Size Budget

カテゴリ別の目標 diff と閾値の目安:

| カテゴリ | 目標 | 警告 | 要分割検討 | 備考 |
|---|---|---|---|---|
| Security / hook 追加 | ≤ 30 行 | 50 行 | 100 行 | 最も厳しく |
| Bug fix | ≤ 50 行 | 100 行 | 200 行 | テスト追加は別カテゴリとして数える |
| Feature（単一 concern） | ≤ 150 行 | 300 行 | 500 行 | 関数 1 つ or コンポーネント 1 つ |
| Refactor | 独立 commit | — | — | 他カテゴリと混ぜない |
| Doc / rule 追加 | ≤ 300 行 | 500 行 | 1000 行 | 本文は大きくても OK |

### 超過時の対応フロー

1. **一旦止まって** `git diff --stat` を確認する
2. 行数を分解する:
   - 本当に必要な変更は何行か
   - 「ついで」で入った変更は何行か
3. 判断する:
   - **scope inflation の兆候** → 一部を取り消して minimal 版を作り直す
   - **正当な複雑さ** → Issue を複数の子 Issue / 複数コミットに分解する
   - **1 コミットに留める合理的理由がある** → コミットメッセージにその理由を明記して進める

## 4. 禁止事項（scope contract 違反）

| 禁止 | 理由 | 代替 |
|---|---|---|
| bugfix commit に無関係なリファクタを混ぜる | regression が隠れ、reviewer が判別できない | 別 commit / 別 Issue |
| フォーマット圧縮と機能追加を混ぜる | diff 全体が review 困難になる | フォーマット変更は独立 commit |
| 「ついでに」既存コードを整理する | scope statement に書いていない変更が紛れる | 気になった箇所はコメントか Issue にメモし、別セッションで対応 |
| 3 concern 以上を 1 commit に詰め込む | atomic 性が失われ、revert が困難になる | 1 commit = 1 concern の原則を維持 |
| CHANGE / NOT CHANGE を書かずに Edit を連発する | 気づかないうちに関係ないファイルまで触ってしまう | 着手前に必ず 5 秒チェック（§6）を通す |

## 5. Bypass（例外運用）

正当な理由で budget を超える場合は、コミットメッセージに理由を明記した上で進めてよい。
無言でのバイパスは scope contract 違反として扱う。

```
feat(verify): add HYGIENE-01 git-blame based stale TODO detection

Budget 60 lines を超過（実測 95 行）。理由: git blame の porcelain
出力パースが想定より複雑だったため。ロジックは単一 concern に閉じている。
```

## 6. Quick Reference（着手前 5 秒チェック）

Edit / Write を呼ぶ前に、以下 5 問に即答できるか確認する:

1. ✅ **変更する対象は何か**（1 行で言えるか）
2. ✅ **触らない対象は何か**（NOT CHANGE リストがあるか）
3. ✅ **Grep / Glob で既存パターンを確認したか**
4. ✅ **呼び出し元への影響を確認したか**（symbol を編集する場合）
5. ✅ **予想 diff size はどのカテゴリか**

5 問すべてに即答できない状態で Edit を呼ばない。

---

*ai-retreat-starter — Scope Contract Rule*

---
name: piro-run
description: Kiro形式のspec(.kiro/specs/<slug>/)をKiro本体なしでClaude Codeから実装実行するとき使う。「specを実行して」「piroのspecで実装して」「tasks.mdを実行」「Kiroなしでspecを回して」等で発動。piroで生成したspecにも本家Kiroが作ったspecにも使える。
---

# piro-run - Kiro spec のサブエージェント駆動実行

piroの実行係。`.kiro/specs/<slug>/` の3ファイル(requirements.md / design.md / tasks.md)を読み、
tasks.md のタスクを1つずつ新品のサブエージェントに実装させ、タスクごとに仕様準拠+品質の
レビューを通し、合格したタスクに `[x]` を打って進める。

superpowers:subagent-driven-development のKiro spec適応版。specの生成・変更はpiro本体の仕事
(このスキルはspecを書き換えない。例外は tasks.md のチェックボックスだけ)。

## 前提

- 対象プロジェクトに `.kiro/specs/<slug>/` の3ファイルが揃っていること
- git作業ブランチ上で実行する。**main/master直実行は禁止**(ユーザーが明示同意した場合を除く)。
  未コミット変更があれば先に退避する

## フロー

### 0. spec読み込みと実行計画

1. slug未指定なら `.kiro/specs/` 配下を一覧して確認する
2. requirements.md / design.md / tasks.md を読む
3. tasks.md の状態を確認する:
   - `[x]` は完了済み。**絶対に再実行しない**(進捗の正本はtasks.mdのチェックボックス)
   - `[ ]` を記載順に実行対象とする
   - `[ ]*`(optional)もデフォルトで実行する。ユーザーが「テストは飛ばして」等と
     指示したときだけスキップし、`[ ]` のまま残して完了報告に明記する
4. タスク間の矛盾や、requirements.mdに存在しない `_Requirements:_` 参照があれば、
   実行前にまとめて1回だけユーザーに確認する(タスクごとに中断しない)

### 1. タスク実行ループ(逐次。並列禁止)

各リーフタスク(N.M)について:

1. **ブリーフを組む**: scratchpadに `task-N-M-brief.md` を書く。内容は
   (a) tasks.mdのそのタスクの全文(実装メモ含む)、
   (b) `_Requirements:_` が参照するEARS要件をrequirements.mdから**逐語で**転記、
   (c) design.mdの該当セクション(コンポーネント/データモデル/エラーハンドリング)。
   サブエージェントにspec 3ファイル全部を読ませない。ブリーフが唯一の要件ソース
2. **実装サブエージェントを派遣**: [reference/implementer-prompt.md](reference/implementer-prompt.md)
   を使う。派遣前に `git rev-parse HEAD` をBASEとして記録する
3. **レビュー**: implementerがDONEを返したら、`git diff BASE..HEAD` を
   diffファイルに書き出し、[reference/task-reviewer-prompt.md](reference/task-reviewer-prompt.md)
   でレビューサブエージェントを派遣する(仕様準拠+品質の2軸)
4. **修正ループ**: Critical/Importantの指摘はfixサブエージェントに直させ、再レビューする。
   合格するまで次のタスクに進まない。Minorは記録して最終レビューに回す
5. **合格したら** tasks.md の該当行を `[x]` に更新してコミットする
   (実装コミットとは別でよい。これがKiro互換の進捗記録になる)。
   親タスク(N)は配下のサブタスクが全部 `[x]` になった時点で `[x]` にする

### 2. Checkpointタスク

`Checkpoint` タスクはサブエージェントを派遣せず、メインが記載された検証
(ビルド/テスト/動作確認)を直接実行する。失敗したらfixサブエージェントを派遣し、
検証が通ってから `[x]` を打つ。

### 3. 完了処理

1. 全タスク完了後、ブランチ全体の最終レビューサブエージェントを派遣する
   (BASE=ブランチ分岐点のdiffパッケージ+累積Minor一覧を渡す)
2. 指摘があればfixサブエージェント1体に全指摘をまとめて渡す(指摘ごとに分けない)
3. 完了報告: 実行したタスク/スキップしたoptionalタスク/コミット一覧/残ったMinor

## 絶対にやらないこと

- **tasks.meta.json を作らない・編集しない・消さない**(Kiroの管理物)
- `[x]` 済みタスクを再実行しない
- tasks.md のチェックボックス以外(タスク文面・番号・requirements.md・design.md)を書き換えない。
  実装中にspecの不備が見つかったら、勝手に直さずユーザーに報告する(修正はpiroのupdateモードの仕事)
- 実装サブエージェントを並列に派遣しない(単一working treeで衝突する。
  wave並列はKiro本体の機能であり、このスキルは逐次実行)
- レビュー不合格のまま次のタスクに進まない
- implementerがBLOCKED/NEEDS_CONTEXTを返したのに同条件で再派遣しない
  (コンテキスト追加・モデル格上げ・タスク分割・ユーザーへのエスカレーションのどれかを変える)

## モデル選択

派遣時は必ずモデルを明示する(省略するとセッションの最上位モデルを継承してしまう):

- 実装メモが具体的でファイル1-2個のタスク → 安いモデル(haiku)
- 複数ファイル統合・既存コード理解が要るタスク → 標準(sonnet)
- 最終レビュー → 使える中で最も高性能なモデル

## 中断からの再開

進捗の正本は tasks.md の `[x]` と git log。コンパクションや中断の後は、
自分の記憶ではなく tasks.md を読み直し、最初の `[ ]` から再開する。

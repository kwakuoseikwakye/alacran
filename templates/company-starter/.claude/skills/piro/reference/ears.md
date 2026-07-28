# EARS形式リファレンス(Kiro実物準拠)

EARS(Easy Approach to Requirements Syntax)は受入基準を書くための制約付き構文。
Kiroの requirements.md は受入基準をこの形式で書く。

## パターン一覧

| # | パターン | 書式 | 使いどころ |
|---|---|---|---|
| 1 | Ubiquitous(常時) | THE <エンティティ> SHALL <動作> | 常に成り立つ性質・制約 |
| 2 | Event-driven | WHEN <イベント>, THE <エンティティ> SHALL <動作> | トリガーへの応答 |
| 3 | Unwanted behavior | IF <望ましくない条件>, THEN THE <エンティティ> SHALL <動作> | エラー・異常系 |
| 4 | State-driven | WHILE <状態>, THE <エンティティ> SHALL <動作> | 状態が続く間の動作 |
| 5 | Optional feature | WHERE <機能が有効>, THE <エンティティ> SHALL <動作> | 設定・オプション依存 |
| 6 | Iteration | FOR EACH <対象>, THE <エンティティ> SHALL <動作> | 対象ごとの繰り返し |
| 7 | 回帰防止 | WHEN <条件>, THE <エンティティ> SHALL CONTINUE TO <既存動作> | 既存動作を壊さない保証 |

## 書式規約

- キーワード(WHEN / IF / THEN / WHILE / WHERE / FOR EACH / THE / SHALL / SHALL CONTINUE TO)は
  **英語大文字のまま**。日本語化禁止(Kiro側のパーサ・エージェント互換が壊れる)
- <エンティティ> には Glossary で定義した固有名を使う(例: THE CLI_Parser SHALL ...)。
  適切な粒度のエンティティが無い場合のみ「THE システム」を使う
- 1文 = 1検証項目。「かつ」「または」で複数の検証を1文に詰めない
- 各受入基準は番号付きリスト(1. 2. 3.)。この番号が tasks.md の `_Requirements: N.M_` の M になる

## 日本語ミックスの例

1. THE エクスポート機能 SHALL 出力ファイルをUTF-8で書き出す
2. WHEN ユーザーが `--csv` フラグを指定した時、THE CLI_Parser SHALL 出力形式をCSVに切り替える
3. IF 出力先ディレクトリが存在しない場合、THEN THE エクスポート機能 SHALL エラーメッセージを表示して終了コード1で終了する
4. WHILE エクスポートが実行中の間、THE 進捗表示 SHALL 処理済み行数を表示する
5. WHERE 圧縮オプションが有効な場合、THE エクスポート機能 SHALL 出力をgzip圧縮する
6. FOR EACH 入力ファイル、THE エクスポート機能 SHALL 1つの出力ファイルを生成する
7. WHEN 既存の `--json` フラグが指定された時、THE CLI_Parser SHALL CONTINUE TO JSON形式で出力する

## 悪い例と直し方

- ×「システムは速くあるべき」→ ○「THE 検索機能 SHALL 1秒以内に結果を返す」(検証可能にする)
- ×「WHEN 保存時、入力を検証してエラーなら中断する」→ Event-driven と Unwanted behavior の2文に分ける
- ×「もし○○なら○○する」→ キーワードを日本語にしない。「IF ○○の場合、THEN THE ○○ SHALL ○○する」

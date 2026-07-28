---
name: office
description: オフィス可視化(pixel-agents同梱版)の起動・停止・撤去
---

# /office - あなたの会社が動いて見えるオフィス

引数: $ARGUMENTS(空 = 起動 / stop / status / uninstall)

あなた(Claude)は以下の手順を実行する。各ステップの成否はコマンドの
終了コードと標準出力で判断し、結果は日本語で報告する。技術用語を
避け「開業/退勤/撤収」の比喩で案内する。

## 引数なし(起動)

1. `python3 tools/office/office.py doctor` を実行する。
   失敗したら: 表示されたNG理由を伝え、Nodeのインストール方法を案内して止まる。
   - mac: `brew install node`(Homebrew未導入なら https://brew.sh )
   - Windows: https://nodejs.org/ からLTSをインストール
   - インストール後にもう一度 `/office` と打つよう伝える
2. `python3 tools/office/office.py install-hook` を実行する。
   失敗したら: NG出力をそのまま見せて止まる。
3. `python3 tools/office/office.py start` を実行する。
   失敗したら: 出力(NG理由とログパス)をそのまま見せ、ログ末尾20行を
   読んで原因を1行で要約する。
4. 出力の `URL: http://localhost:<port>` 行のURLをブラウザで開く(macは `open <URL>`、
   それ以外はURLを提示してクリックしてもらう)。
5. 煙テスト: この /office を打ったセッション自身は開業前に始まっているため
   オフィスには映らない(hooksはセッション開始時に読み込まれるため)。
   このセッション内でサブエージェントを起動しても同じ理由で映らないので、
   開業後の新しいセッションを裏で1つ起動して見せる。リポジトリルートで
   次をバックグラウンドで実行し、終了を待たずに次へ進む:
   `claude -p "Exploreサブエージェントを1体起動して、このリポジトリの README.md の見出し一覧を調べさせ、結果を1行で要約して終了して"`
   その間「ブラウザのオフィスで、いま部下が1人出社して働いています(途中で
   助手をもう1人連れてきます)。見えていますか?」と参加者に確認する。
6. 見えたら:「オフィスが開業しました。ここからは普段どおりClaude Code
   で仕事をするだけで、あなたの会社が動いて見えます」と締める。
   見えなければ: `python3 tools/office/office.py status` を実行し、
   その出力を添えて状況を報告する。あわせて次を案内する:
   hooksはセッション開始時に読み込まれるため、オフィスの初回起動より
   前から開いていたセッション(この /office を打ったセッション自身を含む)
   の活動は映らないことがある。その場合はClaude Codeをいったん終了して
   開き直し(または新しいターミナルで開始し)、そのセッションで部下に
   仕事を振ると映る。

## stop

`python3 tools/office/office.py stop` を実行し、結果を報告する。

## status

`python3 tools/office/office.py status` を実行し、状態出力を
そのまま見せた上で1行で要約する。

## uninstall

実行前に「オフィスを完全に撤去します(サーバ停止+設定の掃除)。
よいですか?」と確認を取ってから
`python3 tools/office/office.py uninstall` を実行し、結果を報告する。

## 注意

- office.py の実行はすべてリポジトリルート(このテンプレのトップ)を
  カレントディレクトリとして行う
- サーバはこのテンプレ配下のセッションだけを表示する(仕様)。他の
  プロジェクトも見たい場合は画面左下 Settings の Watch All Sessions

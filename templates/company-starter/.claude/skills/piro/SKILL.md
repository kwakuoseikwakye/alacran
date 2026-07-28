---
name: piro
description: Kiro互換のspec一式(EARS形式のrequirements.md / design.md / tasks.md / .config.kiro)を生成して対象プロジェクトの .kiro/specs/ に置くスキル。「Kiroのspec作って」「Kiro形式で要件定義して」「piroで○○のspec」「Kiroに渡せる形で」等で発動。要件定義書はHTMLレビューページで人間の承認を得てから設計・タスクを生成する。
---

# piro - Kiro互換 spec 生成

Kiroの1文字違いの弟分。機能の説明から、KiroのSpecsパネルがそのまま認識するspec一式を生成する。
Kiroは日本語で指示しても英語でspecを生成しがちなので、日本語の要件定義を外部で作って渡すのがpiroの役割。

## 生成物(出力先: `<project>/.kiro/specs/<slug>/`)

| ファイル | 内容 | 規約 |
|---|---|---|
| requirements.md | 要件定義書(EARS形式) | [reference/requirements-template.md](reference/requirements-template.md) |
| requirements.html | 人間レビュー用ページ(Kiroは読まない) | [reference/review-page.md](reference/review-page.md) |
| design.md | 設計書(Kiro公式6見出し) | [reference/design-template.md](reference/design-template.md) |
| tasks.md | 実装計画(チェックボックス+要件参照) | [reference/tasks-template.md](reference/tasks-template.md) |
| .config.kiro | Kiroのspecメタ(1行JSON) | 下記フローの手順9 |

## 入力

- 必須: 機能の説明(1行でも、詳細資料でもよい)
- 任意: 対象プロジェクトのパス(省略時はカレントプロジェクト)
- 任意: 言語指定(デフォルトは本文日本語+EARSキーワード英語。「全編英語で」と言われたら英語)

不明点は質問せず妥当な前提で埋める。埋めた前提は第1段階の報告で最大5点提示する。

## フロー

### 第1段階: Requirements + HTMLレビュー

1. 対象プロジェクトの CLAUDE.md・README・関連コードを読み、文脈を取り込む
2. slug を決める(機能名の英語kebab-case)。既存の `.kiro/specs/<slug>/` があるときは
   上書きしてよいかユーザーに確認してから進む
3. [reference/ears.md](reference/ears.md) と
   [reference/requirements-template.md](reference/requirements-template.md) を読み、
   `.kiro/specs/<slug>/requirements.md` を生成する
4. [reference/review-page.md](reference/review-page.md) に従い
   `.kiro/specs/<slug>/requirements.html` を生成し、`open` でブラウザ表示する
5. チャットで報告して承認を待つ。報告内容は「レビューページの場所」と「埋めた前提(最大5点)」だけ
6. 修正指摘は requirements.md に反映し、HTMLを再生成する(正は常にmd)

### 第2段階: Design + Tasks + メタ(承認後、質問せず一気に)

7. [reference/design-template.md](reference/design-template.md) を読み design.md を生成する
8. [reference/tasks-template.md](reference/tasks-template.md) を読み tasks.md を生成する
9. `.config.kiro` を生成する(1行・改行なし):

   ```bash
   printf '{"specId": "%s", "workflowType": "requirements-first", "specType": "feature"}' \
     "$(uuidgen | tr 'A-Z' 'a-z')" > .config.kiro
   ```

10. 自己チェック(下記)を実行し、完了報告する(置いた場所+Kiroでの開き方)

## 自己チェック(第2段階の最後に必ず実行)

機械チェック:

```bash
python3 <このスキルのディレクトリ>/scripts/validate.py <specディレクトリ>
```

全チェック合格(exit 0)を確認する。失敗したら直してから完了報告する。加えて目視で:

- mermaidブロックが構文validか
- 組織名・人名・環境固有パスのハードコードがないか(入力に含まれる場合を除く)
- requirements.html が最新の requirements.md と同期しているか

## 絶対にやらないこと

- **tasks.meta.json を生成しない**。Kiroのタスク実行(waves)が壊れる既知の事故原因。
  Kiroが初回「Run Task」時に自動生成する
- `.config.kiro` に specId / workflowType / specType 以外のフィールドを足さない
- EARSキーワード・構造見出しを日本語化しない
- 既存specフォルダを無確認で上書きしない
- 生成前の対話的インタビューをしない(前提は埋めてHTMLレビューで指摘を受ける)

## Kiroでの検証手順(初回利用時に一度確認する)

1. 生成先プロジェクトを Kiro で開く
2. Specs パネルに該当specが表示される(= .config.kiro が受容された)
3. requirements / design / tasks が正しくレンダリングされる
4. tasks からタスクを1つ「Run Task」で実行できる(このときKiroが tasks.meta.json を自動生成する)
5. requirements.html の同梱が Specs パネル表示に悪影響を与えない

## 運用ノート

- Kiro内でspecの「大規模な再生成」を指示しない(既存ファイル丸ごと上書きの既知不具合)。差分編集に留める
- タスク実行後の状態([x] や tasks.meta.json)は Kiro 側が管理する。piroで再生成するときは上書き確認を必ず挟む

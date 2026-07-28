---
description: definitions/** (自社の実データ) を編集する時だけ効く規律。SSOT としての取り扱いを担保する。
paths:
  - definitions/**
---

# definitions/ を触る時のルール

> このファイルは `definitions/` 配下（自社オントロジー・HITL トリガー等の実データ）に
> `paths:` スコープを張ったルールです。概念編 L2 の「必要な時だけ開く」の実例。
> 発火条件は正確には次のとおりです:
>
> - **Read**: `definitions/**` を読むと公式仕様どおり本ファイルが読み込まれます。
> - **Edit**: Claude Code は編集前に必ず対象を Read するため、直前の Read 経由で間接的にカバーされます。
> - **新規 Write**: 既存ファイルを介さない新規作成では本ファイルが読み込まれない既知の制限があります
>   （anthropics/claude-code#23478 — PII を含みうる新規 YAML を書く最高リスクの経路）。
>   この write-path の穴は `.claude/hooks/definitions-touch-context.sh`（PreToolUse hook）が
>   保証層として同じ規律をコンテキストへ注入することで塞いでいます（Issue #38）。

## 0. 位置づけ

`definitions/` は本テンプレにおける **SSOT (Single Source of Truth)** です。
`docs/templates/` の雛形から派生した「あなたの会社の実データ」がここに置かれます。
生成物（レポート・エージェント指示・スライド等）ではなく、**元データ側**です。

- ここを直接触るということは、会社の宣言的定義そのものを書き換えるということです。
- 生成物を直したくなったとき、まず疑うのは常に `definitions/` 側です。
- 逆に、`definitions/` を直したら生成物側は追随して作り直します（`definitions/` が真実）。

## 1. 触る前のチェック（5 秒）

Edit / Write を呼ぶ前に以下を確認してください:

1. ✅ 変更しようとしている `entity` / `attribute` は、他ファイルから参照されていないか
   （`grep -r "customer.account" definitions/` で確認）
2. ✅ `schema_version` を今日の日付に更新するべき構造変更か？
3. ✅ 変更内容は Decision RFC（`docs/decisions/`）に残すべき意思決定を含むか？
4. ✅ 顧客名・個人名などの PII を **直接埋め込もうとしていないか**（→ 3 節参照）

## 2. スキーマ・バージョニング規約

`definitions/ontology/*.yaml` の先頭には `schema_version` フィールドがあります。

| 変更の種類 | schema_version の扱い |
|---|---|
| 単純な値の追加・修正（新規顧客 1 件追加など） | 更新不要 |
| entity や attribute の追加・削除 | **今日の日付 (`YYYY-MM-DD-company`) に更新** |
| domain の追加・削除 | **必ず更新 + `/decision` で RFC を書く** |

date は絶対日付を使用（「昨日」「先週」等の相対表現禁止 — 未来の自分が読めなくなる）。

## 3. PII / 秘密情報の取り扱い

`definitions/` は **git にコミットされる** 前提のフォルダです。ここに以下を直接書かないでください:

- 顧客の実名・メールアドレス・電話番号
- 従業員の個人情報
- API キー・パスワード・トークン
- 契約金額の実額（範囲や桁数までなら可）

**代わりの受け皿:**

- 認証情報 → `secrets/`（`.gitignore` 対象）
- 顧客固有情報 → id で参照し、実データは別管理（CRM / スプレッドシート等）
- 契約詳細 → 契約書原本の場所を URL / ファイルパスで参照するだけに留める

判断に迷ったら、`.claude/rules/hitl-gate.md` の「公開」「認証」トリガーを再読み込みしてください。

## 4. 削除操作の前に

entity や attribute の削除は破壊的操作です。以下を必ず実行してから削除:

```bash
# 削除対象への参照を洗い出す
grep -rn "<削除対象の id>" definitions/ docs/ .claude/
```

参照が見つかった場合、参照側を先に対応してから削除してください。無言の削除は禁止。

## 5. 変更後の記録

`definitions/` に構造変更（2 節の「更新が必要」ケース）を入れたら、セッション終了時に:

1. `/handoff` で `HANDOFF.md` に「今回の schema_version 変更内容」を 1 行追記
2. domain 追加・削除のような大きな変更は `/decision` で Decision RFC を書く

これは概念編 L6「会話は使い捨て、ルールは地図に書く」の実装です。会話が途切れても、
次のセッションが「なぜこの schema になったか」を追跡できます。

## 6. Scope Contract との関係

`definitions/` の変更は、他のコード編集より慎重に扱う必要があります。理由:

- 生成物（レポート等）を経由して社外に露出しうる（誤った実データが顧客に届く）
- 履歴を追いにくい（後から「なぜこの entity が消えたか」を再現するのが困難）

そのため、Scope Contract の **NOT CHANGE** を通常より厳しく宣言してください。
「ついでにこの entity 名も直しちゃおう」は本ファイルの精神と真っ向から矛盾します。

---

*ai-retreat-starter — definitions/ path-scoped rule (概念編 L2 の `paths:` 実例)*

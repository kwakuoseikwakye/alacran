# definitions/hitl/ — 人間承認トリガーの定義

「後戻りできない一歩」の手前で AI を止め、人間の承認を挟むためのトリガー定義を置く場所です。
思想の全体像は `.claude/rules/hitl-gate.md`（金額・契約・不可逆操作・公開・認証の 5 カテゴリ）を参照。
ここには、その思想を自社の実運用に落とし込んだ **個別トリガーの宣言的定義** を置きます。

## md と yaml の役割分担（どちらが正か）

`.claude/rules/hitl-gate.md` §2 の表と、この `triggers/*.yaml` は **役割が違います**。

| 場所 | 役割 | 性格 |
|------|------|------|
| `.claude/rules/hitl-gate.md` §2 の表 | 判断原則の **カテゴリ一覧**（人間と AI が読む思想面の全体像） | 代表例。網羅リストではない |
| `definitions/hitl/triggers/*.yaml` | 個別トリガーの **運用上の SSOT**（機械検証の対象） | ここが正 |

トリガーを追加・変更するときは **yaml が正** です。`scripts/verify.py` の HITL-02 が検証するのは
yaml 側であり、md 表への追記だけでは機械的にはどこにも反映されません。md 表は「思想カテゴリの
代表例」として、必要に応じて更新すれば十分です（yaml と 1:1 対応させる必要はありません）。

> つまり: **止めるべき操作を 1 つ増やす = `triggers/` に yaml を 1 ファイル追加する**。
> md 表への行追加は、その思想が新カテゴリに当たるときの「読み物としての補足」に留めます。

## 置き場所

- `triggers/` — 個別トリガーの YAML（例: 一定額以上の発注、本番データ削除、新規契約締結）。
  各トリガーは「発火条件」「通知先」「承認者」を宣言します。
  通知の手段は `github_label`（Issue にラベルを付けて承認を促す）または `manual`（担当者へ口頭/チャットで確認）の
  どちらかを基本とします。

## トリガー雛形について

- 記法ガイド: `triggers/_schema.md`（必須キー・severity・通知手段・時間切れ挙動）
- トリガー雛形: `triggers/large-deal.yaml` / `incident.yaml` / `new-ontology-entity.yaml`
  （`<<TODO>>` を自社の値に置き換えて使う）
- 承認者レジストリ: `approver-registry.yaml`（役割→承認者の写像 + 承認者 1 人時の縮退規則）

承認 SPOF（承認者 1 人で全停止）と GitHub label による非同期承認の考え方は
`docs/concepts/hitl-async-approval.md` を参照してください。

## 記入済みの例

- HITL トリガー: `examples/harukaze-ec/definitions/hitl/triggers/large-deal.yaml`
- 承認者レジストリ: `examples/harukaze-ec/definitions/hitl/approver-registry.yaml`
- クライアント固有の承認閾値: `examples/harukaze-ec/definitions/clients/midori-hotel/engagement.yaml`

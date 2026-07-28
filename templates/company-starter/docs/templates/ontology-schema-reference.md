# オントロジー記法リファレンス（entity / event / relation）

`definitions/ontology/` に置く自社オントロジーの書き方リファレンスです。
出発点の雛形は `docs/templates/ontology-starter.yaml`、対話生成は `/define-company`。
このファイルは「entity / event / relation をどう書くか」の記法だけを説明します。

---

## 1. オントロジーの 3 要素

| 要素 | 何を表すか | 例 |
|------|-----------|----|
| **entity** | ドメイン内の永続的な存在（モノ・人・契約） | `customer.account` / `org.employee` / `product.sku` |
| **event** | 時間軸を持つ出来事 | `order.placed` / `inventory.oversold` / `contract.signed` |
| **relation** | entity 間の関係（グラフの辺） | `order` belongs_to `customer.account` |

命名規約は `lowercase + ドット区切り`（例: `customer.account`）。ドメイン名を接頭辞にします。

---

## 2. entity の書き方

```yaml
- id: customer.account          # ドメイン.種別（必須）
  type: account                 # account / person / contract / order / sku など（必須）
  name: 顧客アカウント            # 人間可読名（必須）
  description: 契約・購入の主体。  # 任意
  attributes:                   # 自由属性。運用しながら足してよい
    segment: enum               # consumer / wholesale
    tier: enum                  # first_time / repeat / vip
    amount_band: enum           # 実額は書かない。桁のバンドで表す
  tags: [primary]               # 横断検索用の任意タグ
```

**機密の扱い**: 実名・実額・連絡先・認証情報は attributes に書かず、`secrets/` 側に置いて
id で参照します（`profile.yaml` は役職のみ、金額は `amount_band` のようにバンド化）。

---

## 3. event の書き方

```yaml
events:
  - id: order.placed            # ドメイン.出来事名（必須）
    type: order_placed          # 動詞形（必須）
    actor: customer             # 誰が発生させたか（必須。agent / role / external）
    target: customer.order      # 影響を受ける entity id（任意）
    payload:                    # 自由構造データ（任意）
      channel: enum
      amount_band: enum
    hitl_required: true         # true なら承認ゲートの対象（任意）
    hitl_trigger_ref: large-deal  # definitions/hitl/triggers/<id>.yaml を参照（任意）
```

`hitl_required: true` の event は、`hitl_trigger_ref` で承認トリガーに結びつけます
（`definitions/hitl/triggers/` と `.claude/rules/hitl-gate.md` を参照）。

---

## 4. relation の書き方

```yaml
relations:
  - id: order_belongs_to_account
    from_entity: customer.order   # 起点 entity id（必須）
    to_entity: customer.account   # 終点 entity id（必須）
    type: belongs_to              # belongs_to / signed / contains など（必須）
    strength: 1.0                 # 0.0〜1.0 の関係の強さ（任意）
```

---

## 5. 新しい型を足すときの手順

1. 該当ドメインの yaml に entity / event / relation のエントリを追加する
2. 新しい「型」の追加は `definitions/hitl/triggers/new-ontology-entity.yaml` の承認対象
   （既存 entity への軽微なフィールド追加は低リスク）
3. `schema_version` を更新する
4. `python3 scripts/verify.py` の `ONTOLOGY-01`（YAML 構文）が PASS することを確認する

> 既存のフィールド定義済み backend（外部ストレージ URI など）は starter では扱いません。
> ここで表現するのは「事業構造の宣言」だけで、機密の物理保存先は `secrets/` に分離します。

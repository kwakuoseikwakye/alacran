---
date: 2026-07-03
type: operating-model-selection-guide
---

# 運用モデル選択ガイド

> このテンプレを自社に適用するとき、最初に決める「どういう届け方をするか」の選択肢。
> 選んだモデルによって、どの棚（`definitions/`）を厚く埋めるかが変わります。

---

## 1. 3 つの運用モデル 早見表

| モデル | 通称 | 特徴 | 顧客規模の目安 |
|---|---|---|---|
| **専属型** | 受託・顧問・常駐 | 顧客 1 社ごとに深く入り込み、専属で運用する | 数社〜数十社（high-touch） |
| **製品型** | プロダクト提供 | 共通の製品/サービスを低タッチで多数に提供する | 数百〜数万（low-touch） |
| **ハイブリッド** | 専属 → 製品 | 専属で立ち上げ、共通部分を製品化してスケールする | 段階的 |

---

## 2. 判定フローチャート

```
Q1. 想定顧客数は?
├─ 数社〜数十社（high-touch）→ Q2
└─ 数百社以上（low-touch）   → 製品型

Q2. 顧客固有要件への深いカスタマイズが必要?
├─ Yes（顧問契約・常駐前提）→ 専属型
└─ No（標準提供で OK）      → Q3

Q3. 将来的に製品化してスケールしたい?
├─ Yes → ハイブリッド（専属で立ち上げ → 製品化）
└─ No  → 専属型を継続
```

---

## 3. 専属型（受託・顧問・常駐）

顧客 1 社ごとにチーム/運用を専属で当てるモデル。

### 主に厚く埋める棚

```
definitions/ontology/    顧客（high-touch）と自社の構造
definitions/clients/     クライアントごとの非機密な構造情報（profile / ontology / engagement）
definitions/hitl/        顧客対面で承認が要る操作のトリガー
```

**関連**: `definitions/clients/README.md`（クライアント棚）/ `docs/templates/AGENTS-template.md`（担当エージェントの設計）。
記入済みの例は `examples/harukaze-ec/definitions/clients/midori-hotel/`。

---

## 4. 製品型（プロダクト提供）

共通の製品/サービスを多数の顧客に低タッチで提供するモデル。

### 主に厚く埋める棚

```
definitions/ontology/    製品（product）とユーザーの構造
definitions/kpi/         プロダクト運用チームの KPI（利用・継続・満足）
definitions/cycles/      製品運用のサイクル
```

顧客ごとの個別棚（`clients/`）は基本使いません。共通の運用サイクルと KPI を回すのが中心です。

---

## 5. ハイブリッド（専属 → 製品）

専属で数社を立ち上げ、共通要件を抽出して製品化するモデル。

### 推奨ステップ

```
Stage 1: 専属型で数社を確保し、共通要件を抽出する
Stage 2: 共通部分を製品化し、製品型の提供を始める
Stage 3: 専属（high-touch）と製品（low-touch）を併存運営する
```

### 注意

- 最初からハイブリッドを狙うより、**専属で検証してから製品化** の方が成功率が高い。
- 専属チームと製品チームは運用を分け、共通基盤だけ共有する。

---

## 6. モデル選択後の次ステップ

1. `docs/templates/onboarding-checklist.md` を開く
2. `/define-company` で `definitions/ontology/company.yaml` を作る
3. 選んだモデルに応じて、厚く埋める棚（上記）から記入を始める
4. `python3 scripts/verify.py` で検証する

---

## 7. 関連

- `docs/templates/README-template.md`（同梱テンプレの一覧）
- `docs/templates/onboarding-checklist.md`（セットアップ手順）
- `docs/templates/ontology-starter.yaml`（最小オントロジー）
- `definitions/README.md`（棚の読み方・記入順序）

---

*運用モデル選択ガイド*

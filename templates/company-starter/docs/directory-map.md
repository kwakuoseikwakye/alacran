# ディレクトリ地図 — コンテキストを入れる前 / 入れた後

「自社・クライアントのコンテキストを記入すると、フォルダはどう変わるのか」を
3 段階のツリーで示します。**生成物** と注記した項目は、コマンドやサイクル運用が実行時に作るもので、
配布直後には存在しません。それ以外は配布時点で実在します。

---

## (a) 配布直後（現状）

まだ何も記入していない、テンプレートを clone した直後の姿です。

```
ai-retreat-starter/
├── CLAUDE.md                       # 運用憲法
├── README.md
├── LICENSE.md
├── HANDOFF.md                      # セッション引き継ぎ（配布直後は初期状態のプレースホルダ）
├── .claude/
│   ├── settings.json
│   ├── hooks/
│   ├── rules/                      # scope-contract / issue-first / hitl-gate / definitions-touch
│   └── commands/                   # /define-company, /ingest-context, /create-epic,
│                                    # /verify, /handoff, /decision, /retro
├── .github/
│   ├── ISSUE_TEMPLATE/              # feedback-* 系テンプレ + config.yml
│   └── workflows/verify.yml         # CI（scripts/verify.py を実行）
├── definitions/                    # ★自社コンテキストの SSOT（骨格のみ、README で記入先を案内）
│   ├── README.md
│   ├── ontology/README.md
│   ├── hitl/README.md + approver-registry.yaml + triggers/（記法ガイド + 雛形 3 本）
│   ├── kpi/README.md
│   ├── cycles/README.md
│   ├── retro/README.md
│   └── clients/README.md
├── examples/                       # ★記入済みサンプル（読むだけ）
│   ├── README.md
│   └── harukaze-ec/                # 架空 EC 会社の完成例一式
├── docs/
│   ├── directory-map.md            # 本ファイル
│   ├── starter-manual.md
│   ├── participant-guide.md        # 合宿前の参加者向け事前案内
│   ├── retreat-day-flow.md         # 合宿当日の進行表
│   ├── feedback-collection.md      # フィードバック収集の運用
│   ├── ai-company-explainer.md     # 「AI 自律経営ハーネス」の背景解説
│   ├── concepts/                   # 設計思想の解説（context-funnel / hitl-async-approval）
│   ├── simulations/                # オンボーディング検証記録（読むだけ）
│   ├── templates/                  # 記入元の雛形（ontology / kpi / cycle-plan / retrospective ほか）
│   ├── decisions/README.md         # Decision RFC 置き場の案内（中身はまだ無い）
│   └── retros/README.md            # 振り返り記録置き場の案内（中身はまだ無い）
├── state/README.md                 # 業務サイクルログの置き場の案内（中身はまだ無い）
├── scripts/
│   ├── verify.py                   # RQT ベースの検証ランナー
│   └── （サイクル運用補助スクリプト）
├── exercises/
└── secrets/                        # 機密のみ（.gitignore 対象、.gitkeep で構造だけ保持）
    ├── customers/
    └── contracts/
```

---

## (b) 自社コンテキストを記入した後

`/define-company` と各雛形の記入を終えた姿です。`definitions/` の各サブディレクトリに
自社の実データ（`company.yaml` や `<team>-*.yaml`）が入り、運用の記録が残り始めます。

```
ai-retreat-starter/
├── HANDOFF.md                      # ファイル自体は (a) から存在。中身: /handoff がセッション実績を追記
├── definitions/
│   ├── ontology/
│   │   ├── README.md
│   │   └── company.yaml            # 生成物: /define-company（または雛形コピー）
│   ├── hitl/
│   │   ├── README.md
│   │   └── triggers/               # 自社の承認トリガー（記法ガイド + 雛形 3 本を同梱）
│   ├── kpi/
│   │   ├── README.md
│   │   └── ec-team-kpi.yaml        # 雛形をコピーして記入
│   ├── cycles/
│   │   ├── README.md
│   │   └── ec-team-cycle-plan.yaml # 雛形をコピーして記入
│   ├── retro/
│   │   ├── README.md
│   │   └── ec-team-retrospective.yaml
│   └── clients/README.md           # 自社完結なら空のまま
├── docs/
│   ├── decisions/
│   │   ├── README.md               # (a) から存在
│   │   └── YYYY-MM-DD-*.md         # 中身が増える: /decision が Decision RFC を追加
│   └── retros/
│       ├── README.md               # (a) から存在
│       └── YYYY-MM-DD-retro.md     # 中身が増える: /retro が振り返り記録を追加
└── （他は (a) と同じ）
```

---

## (c) クライアント 2 社を運用している後

受託・卸などでクライアントを持つ場合、`definitions/clients/<slug>/` に
非機密の構造情報が 1 社 = 1 ディレクトリで増えます。機密は `secrets/customers/<slug>/` 側へ。

```
ai-retreat-starter/
├── definitions/
│   └── clients/
│       ├── README.md
│       ├── midori-hotel/           # クライアント 1（非機密の構造情報）
│       │   ├── profile.yaml
│       │   ├── ontology.yaml
│       │   └── engagement.yaml
│       └── aozora-cafe/            # クライアント 2（同型）
│           ├── profile.yaml
│           ├── ontology.yaml
│           └── engagement.yaml
└── secrets/
    └── customers/                  # 機密（.gitignore 対象、git には乗らない）
        ├── midori-hotel/           # 実額・契約書原本・連絡先
        └── aozora-cafe/
```

---

## どのコマンド/雛形がどのファイルを生むか

| 記入先 | 生成/記入の起点 | 種別 |
|--------|----------------|------|
| `definitions/ontology/company.yaml` | `/define-company`（または `docs/templates/ontology-starter.yaml` をコピー） | 生成物/記入 |
| `definitions/hitl/triggers/*.yaml` | 同梱雛形（large-deal / incident / new-ontology-entity）に記入 | 記入 |
| `definitions/kpi/<team>-kpi.yaml` | `docs/templates/kpi-measurement-template.yaml` をコピー | 記入 |
| `definitions/cycles/<team>-cycle-plan.yaml` | `docs/templates/cycle-plan-template.yaml` をコピー | 記入 |
| `definitions/retro/<team>-retrospective.yaml` | `docs/templates/retrospective-template.yaml` をコピー | 記入 |
| `definitions/clients/<slug>/{profile,ontology,engagement}.yaml` | 手動記入（`definitions/clients/README.md` の 3 ファイル構成） | 記入 |
| `HANDOFF.md` | `/handoff` | 生成物 |
| `docs/decisions/YYYY-MM-DD-*.md` | `/decision` | 生成物 |
| `docs/retros/...` | `/retro` | 生成物 |
| `secrets/customers/<slug>/*` | 手動（機密のみ、git 追跡外） | 記入（非追跡） |

> **`docs/retros/` は 2 系統あります。** `/retro` が作るのはセッション単位のフラットな
> `docs/retros/YYYY-MM-DD-retro.md`。一方 `definitions/retro/<team>-retrospective.yaml`
> （SSOT）が宣言する出力先は、チーム×頻度でネストした `docs/retros/<team_id>/weekly/`
> と `docs/retros/<team_id>/monthly/` です。両方とも `docs/retros/` 配下に共存しますが、
> 生成元と粒度が異なる別の記録である点に注意してください。

> 完成イメージが欲しいときは `examples/harukaze-ec/` を開いてください（架空の EC 会社の記入済み一式）。

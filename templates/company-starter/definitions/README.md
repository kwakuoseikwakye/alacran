# definitions/ — 自社コンテキストの SSOT

このツリーは、あなたの会社の宣言的定義（オントロジー・承認トリガー・KPI・サイクル・
振り返り、そして任意でクライアント情報）を置く **Single Source of Truth** です。
生成物（レポート・スライド・エージェント指示）ではなく、常に **元データ側**がここに集まります。

雛形は `docs/templates/` にあります。各サブディレクトリの README が示す雛形をコピーして
記入してください。記入済みの完成例は `examples/harukaze-ec/` にあります（読むだけ・触らない）。

## 記入順序（上から順に埋めると迷いません）

| 順 | サブディレクトリ | 何を置くか | 元にする雛形 |
|----|-----------------|-----------|-------------|
| 1 | `ontology/` | 事業構造の定義（顧客・組織・製品） | `docs/templates/ontology-starter.yaml` |
| 2 | `hitl/` | 人間承認が要る操作のトリガー定義 | `hitl/triggers/_schema.md` + `triggers/*.yaml`（雛形） |
| 3 | `kpi/` | チーム/部門単位の KPI 計測仕様 | `docs/templates/kpi-measurement-template.yaml` |
| 4 | `cycles/` | 業務サイクル（週次/月次）の計画 | `docs/templates/cycle-plan-template.yaml` |
| 5 | `retro/` | 振り返り（KPT + pivot 判定）の型 | `docs/templates/retrospective-template.yaml` |
| － | `clients/` | クライアントの非機密な構造情報（**任意**） | 各サブ README 参照 |

`clients/` は自社完結の会社では空のままで構いません。

## secrets との境界（重要）

`definitions/` は git にコミットされます。ここに書いてよいのは **非機密の構造情報**だけです。
実名・実額の契約金額・認証情報・個人情報は書かず、`secrets/`（`.gitignore` 対象）に置きます。
判断に迷ったら `.claude/rules/definitions-touch.md` の PII 取り扱い節を再読してください。

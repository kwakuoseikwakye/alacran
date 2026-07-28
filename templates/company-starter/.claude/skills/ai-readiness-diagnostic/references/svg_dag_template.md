# DAG SVG可視化テンプレート

Step 3とStep 4で使うDAG（依存関係）可視化のテンプレート。`visualize:show_widget` ツールで描画する（claude.ai）。Claude Code では `diagnostic-output/dag.svg` に書き出してブラウザで開く。

## 設計原則

### 3層レイアウト

業務フローを以下の3層に整理して配置する:

| 層 | 配置 | 例 |
|----|------|-----|
| 直列の幹 | 上段（y=70〜126） | A→B→C→F→G（メイン処理） |
| 並列支線 | 中段（y=200〜256） | D→E（直列幹と並走する別系統） |
| 常時並列 | 下段（y=350〜400） | H, I, J（独立稼働するメタ層） |

### 色分け（4色 + 凡例）

| 色クラス | 意味 |
|---------|------|
| `c-gray` | 通常（機密なし・判断なし） |
| `c-amber` | 機密情報あり |
| `c-purple` | 人間判断必須 |
| `c-red` | 機密情報＋人間判断（両方） |

### 戻りループ

戻り発生箇所は **点線（stroke-dasharray="4 4"）** で描く:
- F→C 差戻し（検算で問題発見→計算に戻る）
- E→D 補正要求（行政から修正依頼→書類作り直し）
- H→C 顧客差戻し（注記で記載）

## 標準テンプレート（5×2×3 構成）

直列幹5ノード、並列支線2ノード、常時並列3ノードの構成例。

```svg
<svg width="100%" viewBox="0 0 680 502" role="img" xmlns="http://www.w3.org/2000/svg">
  <title>業務のDAG構造</title>
  <desc>タスクの依存関係と機密・判断ポイントの色分け</desc>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
  </defs>

  <!-- ─── レイヤー1: 直列の幹 ─── -->
  <text class="ts" x="40" y="55">直列の幹</text>

  <!-- 5ノードを横並び（各幅110、ギャップ10） -->
  <!-- ノード1: 機密 -->
  <g class="c-amber">
    <rect x="40" y="70" width="110" height="56" rx="8" stroke-width="0.5"/>
    <text class="th" x="95" y="92" text-anchor="middle" dominant-baseline="central">A 受領</text>
    <text class="ts" x="95" y="112" text-anchor="middle" dominant-baseline="central">機密</text>
  </g>
  <line x1="150" y1="98" x2="160" y2="98" stroke="#888780" stroke-width="0.5" marker-end="url(#arrow)"/>

  <!-- ノード2: 通常 -->
  <g class="c-gray">
    <rect x="160" y="70" width="110" height="56" rx="8" stroke-width="0.5"/>
    <text class="th" x="215" y="92" text-anchor="middle" dominant-baseline="central">B 前処理</text>
    <text class="ts" x="215" y="112" text-anchor="middle" dominant-baseline="central">−</text>
  </g>
  <line x1="270" y1="98" x2="280" y2="98" stroke="#888780" stroke-width="0.5" marker-end="url(#arrow)"/>

  <!-- ノード3: 機密+判断 -->
  <g class="c-red">
    <rect x="280" y="70" width="110" height="56" rx="8" stroke-width="0.5"/>
    <text class="th" x="335" y="92" text-anchor="middle" dominant-baseline="central">C 計算</text>
    <text class="ts" x="335" y="112" text-anchor="middle" dominant-baseline="central">機密+判断</text>
  </g>
  <line x1="390" y1="98" x2="400" y2="98" stroke="#888780" stroke-width="0.5" marker-end="url(#arrow)"/>

  <!-- ノード4: 判断 -->
  <g class="c-purple">
    <rect x="400" y="70" width="110" height="56" rx="8" stroke-width="0.5"/>
    <text class="th" x="455" y="92" text-anchor="middle" dominant-baseline="central">F 検算</text>
    <text class="ts" x="455" y="112" text-anchor="middle" dominant-baseline="central">判断</text>
  </g>
  <line x1="510" y1="98" x2="520" y2="98" stroke="#888780" stroke-width="0.5" marker-end="url(#arrow)"/>

  <!-- ノード5: 通常 -->
  <g class="c-gray">
    <rect x="520" y="70" width="110" height="56" rx="8" stroke-width="0.5"/>
    <text class="th" x="575" y="92" text-anchor="middle" dominant-baseline="central">G 出力</text>
    <text class="ts" x="575" y="112" text-anchor="middle" dominant-baseline="central">−</text>
  </g>

  <!-- 戻りループ: F→C 差戻し（上カーブ・点線） -->
  <text class="ts" x="395" y="28" text-anchor="middle">F→C 差戻し</text>
  <path d="M455 70 Q455 35 395 35 Q335 35 335 70" fill="none" stroke="#888780" stroke-width="0.5" stroke-dasharray="4 4" marker-end="url(#arrow)"/>

  <!-- ─── レイヤー2: 並列支線 ─── -->
  <text class="ts" x="40" y="180">並列支線（社保手続き）</text>

  <!-- C→D 分岐 -->
  <line x1="335" y1="126" x2="335" y2="200" stroke="#888780" stroke-width="0.5" marker-end="url(#arrow)"/>

  <g class="c-amber">
    <rect x="280" y="200" width="110" height="56" rx="8" stroke-width="0.5"/>
    <text class="th" x="335" y="222" text-anchor="middle" dominant-baseline="central">D 社保届</text>
    <text class="ts" x="335" y="242" text-anchor="middle" dominant-baseline="central">機密</text>
  </g>
  <line x1="390" y1="228" x2="400" y2="228" stroke="#888780" stroke-width="0.5" marker-end="url(#arrow)"/>

  <g class="c-purple">
    <rect x="400" y="200" width="110" height="56" rx="8" stroke-width="0.5"/>
    <text class="th" x="455" y="222" text-anchor="middle" dominant-baseline="central">E 電子申請</text>
    <text class="ts" x="455" y="242" text-anchor="middle" dominant-baseline="central">判断</text>
  </g>

  <!-- E→D 補正要求（下カーブ・点線） -->
  <path d="M455 256 Q455 290 395 290 Q335 290 335 256" fill="none" stroke="#888780" stroke-width="0.5" stroke-dasharray="4 4" marker-end="url(#arrow)"/>
  <text class="ts" x="395" y="305" text-anchor="middle">E→D 補正要求</text>

  <!-- ─── レイヤー3: 常時並列 ─── -->
  <text class="ts" x="40" y="335">常時並列（独立稼働）</text>

  <g class="c-gray">
    <rect x="40" y="350" width="190" height="50" rx="8" stroke-width="0.5"/>
    <text class="th" x="135" y="368" text-anchor="middle" dominant-baseline="central">H 顧客対応</text>
    <text class="ts" x="135" y="386" text-anchor="middle" dominant-baseline="central">差戻し時はCへ戻る</text>
  </g>

  <g class="c-amber">
    <rect x="240" y="350" width="190" height="50" rx="8" stroke-width="0.5"/>
    <text class="th" x="335" y="368" text-anchor="middle" dominant-baseline="central">I 記録・連携</text>
    <text class="ts" x="335" y="386" text-anchor="middle" dominant-baseline="central">機密（賃金台帳）</text>
  </g>

  <g class="c-gray">
    <rect x="440" y="350" width="190" height="50" rx="8" stroke-width="0.5"/>
    <text class="th" x="535" y="368" text-anchor="middle" dominant-baseline="central">J 事務所運営</text>
    <text class="ts" x="535" y="386" text-anchor="middle" dominant-baseline="central">メタ管理層</text>
  </g>

  <!-- ─── 凡例 ─── -->
  <text class="th" x="40" y="430">凡例</text>

  <g class="c-gray">
    <rect x="40" y="445" width="80" height="32" rx="6" stroke-width="0.5"/>
    <text class="ts" x="80" y="461" text-anchor="middle" dominant-baseline="central">通常</text>
  </g>

  <g class="c-amber">
    <rect x="130" y="445" width="80" height="32" rx="6" stroke-width="0.5"/>
    <text class="ts" x="170" y="461" text-anchor="middle" dominant-baseline="central">機密情報</text>
  </g>

  <g class="c-purple">
    <rect x="220" y="445" width="80" height="32" rx="6" stroke-width="0.5"/>
    <text class="ts" x="260" y="461" text-anchor="middle" dominant-baseline="central">人間判断</text>
  </g>

  <g class="c-red">
    <rect x="310" y="445" width="80" height="32" rx="6" stroke-width="0.5"/>
    <text class="ts" x="350" y="461" text-anchor="middle" dominant-baseline="central">機密+判断</text>
  </g>

  <text class="ts" x="410" y="461" dominant-baseline="central">点線 = 戻りループ</text>
</svg>
```

## 業務に応じたバリエーション

### 直列幹のノード数を変える場合

- 3ノード: 各幅175、ギャップ20 → x=40, 235, 430
- 4ノード: 各幅140、ギャップ15 → x=40, 195, 350, 505
- 5ノード: 各幅110、ギャップ10 → x=40, 160, 280, 400, 520（標準）
- 6ノード以上: 業務を分割するか、2行に折る

### 並列支線が複数本ある場合

- 1本（標準）: y=200に1段
- 2本: y=170, y=270 に2段

### 常時並列のブロック数

- 2ブロック: 各幅285、ギャップ20 → x=40, 345
- 3ブロック（標準）: 各幅190、ギャップ10 → x=40, 240, 440
- 4ブロック: 各幅140、ギャップ15 → x=40, 195, 350, 505

## エクスポート

ユーザーがこの図をDLしてPNG化したものを、Step 7で `enhance_with_custom_dag.py` の入力として使う。PNG化は visualize widget のDLボタンから自動で行われる。

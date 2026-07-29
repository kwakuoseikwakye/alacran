# DAG SVG visualisation template

The template for the DAG (dependency) visualisation used in Steps 3 and 4. Render it with the `visualize:show_widget` tool (claude.ai). In Claude Code, write it out to `diagnostic-output/dag.svg` and open it in a browser.

## Design principles

### The three-layer layout

Organise the workflow into the following three layers:

| Layer | Placement | Example |
|----|------|-----|
| Serial trunk | Top (y=70-126) | A->B->C->F->G (the main processing) |
| Parallel branch | Middle (y=200-256) | D->E (a separate line running alongside the trunk) |
| Permanently parallel | Bottom (y=350-400) | H, I, J (an independently running meta layer) |

### Colour coding (4 colours + a legend)

| Colour class | Meaning |
|---------|------|
| `c-gray` | Normal (no confidentiality, no judgement) |
| `c-amber` | Contains confidential information |
| `c-purple` | Human judgement required |
| `c-red` | Confidential information + human judgement (both) |

### Return loops

Draw the places where work goes back with a **dotted line (stroke-dasharray="4 4")**:
- F->C rejection (a problem found during reconciliation sends it back to calculation)
- E->D correction request (the authorities ask for a change, so the paperwork is redone)
- H->C customer rejection (noted as an annotation)

## Standard template (a 5x2x3 arrangement)

An example with 5 nodes on the serial trunk, 2 on the parallel branch, and 3 permanently parallel.

```svg
<svg width="100%" viewBox="0 0 680 502" role="img" xmlns="http://www.w3.org/2000/svg">
  <title>DAG structure of the work</title>
  <desc>Task dependencies, colour-coded by confidentiality and decision points</desc>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
  </defs>

  <!-- --- Layer 1: the serial trunk --- -->
  <text class="ts" x="40" y="55">Serial trunk</text>

  <!-- 5 nodes side by side (each 110 wide, 10 gap) -->
  <!-- node 1: confidential -->
  <g class="c-amber">
    <rect x="40" y="70" width="110" height="56" rx="8" stroke-width="0.5"/>
    <text class="th" x="95" y="92" text-anchor="middle" dominant-baseline="central">A Intake</text>
    <text class="ts" x="95" y="112" text-anchor="middle" dominant-baseline="central">confidential</text>
  </g>
  <line x1="150" y1="98" x2="160" y2="98" stroke="#888780" stroke-width="0.5" marker-end="url(#arrow)"/>

  <!-- node 2: normal -->
  <g class="c-gray">
    <rect x="160" y="70" width="110" height="56" rx="8" stroke-width="0.5"/>
    <text class="th" x="215" y="92" text-anchor="middle" dominant-baseline="central">B Pre-processing</text>
    <text class="ts" x="215" y="112" text-anchor="middle" dominant-baseline="central">−</text>
  </g>
  <line x1="270" y1="98" x2="280" y2="98" stroke="#888780" stroke-width="0.5" marker-end="url(#arrow)"/>

  <!-- node 3: confidential + judgement -->
  <g class="c-red">
    <rect x="280" y="70" width="110" height="56" rx="8" stroke-width="0.5"/>
    <text class="th" x="335" y="92" text-anchor="middle" dominant-baseline="central">C Calculation</text>
    <text class="ts" x="335" y="112" text-anchor="middle" dominant-baseline="central">confidential + judgement</text>
  </g>
  <line x1="390" y1="98" x2="400" y2="98" stroke="#888780" stroke-width="0.5" marker-end="url(#arrow)"/>

  <!-- node 4: judgement -->
  <g class="c-purple">
    <rect x="400" y="70" width="110" height="56" rx="8" stroke-width="0.5"/>
    <text class="th" x="455" y="92" text-anchor="middle" dominant-baseline="central">F Reconciliation</text>
    <text class="ts" x="455" y="112" text-anchor="middle" dominant-baseline="central">judgement</text>
  </g>
  <line x1="510" y1="98" x2="520" y2="98" stroke="#888780" stroke-width="0.5" marker-end="url(#arrow)"/>

  <!-- node 5: normal -->
  <g class="c-gray">
    <rect x="520" y="70" width="110" height="56" rx="8" stroke-width="0.5"/>
    <text class="th" x="575" y="92" text-anchor="middle" dominant-baseline="central">G Output</text>
    <text class="ts" x="575" y="112" text-anchor="middle" dominant-baseline="central">−</text>
  </g>

  <!-- return loop: F->C rejection (upper curve, dotted) -->
  <text class="ts" x="395" y="28" text-anchor="middle">F->C rejection</text>
  <path d="M455 70 Q455 35 395 35 Q335 35 335 70" fill="none" stroke="#888780" stroke-width="0.5" stroke-dasharray="4 4" marker-end="url(#arrow)"/>

  <!-- --- Layer 2: parallel branch --- -->
  <text class="ts" x="40" y="180">Parallel branch (social insurance)</text>

  <!-- C->D branch -->
  <line x1="335" y1="126" x2="335" y2="200" stroke="#888780" stroke-width="0.5" marker-end="url(#arrow)"/>

  <g class="c-amber">
    <rect x="280" y="200" width="110" height="56" rx="8" stroke-width="0.5"/>
    <text class="th" x="335" y="222" text-anchor="middle" dominant-baseline="central">D Social insurance</text>
    <text class="ts" x="335" y="242" text-anchor="middle" dominant-baseline="central">confidential</text>
  </g>
  <line x1="390" y1="228" x2="400" y2="228" stroke="#888780" stroke-width="0.5" marker-end="url(#arrow)"/>

  <g class="c-purple">
    <rect x="400" y="200" width="110" height="56" rx="8" stroke-width="0.5"/>
    <text class="th" x="455" y="222" text-anchor="middle" dominant-baseline="central">E Electronic filing</text>
    <text class="ts" x="455" y="242" text-anchor="middle" dominant-baseline="central">judgement</text>
  </g>

  <!-- E->D correction request (lower curve, dotted) -->
  <path d="M455 256 Q455 290 395 290 Q335 290 335 256" fill="none" stroke="#888780" stroke-width="0.5" stroke-dasharray="4 4" marker-end="url(#arrow)"/>
  <text class="ts" x="395" y="305" text-anchor="middle">E->D correction request</text>

  <!-- --- Layer 3: permanently parallel --- -->
  <text class="ts" x="40" y="335">Permanently parallel (runs independently)</text>

  <g class="c-gray">
    <rect x="40" y="350" width="190" height="50" rx="8" stroke-width="0.5"/>
    <text class="th" x="135" y="368" text-anchor="middle" dominant-baseline="central">H Customer contact</text>
    <text class="ts" x="135" y="386" text-anchor="middle" dominant-baseline="central">on rejection, returns to C</text>
  </g>

  <g class="c-amber">
    <rect x="240" y="350" width="190" height="50" rx="8" stroke-width="0.5"/>
    <text class="th" x="335" y="368" text-anchor="middle" dominant-baseline="central">I Records and hand-off</text>
    <text class="ts" x="335" y="386" text-anchor="middle" dominant-baseline="central">confidential (payroll ledger)</text>
  </g>

  <g class="c-gray">
    <rect x="440" y="350" width="190" height="50" rx="8" stroke-width="0.5"/>
    <text class="th" x="535" y="368" text-anchor="middle" dominant-baseline="central">J Office running</text>
    <text class="ts" x="535" y="386" text-anchor="middle" dominant-baseline="central">meta management layer</text>
  </g>

  <!-- --- legend --- -->
  <text class="th" x="40" y="430">Legend</text>

  <g class="c-gray">
    <rect x="40" y="445" width="80" height="32" rx="6" stroke-width="0.5"/>
    <text class="ts" x="80" y="461" text-anchor="middle" dominant-baseline="central">normal</text>
  </g>

  <g class="c-amber">
    <rect x="130" y="445" width="80" height="32" rx="6" stroke-width="0.5"/>
    <text class="ts" x="170" y="461" text-anchor="middle" dominant-baseline="central">confidential</text>
  </g>

  <g class="c-purple">
    <rect x="220" y="445" width="80" height="32" rx="6" stroke-width="0.5"/>
    <text class="ts" x="260" y="461" text-anchor="middle" dominant-baseline="central">human judgement</text>
  </g>

  <g class="c-red">
    <rect x="310" y="445" width="80" height="32" rx="6" stroke-width="0.5"/>
    <text class="ts" x="350" y="461" text-anchor="middle" dominant-baseline="central">confidential + judgement</text>
  </g>

  <text class="ts" x="410" y="461" dominant-baseline="central">dotted = return loop</text>
</svg>
```

## Variations to suit the work

### Changing the number of nodes on the serial trunk

- 3 nodes: each 175 wide, 20 gap -> x=40, 235, 430
- 4 nodes: each 140 wide, 15 gap -> x=40, 195, 350, 505
- 5 nodes: each 110 wide, 10 gap -> x=40, 160, 280, 400, 520 (standard)
- 6 or more nodes: split the work, or wrap onto two rows

### When there is more than one parallel branch

- 1 branch (standard): a single row at y=200
- 2 branches: two rows at y=170 and y=270

### Number of permanently parallel blocks

- 2 blocks: each 285 wide, 20 gap -> x=40, 345
- 3 blocks (standard): each 190 wide, 10 gap -> x=40, 240, 440
- 4 blocks: each 140 wide, 15 gap -> x=40, 195, 350, 505

## Exporting

The user downloads this diagram as a PNG and it is used in Step 7 as the input to `enhance_report.py` via `--custom-dag-image`. The PNG conversion happens automatically from the visualize widget's download button.

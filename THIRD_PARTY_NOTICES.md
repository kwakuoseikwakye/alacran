# Third-party notices

Alacrán itself is MIT-licensed (see [LICENSE](LICENSE)). The material below is
bundled in this repository under its own terms. npm dependencies are not listed
here; each ships its own licence in `node_modules` and is declared in
`package.json`.

## Fonts

Self-hosted on the marketing site in `landing/fonts/`. The copyright and licence
lines below are read from each font file's own metadata.

| File | Font | Copyright line in the font file | Licence |
| --- | --- | --- | --- |
| `bigshoulders.woff2` | Big Shoulders Display | Copyright 2019 The Big Shoulders Project Authors (https://github.com/xotypeco/big_shoulders) | SIL Open Font License 1.1 (https://scripts.sil.org/OFL) |
| `franklin.woff2` | Libre Franklin | Copyright 2020 The Libre Franklin Project Authors (https://github.com/googlefonts/Libre-Franklin) | SIL Open Font License 1.1 (https://openfontlicense.org) |
| `specialelite.woff2` | Special Elite | Copyright (c) 2010 by Brian J. Bonislawsky DBA Astigmatic (AOETI) | Apache License 2.0 (http://www.apache.org/licenses/LICENSE-2.0) |

The desktop app also uses JetBrains Mono, loaded through `next/font`, which
downloads and self-hosts it at build time. It is licensed under the SIL Open Font
License 1.1 and is not committed to this repository.

## 3D models

`components/os/dashboard/office-models/*.glb` is the Furniture Kit (2.0) by
Kenney (www.kenney.nl), released under Creative Commons Zero (CC0 1.0). Kenney's
own `License.txt` sits beside the models. Credit is appreciated but not required.

## Brand icons

`lib/brand-icons.ts` and `landing/brands.js` contain path data extracted by
`scripts/generate-brand-icons.mjs` from [Simple Icons](https://simpleicons.org/),
released under CC0 1.0. Each mark remains the trademark of its owner; see
"Trademarks" in [README.md](README.md).

## Vendored skill packs

These starter packs include skills copied from upstream MIT-licensed
repositories by `scripts/sync-vendored-skills.sh` (not hand-edited). Each pack carries the upstream
licence text and the pinned tag or commit in its own notice file.

| Pack | Upstream | Pin | Copyright holder named in the upstream licence | Notice file |
| --- | --- | --- | --- | --- |
| Customer support | https://github.com/wshobson/agents | commit `d6837ae274c2cd817acad3fb98f193a4390a4c3e` | Seth Hobson | `templates/packs/customer-support/.agents/vendored/UPSTREAM-customer-support.md` |
| HR & People | https://github.com/tuanductran/hr-skills | `v1.4.0` | Tuan Duc Tran | `templates/packs/hr-people/.agents/vendored/UPSTREAM-hr-people.md` |
| Marketing | https://github.com/coreyhaines31/marketingskills | `v2.10.0` | Corey Haines | `templates/packs/marketing/.agents/vendored/UPSTREAM-marketing.md` |
| Software engineering | https://github.com/Jeffallan/claude-skills | `v0.4.16` | not named in the upstream licence text | `templates/packs/software-engineering/.agents/vendored/UPSTREAM-software-engineering.md` |

## Company starter template

`templates/company-starter/` is the scaffolding copied into every new company. It
is licensed separately under MIT; see `templates/company-starter/LICENSE.md`.

## Trademarks

Third-party names and logos belong to their owners. Alacrán is not affiliated with
or endorsed by them. See "Trademarks" in [README.md](README.md).

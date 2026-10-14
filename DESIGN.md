# Design system: the receipt book (website v5)

Derived from the shipped `landing/v5.css`, `landing/v4.js` (the behaviour script keeps its old name) and `landing/build-site.py`. Applies to the public website only, not the desktop app.

## World
A duplicate (carbon-copy) receipt book on a green desk blotter. Chosen from a design-direction exploration on 2026-10-13, replacing the first redesign. It maps to the product on purpose: the white original is what you asked for, the canary and pink copies are the company record and its history, the rubber APPROVED stamp is the human gate, and the red printed serial number is the record's identity.

## Palette
- Desk `--desk #22362c` (blotter green), `--desk-2 #182820`, `--desk-3 #2f4a3c`.
- Sheets: paper `#f7f7f2`, canary `#f5e68c`, pink `#f3bfcd`, powder blue `#bdd9e6`.
- Print ink `--ink #15192b`; typed text in carbon violet `--carbon #2c3490`; printed serial and stamp red `--serial #c42b2b`.
- Context tokens `--fg/--fg-2/--fg-3/--rule/--accent/--on` flip between desk and sheet, so components never hard-code a colour.

## Type
- Display: Big Shoulders Display 900, uppercase, a print-shop condensed gothic. Headlines carry a carbon offset (two shadow copies in the next sheet colours) that registers into place as they reveal.
- Body and form labels: Libre Franklin (the form-printer's gothic). Typed values, serials, captions: Special Elite.
- All three are self-hosted in `landing/fonts/`.

## Motion grammar
CSS driven by numbers `v4.js` sets; every loop holds still under `prefers-reduced-motion` and the nav's Pause motion control.
- `--s` pinned hero: example receipt slips and taped app crops drift on the desk, lean toward the pointer, then converge into one file copy as the book fades.
- Reveals: blocks rise out of a soft blur; headline words ride up out of a mask while the carbon copy registers.
- APPROVED / YOURS stamps slam once when they enter view (SVG roughen filter `#rough`).
- Loops: benefit scenes, department copies that open on hover, company books swapping, the agent stamp rack, tour auto-play with binder-tab progress, label-tape ticker.
- Easing: `--ease`, `--pop`, `--loop`; no bounce, no stock ease-in-out.

## Components
Cloth-spine nav with red stitch line, embossed label-tape ticker, binder-tab tour with a taped print, bento form cells, colored department copies, perforated how-it-works line, company books, typed file copy, stamp rack, closing tear-off receipt, desk footer with a stencil wordmark. Every section is a sheet with a punched-hole perforation along its top edge; inner pages reuse the same classes and cycle white, canary and pink.

## Do not
- Do not add testimonials, counts or benchmarks (none exist).
- Do not return to a cream page with a black mono-label grid: that is the look this replaced.
- Do not load fonts from a CDN at runtime.
- Do not write an em dash in HTML or CSS (`test_landing.py` fails on it).
- Do not put `overflow-x` on `body`: it makes the body a scroll container and silently breaks the sticky hero.

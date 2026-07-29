# 15-Minute Setup Walkthrough (an expected-behavior reference)

> Purpose: a reference document that spells out **what should happen** at each step when
> setting up this template on a fresh environment.
> How to use it: if you set this up yourself and think "hold on, is this behavior right?",
> cross-check against this file.
> Where it fits: the **detailed counterpart** to `docs/starter-manual.md` §2 ("15-minute
> setup"). The division of labor: starter-manual.md is the intent behind each step, this file
> is what output should actually appear.

---

## Prerequisites

| Tool | Expected version | Check command |
|---|---|---|
| Python | 3.9+ | `python3 --version` |
| Git | 2.x+ | `git --version` |
| GitHub CLI (`gh`) | 2.x+ | `gh --version` |
| Claude Code CLI | Pro or above, or a Claude Code-eligible plan | `claude --version` |

Missing even one of these gets you stuck at a later step. Representative error examples:

```bash
$ python3 scripts/verify.py
ERROR: pyyaml required. install: pip3 install pyyaml
```

```bash
$ gh issue list
gh: To use GitHub CLI, please authenticate: gh auth login
```

```bash
$ claude
zsh: command not found: claude
```

-> Each is resolved with, respectively, `pip3 install pyyaml` / `gh auth login` / installing
the Claude Code CLI.

---

## Timeline

Shows the expected 15-minute timeline. Actual time varies by environment (network speed, how
fast you answer the interview).

| # | Step | Estimated time | Input/action | Expected-output summary |
|---|---|---|---|---|
| 1 | Create a new private repo via "Use this template" | 1 min | Done from the GitHub UI | A private repo is created under your GitHub account. Its first commit is identical to this template's `main` |
| 2 | `git clone` + `cd` | 30 sec | `git clone git@github.com:<your-account>/<your-repo-name>.git` | About 85 files are tracked (varies as the template grows — check with `git ls-files \| wc -l`) |
| 3 | Confirm prerequisite tools | 1 min | `python3 --version && git --version && gh --version && claude --version` | Every command returns a version string (no errors) |
| 4 | `gh` authentication (only if not yet authenticated) | 2 min | `gh auth status` -> if not authenticated, `gh auth login` | `Logged in to github.com account <your-account>` |
| 5 | The first `/verify` run | 30 sec | `python3 scripts/verify.py` | 0 FAILs (it's normal for INFO to remain for shelves not yet filled in — kpi/cycles/retro/clients etc.) |
| 6 | Start Claude Code + load CLAUDE.md | 1 min | `claude` | The prompt starts up. From here on, it behaves per CLAUDE.md's content |
| 7 | Run `/define-company` | 5-8 min | Dialogue with Claude (answer 4 questions) | `definitions/ontology/company.yaml` is newly generated |
| 8 | Re-run `/verify` | 30 sec | `python3 scripts/verify.py` | `ONTOLOGY-01` flips from INFO to PASS (proof Step 7 finished). Other INFOs are fine to remain. 0 FAILs |
| 9 | The first commit | 1 min | `git add definitions/ontology/company.yaml && git commit -m "docs(ontology): define the initial version of our company ontology"` | The commit succeeds. Any hooks are advisory-only and non-blocking |

Total estimate: about 12-15 minutes (add +2 minutes if Step 4's `gh` authentication is
needed).

---

## Step-by-step expected output

### Step 3. Confirm prerequisite tools

```
$ python3 --version
Python 3.9.x  (or higher)

$ git --version
git version 2.x.x

$ gh --version
gh version 2.x.x (YYYY-MM-DD)

$ claude --version
x.x.x (Claude Code)
```

If any of these errors out instead of showing a version, installing that tool comes first.

### Step 4. Confirm `gh` authentication

```
$ gh auth status
✓ Logged in to github.com account <your-account> (keyring)
```

If not authenticated:

```
$ gh auth status
You are not logged into any GitHub hosts.
```

-> Run `gh auth login`, and at the interactive prompt choose, in order, `GitHub.com` ->
`HTTPS` or `SSH` -> browser authentication.

### Step 5. The first `/verify` run

```
$ python3 scripts/verify.py
RQT verify — running...

## STRUCTURE
  [✓] STRUCTURE-01     PASS   LICENSE.md exists
  [✓] STRUCTURE-02     PASS   .gitignore effectively blocks secrets/ and .env
  [✓] STRUCTURE-03     PASS   CLAUDE.md exists
  [✓] STRUCTURE-04     PASS   README.md exists

## HYGIENE
  [✓] HYGIENE-01       PASS   no TODO(temp) markers found

## ONTOLOGY
  [i] ONTOLOGY-01      INFO   no yaml files under definitions/ontology/

## HITL
  [✓] HITL-01          PASS   hitl-gate.md has a trigger table
  [i] HITL-02          INFO   3 trigger template(s) still contain <<TODO>> placeholders — ...

... (continues with STRUCT-DEF / STRUCT-DOC / EXAMPLE / DEFINITIONS / GEN / PATHREF)

========================================
Total: 18  PASS: 12  WARN: 0  FAIL: 0  SKIP/INFO: 6
========================================
```

What to confirm here is **0 FAILs**. The INFO-type checks including `ONTOLOGY-01`
(`HITL-02` / `DEF-KPI-01` / `DEF-CYCLE-01` / `DEF-RETRO-01` / `DEF-CLIENT-01` etc.) merely
indicate that the corresponding shelf hasn't been filled in yet — they are not FAILs. This
follows `scripts/verify.py`'s design policy of "don't show a wall of red the moment the
template is distributed." The total number of RQTs grows and shrinks as the template
evolves, so there's no need to memorize the specific `Total`/`PASS` counts. The judging
criterion is always **0 FAILs**.

### Step 6. Start Claude Code

```
$ claude
```

Once it starts, a Claude Code session comes up and automatically loads `CLAUDE.md`. If no
error appears in the terminal and the interactive prompt is shown, it's working normally.

### Step 7. Run `/define-company`

```
> /define-company
```

Claude reads `docs/templates/ontology-starter.yaml`, then asks the following 4 questions
**one at a time, in order** (asking them all at once would be unexpected behavior):

1. Business domain (what problem you solve)
2. Key stakeholders (who sits at the center of the business)
3. Core value flow (input -> transformation -> output)
4. The current biggest bottleneck

Once you've answered all 4, `definitions/ontology/company.yaml` is generated, and Claude
summarizes and presents its content. You may ask for corrections at this point. Vague items
are fine left as `status: draft` — that's by design.

### Step 8. Re-run `/verify`

```
$ python3 scripts/verify.py
...
## ONTOLOGY
  [✓] ONTOLOGY-01      PASS   1 ontology yaml file(s) parse OK
...
========================================
Total: 18  PASS: 13  WARN: 0  FAIL: 0  SKIP/INFO: 5
========================================
```

`ONTOLOGY-01` flipping from `INFO` to `PASS` is proof Step 7 completed correctly. Other
shelves' INFOs (`DEF-KPI-01` / `DEF-CYCLE-01` / `DEF-RETRO-01` / `DEF-CLIENT-01` etc.) are
fine to remain, since those shelves just haven't been filled in yet. Here too, the judging
criterion is always **0 FAILs** (there's no requirement for `SKIP/INFO` to reach 0).

### Step 9. The first commit

```
$ git add definitions/ontology/company.yaml
$ git commit -m "docs(ontology): define the initial version of our company ontology"
[main xxxxxxx] docs(ontology): define the initial version of our company ontology
 1 file changed, N insertions(+)
```

If hooks are wired up, an advisory message may appear around the commit, but by design it's
**exit 0 and non-blocking**, so the commit itself succeeds. If a commit is stopped by an
error, that's not "it's broken" — it's a case of "it detected a different problem and
deliberately stopped" — read the message and address it.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `python3 scripts/verify.py` crashes with a `ModuleNotFoundError`-type error | `pyyaml` isn't installed | `pip3 install pyyaml` |
| The `gh` command gives an authentication error | `gh auth login` hasn't been run | Run `gh auth login` and choose SSH or HTTPS to log in interactively |
| The CI (`verify.yml`) `secret-scan` job fails | e.g. pushing from a state where GitHub Advanced Security isn't enabled on a private repo | First confirm the behavior with a direct push rather than a PR. secret-scan itself runs on the bundled gitleaks (free), so no extra setup is needed |
| `/define-company` can't find `docs/templates/ontology-starter.yaml` | The clone is incomplete, or you're working in the wrong directory | Confirm it exists with `find . -name ontology-starter.yaml`. If not found, redo the `git clone` |
| `python3 scripts/verify.py`'s `HYGIENE-01` FAILs | A `TODO(temp)` marker has been sitting for 30+ days | Finish implementing that part and remove the marker. Weakening the check itself (`scripts/verify.py`) to force a pass is forbidden |
| The `claude` command says `command not found` | The Claude Code CLI isn't installed | Install it following Claude Code's installation instructions |
| `definitions/ontology/company.yaml` isn't generated | Not all of `/define-company`'s questions were answered | Go all the way through the exchange with Claude. Skipping a question or stopping partway prevents generation |
| The expected output documented for `python3 scripts/verify.py` and the actual run's total count (Total) look different | RQTs grow as the template evolves, so matching counts exactly isn't a requirement | The judging criterion is always 0 FAILs. It's normal for INFO to remain only for shelves not yet filled in |

---

## Success criteria (the expected state after 15 minutes)

- [ ] Every RQT in `python3 scripts/verify.py` is PASS or INFO (0 FAILs. The exact count
      doesn't matter)
- [ ] `definitions/ontology/company.yaml` is committed (reflecting your own company's domain,
      or left at `status: draft`)
- [ ] Both `/verify` and `/define-company` have been confirmed working in Claude Code
- [ ] At least 1 commit you made yourself is in `git log`

---

## Next steps

- `exercises/01-define-your-company.md` — if you skipped Step 7 (e.g. skipped
  `/define-company`), redo it here while following the detailed steps
- `exercises/02-first-hitl-gate.md` — an exercise to actually experience the HITL Gate
- `exercises/03-run-verify-loop.md` — an exercise to add your own RQT to `scripts/verify.py`

---

*ai-retreat-starter — 15-Minute Setup Walkthrough*

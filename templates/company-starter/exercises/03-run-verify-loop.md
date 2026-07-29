# Exercise 03: Run the verify loop

**Time estimate**: 20-30 minutes
**Prerequisite**: Exercises 01 and 02 are complete. An environment where `python3` works.

## Goal

Get a hands-on feel for the "no fake green" principle (`CLAUDE.md` §2.5). Run
`scripts/verify.py`, actually read a FAIL/WARN, fix it, and re-run it once around the loop,
then add one RQT of your own.

## Steps

### Step 1. Run `/verify`

In your Claude Code session:

```
/verify
```

or directly:

```bash
python3 scripts/verify.py
```

The output is organized by category (all 13: `STRUCTURE` / `HARNESS` / `HYGIENE` /
`ONTOLOGY` / `HITL` / `STRUCT-DEF` / `STRUCT-DOC` / `EXAMPLE` / `DEFINITIONS` / `GEN` /
`META` / `CONTEXT` / `PATHREF`), with each line shown as
`[✓|!|✗|-|i] <RQT-ID> <STATUS> <message>`.

### Step 2. Read the output

Confirm what each status means:

| Mark      | Status      | Meaning                                             |
| --------- | ----------- | ---------------------------------------------------- |
| `✓`       | PASS        | This check is satisfied                              |
| `!`       | WARN        | It works, but isn't in a desirable state              |
| `✗`       | FAIL        | This check isn't satisfied. **Must be fixed**        |
| `-` / `i` | SKIP / INFO | The target doesn't exist yet, or is optional. No action needed right now |

If you've completed Exercises 01 and 02, `ONTOLOGY-01` (syntax-checks
`definitions/ontology/*.yaml`) and `HITL-01` (whether `.claude/rules/hitl-gate.md` has a
trigger table) should both show `PASS`.

### Step 3. Find and fix one FAIL or WARN

If nothing is FAILing, let's deliberately break something (for learning purposes — we'll
revert it right away).

```bash
# Try temporarily commenting out the `secrets/**` line in .gitignore (add a # in front)
```

Run `/verify` again and confirm `STRUCTURE-02` becomes `FAIL`. Read the message
(`.gitignore does not effectively block: ['secrets/']`), pin down the cause (commenting out
`secrets/**` removed the effective block line), then revert it. Note that `STRUCTURE-02`
judges "is it effectively blocked" via `git check-ignore`, even if a string still remains in
a negation line (`!secrets/...`) — so commenting it out can't be faked around (no fake green).

**Important**: never loosen `scripts/verify.py`'s own judgment logic just to make a FAIL go
away (no fake green). Always fix the thing being verified instead (in this case,
`.gitignore`).

### Step 4. Re-run and confirm PASS

```bash
python3 scripts/verify.py
```

Confirm that `STRUCTURE-02`, which just FAILed, is back to `PASS`.

### Step 5. Add your own RQT

Following the pattern of `scripts/verify.py`'s `verify_structure()` function, add one check
specific to your own company. As an example, let's add `STRUCTURE-05`, which confirms
whether a company-overview document exists.

First, prepare the target file (create it with simple content if it doesn't exist).

```bash
mkdir -p docs
cat > docs/company-overview.md <<'EOF'
# Company Overview

(Write a summary of Exercise 01's definitions/ontology/company.yaml here)
EOF
```

Next, add the following to the end of the `verify_structure()` function in
`scripts/verify.py` (right after `STRUCTURE-04`).

```python
    # STRUCTURE-05: the company-overview document
    if (REPO_ROOT / "docs" / "company-overview.md").exists():
        r.add(cat, "STRUCTURE-05", "PASS", "docs/company-overview.md exists")
    else:
        r.add(cat, "STRUCTURE-05", "FAIL", "docs/company-overview.md not found")
```

`verify_structure()` is already in `main()`'s call list, so just appending the new RQT inside
the function is enough for it to run automatically (adding a whole new `verify_*()` function
is the only case that separately needs an addition to `main()`'s call list).

### Step 6. Re-run and confirm the new RQT

```bash
python3 scripts/verify.py
```

Confirm `STRUCTURE-05` appears in the output, PASSing/FAILing depending on whether the
company-overview document you created in Step 5 exists.

### Step 7. Commit

```bash
git add scripts/verify.py docs/company-overview.md
git commit -m "test(verify): add STRUCTURE-05 (checks the company-overview document exists)"
```

## Expected output

- Read `/verify`'s output at least twice (once to see the current state, once to confirm
  after the fix)
- Went through the full loop of deliberately creating a FAIL, pinning down the cause, fixing
  it, and confirming it's back to PASS
- `scripts/verify.py` now has a self-authored RQT like `STRUCTURE-05`
- One git commit including the changes above

## Reflection questions

- What happens if you break "no fake green"? (If you loosen the verification logic to hide a
  FAIL, who ends up hurt by it?)
- Are there other RQTs you'd want to add for your own company's operations going forward?
  (e.g. the existence of a specific mandatory document, adherence to a naming convention,
  detecting patterns of confidential information)

## Next

You've completed all 3 exercises. The `definitions/ontology/company.yaml` you built, the row
you added to `.claude/rules/hitl-gate.md`, and the RQT you added to `scripts/verify.py` are
the first step toward standing up an AI-driven management harness at your own company. If
you already filed an Epic Issue via `/create-epic` in the morning session, pick up where that
left off. If you haven't filed one yet, try filing a real management issue as an Epic Issue
with `/create-epic`.

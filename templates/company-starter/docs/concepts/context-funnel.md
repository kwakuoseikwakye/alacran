# Context Funnel — safely bringing company information in

> Don't pour external material — documents, URLs, text — straight into `definitions/`.
> Route it through quarantine (a confidentiality check), classify it onto the correct
> shelf, and only then file it. Inserting this "funnel" prevents both confidential-data
> leakage and shelf disorder at the same time.

The `/ingest-context` command turns this funnel into a concrete procedure.

---

## 1. The 4-stage funnel

```
Intake -> Quarantine -> Route -> Store
```

| Stage | What happens | What goes wrong if skipped |
|----|---------|-----------|
| **Intake** | Receive the document/URL/text and first stash it temporarily in `definitions/.staging/` (gitignored) | Raw data lands directly in git |
| **Quarantine** | Scan for mixed-in credentials, real contract amounts, or personal information. If found, stop and direct it to `secrets/` instead | Confidential data stays in git permanently |
| **Route** | Determine which shelf the content belongs to — ontology / kpi / hitl / clients | The information gets lost and never reused |
| **Store** | Format it and place it on the correct shelf in `definitions/`, then clean up `.staging/` | Raw data is left scattered around |

---

## 2. Two-phase writes (staging → inspection → promotion)

Rather than writing straight to a shelf (`definitions/`), this **goes through a draft
staging area** first.

```
definitions/.staging/   <- Phase 1: temporary storage (gitignored. Raw data stays here)
        │  (quarantine scan + classification)
        ▼
definitions/<shelf>/     <- Phase 2: only what passes inspection is promoted (git-tracked)
```

- Because Phase 1 (staging) is gitignored, it structurally prevents the accident of raw,
  pre-inspection data being committed.
- Only content that's had confidential data removed and been classified reaches Phase 2
  (promotion).
- After promotion, clean up `.staging/` and record the change with `/handoff`.

---

## 3. The librarian model (tend the shelves, don't push)

There are 2 ways to handle information.

| Model | Behavior | Problem |
|--------|------|------|
| Push | Distribute information to every agent with "read this too" | Context overflows, and it becomes unclear what's canonical |
| **Pull (the librarian)** | Just tend the shelves. An agent comes and gets what it needs from the shelf itself, when it needs it | Doesn't overflow — the canon stays in one place |

This template adopts the **pull model (the librarian model)**. The Context Funnel's role is
"a librarian who keeps the shelf (`definitions/`) tidy" — not a delivery person who pushes
information onto everyone. That's why, following `CLAUDE.md`'s "context map," an agent Reads
whichever shelf it needs, itself.

---

## 4. Related

- `.claude/commands/ingest-context.md` — the `/ingest-context` command that runs this funnel
- `definitions/README.md` — how to read the shelves (`definitions/`), and the fill-in order
- `.claude/rules/hitl-gate.md` — the "credentials" and "publication" triggers for when
  quarantine finds confidential data
- `CLAUDE.md` §4.5, the context map — the information-category → storage-location table

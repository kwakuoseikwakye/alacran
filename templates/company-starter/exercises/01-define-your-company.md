# Exercise 01: Define your own company

**Time estimate**: 20-30 minutes
**Prerequisite**: You can open this repository with the `claude` command. The session has
started with `CLAUDE.md` loaded.

## Goal

Using this repository's ontology (declarative business-structure definition) template, write
out **your actual company's** customer / org / product. Once done,
`definitions/ontology/company.yaml` will be a file that represents your company.

## Steps

### Step 1. Run the command

In your Claude Code session, type:

```
/define-company
```

Claude reads `docs/templates/ontology-starter.yaml` and asks you questions one at a time.
Don't try to answer everything at once — work through the questions one by one in dialogue.

### Step 2. Answer the questions

You'll answer 4 questions. Below are example answers (don't use them as-is — replace them
with your own company's).

1. **Business domain** (what problem you solve)
   - e.g. "We handle small businesses' labor administration (payroll, social-insurance
     paperwork) on their behalf, reducing monthly errors and labor-hours"
   - e.g. "We provide EC operators with demand-forecast-based automatic ordering, reducing
     both stockouts and excess inventory at the same time"

2. **Key stakeholders** (who sits at the center of the business)
   - e.g. "The customer company's labor-administration contact (the requester), the labor
     consultant themselves (who does the actual work), the advisory client's executive (the
     decision-maker)"
   - e.g. "The EC store manager (who decides orders), warehouse staff (who do the physical
     work), suppliers (external partners)"

3. **Core value flow** (input → transformation → output)
   - e.g. "Attendance data (input) → payroll/insurance-premium calculation (transformation) →
     pay slips and payment forms (output)"

4. **The current biggest bottleneck** (work that's overly dependent on one person, or slow)
   - e.g. "Only one specific person can do the month-end payroll check, and it takes 2 full
     days every month"

### Step 3. Review the generated file

Once `definitions/ontology/company.yaml` is generated, read it, and ask Claude to fix
anything that's factually wrong or too stiffly worded. Items you're fine leaving vague stay
as `status: draft`. There's no need to aim for perfection right away.

### Step 4. Commit

```bash
git add definitions/ontology/company.yaml
git commit -m "docs(ontology): define the initial version of our company ontology"
```

(This commit is exempt from Issue-First — it's fine to treat it as a learning commit within
the exercise.)

## Common mistakes

1. **Writing industry-specific details directly into `docs/templates/ontology-starter.yaml`
   (the template itself)**
   → Never edit the template itself. Always write into the copy at
   `definitions/ontology/company.yaml`.
2. **Inconsistent levels of abstraction** (e.g. writing a company name into
   `customer.account` but only a department name into `customer.contact`)
   → Keep it consistent with `attributes`' declared types (string / enum / list, etc.). If
   unsure, compare against `examples/harukaze-ec/definitions/ontology/company.yaml` (a
   filled-in, complete example).
3. **Getting stuck trying to fill everything in perfectly in one pass**
   → It's fine to leave a field you don't know as `<<TODO>>` or blank, saved with
   `status: draft`. You can fill it in during a later session.

## Expected output

- `definitions/ontology/company.yaml` (the 3 domains customer / org / product filled in with
  your company's real data, or provisional values under `status: draft`)
- One git commit including the file above

## Next

Once `definitions/ontology/company.yaml` exists, move on to Exercise 02 (experiencing the
HITL Gate).

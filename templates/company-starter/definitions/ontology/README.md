# definitions/ontology/

`company.yaml` lives here. It describes the business in three domains:

- **customer** — who you serve, and what they're trying to get done
- **org** — who does the work, and who decides what
- **product** — what you sell, and how it reaches someone

Every other command reads this file. It is the first thing a new company
should create and the last thing to change casually.

## Creating it

Run `/define-company`, or use Alacrán's company setup wizard. Both write this
file; neither invents content you didn't supply.

`docs/templates/ontology-starter.yaml` is the reference shape — read it for
structure, don't fill it in.

## Changing it

- Read the current file first. Something else depends on every id in it.
- Changing an id is a rename across the whole repo, not a local edit.
- If you're unsure whether something is settled, it goes in `notes/`, not
  here.

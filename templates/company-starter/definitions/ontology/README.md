# definitions/ontology/ — definition of the business structure

Where the company's business structure (the 3 domains of customer / org / product) is declared.
Once this is filled in, the KPI, cycle and retrospective work that follows can reference "what a
metric is actually about".

## How to generate it

- **Interactive generation (recommended)**: running the `/define-company` command generates
  `definitions/ontology/company.yaml` by answering a series of questions.
- **Manual fill-in**: copy `docs/templates/ontology-starter.yaml` into this directory as
  `company.yaml`, and fill in each of the customer / org / product domains with your own real
  data. Industry-specific entities (e.g. `sku` / `order` for an EC company) should only be added
  to `company.yaml` — never edit the template itself.

## Conventions when filling it in

- Naming convention: `lowercase + dot-separated` (e.g. `customer.account`).
- When you add or remove an entity or attribute, bump `schema_version` to today's date
  (see `.claude/rules/definitions-touch.md` for details).
- Don't write customers' real names or personal information (stick to id references — manage
  the real data elsewhere).

Filled-in example: `examples/harukaze-ec/definitions/ontology/company.yaml`

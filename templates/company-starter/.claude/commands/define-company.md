---
name: define-company
description: Interactively define your company ontology and generate definitions/ontology/company.yaml (Phase 1: Definition)
---

# /define-company

You are now going to build the ontology of the user's company (a declarative definition of its business
structure) together with them. Using `docs/templates/ontology-starter.yaml` as the starting point,
generate `definitions/ontology/company.yaml`.

## How to proceed

1. Read `docs/templates/ontology-starter.yaml` and get a sense of the structure (the 3 domains customer / org / product, entities, attributes).
2. Check "Handling confidential information" in `docs/templates/ontology-schema-reference.md` (within §2, how to write an entity).
   Before generating, tell the user in one line that real names, real amounts, contact details and credentials
   must not be written directly into attributes, that amounts should use band expressions such as `amount_band`,
   and that confidential material itself belongs on the `secrets/` side. For a sense of the writing style, you may
   refer to `examples/harukaze-ec/definitions/ontology/company.yaml` (a completed example using band expressions and job titles only).
3. Put the following questions to the user **one at a time, in order**. Do not ask them all at once. You may adjust the next question based on the answer.
4. Once you have all the answers, Write `definitions/ontology/company.yaml` following the structure of the template.
5. After generating it, summarise the content for the user and check whether there is anything they want to change.

## Question list

1. **Business domain**: what problem does your company solve? (e.g. "we handle labour and HR paperwork for small businesses", "we help e-commerce businesses optimise inventory")
2. **Key stakeholders**: among customers, employees and partners, who is at the centre of the business? What is each of their roles?
3. **Core value flow**: tell me, one sentence each, the input (what you receive) -> transform (what you do) -> output (what you deliver).
4. **Biggest current bottleneck**: what work takes the most time right now, or depends on one specific person?

## Output format

`definitions/ontology/company.yaml` should have the following structure (follow the 3-domain customer / org / product
structure of `docs/templates/ontology-starter.yaml`; you may add entities specific to the industry):

```yaml
version: 1
schema_version: "<today's date>-company"
template_origin: docs/templates/ontology-starter.yaml
status: draft

company_summary:
  name: <company name>
  domain: <summary of the answer to question 1>
  employee_count: <number of employees (an approximate figure if the exact number isn't known)>
  primary_bottleneck: <summary of the answer to question 4>

stakeholders:
  # list the answer to question 2 (key stakeholders) by role
  - role: <e.g. HR officer at a client company>
    position: <requester / hands-on owner / decision maker, etc. — their standing within the business>

value_flow:
  # structure the answer to question 3 (core value flow) as-is
  input: <what you receive>
  transform: <what you do>
  output: <what you deliver>

customer:
  # ... fill in the customer domain from ontology-starter.yaml with real data

org:
  # ... likewise the org domain

product:
  # ... likewise the product domain
```

## Notes

- Industry-specific entities are welcome (e.g. `labor_contract` for HR, `sku` for e-commerce), but do not edit the
  template itself (`docs/templates/ontology-starter.yaml`). Only add to the copy at `definitions/ontology/company.yaml`.
- In industries where external partners (suppliers, advertising media, alliance partners, etc.) are at the centre of
  the business, you may add a `partner` domain alongside the 3 customer / org / product domains.
- Follow the naming convention of `lowercase + dot-separated` (e.g. `customer.account`).
- Even if not every question can be answered perfectly, it's fine to output with provisional answers as `status: draft`.
  Tell the user it can be filled in properly later.
- After generating the file, ask whether you may `git add definitions/ontology/company.yaml` before committing
  (the commit itself only after the user confirms).

# Ontology notation reference (entity / event / relation)

A reference for how to write your own ontology under `definitions/ontology/`.
The starting template is `docs/templates/ontology-starter.yaml`; `/define-company` generates
one interactively. This file only explains the notation for "how to write an entity / event /
relation."

---

## 1. The 3 elements of an ontology

| Element | What it represents | Example |
|------|-----------|----|
| **entity** | A persistent thing within a domain (a thing, a person, a contract) | `customer.account` / `org.employee` / `product.sku` |
| **event** | A time-bound occurrence | `order.placed` / `inventory.oversold` / `contract.signed` |
| **relation** | The relationship between entities (an edge in the graph) | `order` belongs_to `customer.account` |

The naming convention is `lowercase + dot-separated` (e.g. `customer.account`). Prefix with
the domain name.

---

## 2. How to write an entity

```yaml
- id: customer.account          # domain.kind (required)
  type: account                 # account / person / contract / order / sku etc. (required)
  name: Customer account        # a human-readable name (required)
  description: The contracting/purchasing party.  # optional
  attributes:                   # free-form attributes. Add these as you go
    segment: enum               # consumer / wholesale
    tier: enum                  # first_time / repeat / vip
    amount_band: enum           # don't write a real amount — express it as an order-of-magnitude band
  tags: [primary]               # optional tags for cross-cutting search
```

**Handling confidential data**: don't write real names, real amounts, contact details, or
credentials into attributes — put those in `secrets/` and reference them by id (`profile.yaml`
holds only a role label, and an amount is banded, e.g. `amount_band`).

---

## 3. How to write an event

```yaml
events:
  - id: order.placed            # domain.event_name (required)
    type: order_placed          # verb form (required)
    actor: customer             # who caused it (required. agent / role / external)
    target: customer.order      # the affected entity id (optional)
    payload:                    # free-form data (optional)
      channel: enum
      amount_band: enum
    hitl_required: true         # true if this is subject to an approval gate (optional)
    hitl_trigger_ref: large-deal  # references definitions/hitl/triggers/<id>.yaml (optional)
```

An event with `hitl_required: true` is tied to an approval trigger via `hitl_trigger_ref`
(see `definitions/hitl/triggers/` and `.claude/rules/hitl-gate.md`).

---

## 4. How to write a relation

```yaml
relations:
  - id: order_belongs_to_account
    from_entity: customer.order   # the source entity id (required)
    to_entity: customer.account   # the target entity id (required)
    type: belongs_to              # belongs_to / signed / contains etc. (required)
    strength: 1.0                 # the relationship's strength, 0.0-1.0 (optional)
```

---

## 5. Steps for adding a new type

1. Add an entity / event / relation entry to the relevant domain's yaml
2. Adding a new "type" is subject to approval via
   `definitions/hitl/triggers/new-ontology-entity.yaml` (a minor field addition to an
   existing entity is low-risk)
3. Update `schema_version`
4. Confirm `python3 scripts/verify.py`'s `ONTOLOGY-01` (YAML syntax) PASSes

> This starter doesn't handle an already-field-defined backend (an external storage URI,
> etc.). What's expressed here is only "the declaration of the business structure" — the
> physical, confidential storage location is kept separate, in `secrets/`.

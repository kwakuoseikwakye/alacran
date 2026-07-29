---
date: 2026-07-03
type: operating-model-selection-guide
---

# Operating-model selection guide

> The first choice to make when applying this template at your own company: "what shape of
> delivery are we doing?" Which model you pick changes which shelf (`definitions/`) you fill
> in the most heavily.

---

## 1. Quick reference: the 3 operating models

| Model | Also known as | Characteristics | Rough customer scale |
|---|---|---|---|
| **Dedicated** | Contracted / advisory / embedded | Goes deep with each individual customer, operated on a dedicated basis | A handful to a few dozen companies (high-touch) |
| **Product** | Product delivery | Delivers a common product/service to many, with a light touch | Hundreds to tens of thousands (low-touch) |
| **Hybrid** | Dedicated -> Product | Starts dedicated, then productizes the common parts to scale | Staged |

---

## 2. Decision flowchart

```
Q1. How many customers do you expect?
├─ A handful to a few dozen (high-touch) -> Q2
└─ Hundreds or more (low-touch)          -> Product

Q2. Do you need deep customization for customer-specific requirements?
├─ Yes (assumes an advisory contract / embedded presence) -> Dedicated
└─ No (a standard offering is fine)                       -> Q3

Q3. Do you want to productize and scale in the future?
├─ Yes -> Hybrid (start dedicated -> productize)
└─ No  -> Stay dedicated
```

---

## 3. Dedicated (contracted / advisory / embedded)

A model where a team/operation is dedicated to each individual customer.

### The shelves you mainly fill in heavily

```
definitions/ontology/    The structure of the customer (high-touch) and your own company
definitions/clients/     Non-confidential structural information per client (profile / ontology / engagement)
definitions/hitl/        Triggers for operations needing approval in front of the customer
```

**Related**: `definitions/clients/README.md` (the clients shelf) / `docs/templates/AGENTS-template.md`
(designing the agents in charge). Filled-in example:
`examples/harukaze-ec/definitions/clients/midori-hotel/`.

---

## 4. Product (product delivery)

A model delivering a common product/service to many customers with a light touch.

### The shelves you mainly fill in heavily

```
definitions/ontology/    The structure of the product and its users
definitions/kpi/         The product-operations team's KPIs (usage, retention, satisfaction)
definitions/cycles/      The product-operations cycle
```

The per-customer shelf (`clients/`) generally isn't used. The focus is on running a common
operating cycle and KPIs.

---

## 5. Hybrid (Dedicated -> Product)

A model that starts a handful of companies dedicated, then extracts common requirements to
productize.

### Recommended steps

```
Stage 1: Secure a handful of companies dedicated, and extract common requirements
Stage 2: Productize the common parts and start product delivery
Stage 3: Run dedicated (high-touch) and product (low-touch) side by side
```

### Note

- Aiming for hybrid from the start has a lower success rate than **validating dedicated first,
  then productizing**.
- Keep the dedicated team and the product team operationally separate, sharing only the
  common foundation.

---

## 6. Next steps once you've picked a model

1. Open `docs/templates/onboarding-checklist.md`
2. Build `definitions/ontology/company.yaml` with `/define-company`
3. Start filling in from the shelves you fill in heavily (above), matching your chosen model
4. Verify with `python3 scripts/verify.py`

---

## 7. Related

- `docs/templates/README-template.md` (the list of bundled templates)
- `docs/templates/onboarding-checklist.md` (the setup procedure)
- `docs/templates/ontology-starter.yaml` (the minimal ontology)
- `definitions/README.md` (how to read the shelves, and the fill-in order)

---

*Operating-model selection guide*

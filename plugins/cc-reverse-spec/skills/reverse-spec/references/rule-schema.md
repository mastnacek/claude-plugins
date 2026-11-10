# Rule schema

One rule = one file `spec/rules/<ID>.yaml`. The ID (`BR-<AREA>-<NNN>`) is what
ties the system together: it appears as a Gherkin tag (`@BR-INV-014`), in a
comment above the implementing function, and in the commit message. That lets
you answer the two questions that decide a migration: *which rule is not yet
covered*, and *which line of new code has no rule behind it* (the second is
where an agent invented behaviour).

```yaml
id: BR-INV-014
title: VAT for an EU customer with a VAT ID outside CZ
confidence: confirmed          # confirmed | inferred | gap
source:
  - file: legacy/modInvoice.bas
    lines: "412-438"
  - evidence: ev_7f3c…           # REA Evidence ID, when no source exists
glossary: [customer, vat-id, reverse-charge]

inputs:
  - name: customer.vat_id
    type: string|null
  - name: line.amount_net
    type: decimal(14,2)
    unit: CZK

behavior:                      # EARS: UBIQUITOUS / WHEN / WHILE / IF-THEN / WHERE
  - ears: WHEN
    text: >
      WHEN customer.country != "CZ" AND customer.vat_id is a valid VIES ID,
      THE system SHALL set vat_rate = 0 and vat_note = "reverse charge".

constraints:
  - vat_amount >= 0

side_effects:
  - kind: audit_log
    detail: row in VatDecisionLog on reverse charge

compare:                       # how outputs are compared in parity tests
  vat_amount: { type: decimal, rounding: ROUND_HALF_EVEN }

open_questions:
  - "VIES unreachable: old code silently falls back to domestic rate."

verified_by:
  - tests/features/vat_eu.feature:12
  - tests/golden/invoices/eu_reverse_charge_*.json
```

## Confidence

- **confirmed** — direct evidence: a `file`+`lines` citation, or an observed
  REA Evidence ID.
- **inferred** — derived from names, patterns or data flow. May be wrong.
- **gap** — cannot be determined from code; a human must confirm. Also list it
  in `spec/gaps.md`.

A rule without this label makes an agent hallucination look exactly like a
cited fact. Summarise counts in `spec/confidence.md`.

## What belongs in `spec/` and what does not

In: entities and fields with types and units, business rules with IDs,
invariants, states and transitions, side-effects (what is sent, written,
deleted), glossary, authorisation, comparison rules.

Out (into `target/<lang>/target-architecture.md`): language and libraries,
module structure, error handling, logging, forms and UI widgets, performance
tricks. Keep the two in separate directories, not two sections of one file.

## Too detailed

If a rule could be turned into code mechanically without thinking, it has
become pseudocode — you are writing the program twice. Lift it back to *what*.

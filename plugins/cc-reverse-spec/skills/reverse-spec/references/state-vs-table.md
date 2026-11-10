# Statechart or decision table

"Thousands of conditions" is usually **not** a state machine. A state machine
has memory: the result depends on what the system went through. Conditions
that depend only on current input values form a **decision table**, which is
far cheaper to model and to check.

The 30-second test: can you name the states with nouns an operator would
recognise ("Draft", "Approved", "Cancelled")? Yes → machine. If you have to
invent states to make it fit → not a machine.

| What the code shows | Write it as |
|---|---|
| Result depends on order of actions and previous state | Statechart, `spec/machines/<name>.json` |
| Many input combinations → one result, no memory | Decision table, `spec/tables/<name>.csv` |
| Waiting for external events, timeouts, escalation | Statechart with `after` transitions |
| Long run of `If … Then Exit Sub` validations | Rules with IDs (`spec/rules/`) |

## Machine format

XState JSON (v5/v6 shape: `states`, `on`, `target`, `guard`, `actions`,
`after`). **Guards and actions are named strings only**
(`"guard": "hasOutstandingBalance"`), never inline code. Inline functions
serialise to `{"@code": …}` and the definition stops being language-neutral.
Each named guard is implemented per target language as a pure, separately
tested function.

From the transitions generate: coverage of every transition, unreachable
states, states with no exit. An unreachable state in old code is dead code or
a missing transition someone patches by hand in the data — either way it goes
into `spec/gaps.md`.

## Table format

CSV with input columns, then output columns, one row per combination. Check
mechanically for completeness (every combination present) and contradictions
(same inputs, different outputs). In old code this exposes branches nobody can
reach.

# Parity: verifying against the oracle

While the old system runs, it answers any input correctly — including inputs
you have not thought of yet. Do not switch it off before the shadow run ends;
that step cannot be undone.

## Three gates, in this order

1. **Golden corpus** (step 1) — the new code passes every recorded
   input/output pair. Cheap, runs in CI.
2. **Differential property tests** — a generator (Hypothesis, proptest,
   fast-check) produces thousands of inputs; each goes into both systems; the
   only assertion is that outputs are equal. Shrinking gives a minimal repro.
   Needs the old system callable from code and fast: a headless Excel/COM
   batch harness, a Domino agent over an API on a test replica, a CLI wrapper.
   That harness pays back more than anything else in the migration.
3. **Shadow run** — the new system gets live inputs, outputs are compared and
   logged, nothing is delivered. Typically two to four weeks.

A deviation is resolved by a rule in the spec (new or corrected), never by a
code patch alone.

## Normalisation — declare it in the rule's `compare`, not ad hoc

- **Decimals.** VBA `Currency` is 4-place fixed point, `Double` is IEEE 754,
  Excel rounds on display. Use `Decimal`, never float, for money; write the
  rounding mode (`ROUND_HALF_UP` vs `ROUND_HALF_EVEN`) into the rule.
- **Order** of items in lists — often an accident of the old implementation.
- **Times, GUIDs, revision numbers, last-modified user** — normalise to a
  constant.
- **Emptiness.** `Empty` / `Null` / `""` / `0` are four different things in VBA
  and LotusScript and collapse into one in most targets.
- **Encoding.** LMBCS in Domino, Windows-1250 in Excel CSVs are not UTF-8.

## Cutover

Strangler fig: the new code takes over one module at a time, the old system
serves the rest, switching is a config value revertible in one write.

Write **numeric exit criteria** per module into `traceability.md` before the
work starts, e.g.: all golden tests green; 10 000 property runs without
deviation; 14 days of shadow run with zero unexpected differences; every rule
of the module has `verified_by`. Without a number, cutover is postponed
forever or done out of nerves.

The last ten percent of parity is the expensive part. Plan for it.

## After parity

Only now decide which `@legacy-bug` behaviours to fix. Each fix is a new rule
version with its own tests — a business change, not part of the migration.

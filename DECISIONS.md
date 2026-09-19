# B0SS — Implementation decisions for expert sign-off

The SRS is specific about most of the system, but five points were
underdetermined and had to be resolved before the rules could be coded.
Each is recorded here with what was chosen and why, so the expert can
confirm or correct it at validation (SRS §16).

Five further observations are things found in the SRS during
implementation that the expert may want to look at.

---

## Decision 1 — R11 needs numbers the screens did not collect

**Problem.** R11 compares `margin_rate < effective_funding_cost`. Screen 4
collected margin as a category (low / adequate / strong) and never asked
for a funding cost at all, so R11 could not be evaluated. SRS §11 also
requires that "money and time are entered numerically; categories are not
used where the rule requires arithmetic."

**Resolved.** Gross margin is now entered as a number.

- `margin_level` (used by R12) is *derived* from that number using the
  expert's own thresholds in §3.5 — above 30% for retail and food, above
  45% for services. A margin at or above the floor is `adequate`; 15
  points above it is `strong`; below it is `low`.
- `effective_funding_cost` is 0 for own savings and interest-free family
  money. For any borrowed source the interest rate is asked as a number,
  and that field only appears when the funding source is a borrowed one.
- If a borrowed source is chosen but no rate is given,
  `effective_funding_cost` simply **fails**, so R11 cannot fire on an
  invented default (NFR-Robustness).

**For the expert to confirm:** is "15 points above the floor" the right
line between an adequate and a strong margin?

## Decision 2 — R02 and R08 each stated two conclusions

**Problem.** R02 concludes "market_attractiveness = moderate/high" and R08
concludes "financial_readiness = marginal/not_ready". A Prolog rule must
conclude one term.

**Resolved.** Each takes the middle value of its own triple, because the
neighbouring rules already cover the ends:

| | high / ready | moderate / marginal | low / severe |
|---|---|---|---|
| Market | R01 | **R02** | R03 |
| Finance | R07 | **R08** | R09 |

This keeps the rule count at exactly 25.

## Decision 3 — R23, R24 and R25 were prose, not rules

**Problem.** "Core factors positive", "at most two manageable weaknesses"
and "two or more severe unmitigated risks" are not directly codeable.

**Resolved.** Two explicit tables in `kb/boss_infer.pl` say what counts,
and the rules count them with `findall/length`:

- **severe_risk**: no market, owner unready, competitive position weak,
  severe underfunding, single-point dependency, household exposure,
  insufficient survival runway.
- **weakness**: every severe risk, plus marginal financial readiness,
  operations not ready, and a slow cash cycle while overall risk is high.

`core_positive` means: market is high or moderate, owner readiness is not
weak, and there is no severe underfunding.

R23 requires zero weaknesses; R24 allows one or two; R25 fires on two or
more *severe* risks. Keeping the thresholds in one table means the expert
can change what counts as severe without touching any rule.

## Decision 4 — Validation cases 2 and 4 appeared to contradict each other

**Problem.** Case 4 (no price validation) expects FURTHER VALIDATION
REQUIRED, which needs an assumed price to count as a critical unknown.
Case 2 also has an untested price but expects NOT RECOMMENDED IN THIS
FORM — and §9.1 puts the unknown check *above* the severe-risk check.

**Resolved.** The difference is in the inputs, not the priority order:

- Case 2's demand was **tested and found absent** — `demand_evidence(none)`
  is a known negative that fires R03, and bubble tea prices can be
  benchmarked against any competitor. No unknowns, so R25 decides.
- Case 4's demand was **never tested** — `demand_evidence(unknown)`, with
  `price_status(assumed)`. Both are critical unknowns, so R22 decides.

§9.1's priority order is therefore implemented exactly as written.
Note that `unknown` is not one of the four `demand_level/1` facts: it is
the explicit "I don't know" value that §11 requires on critical questions.

## Decision 5 — `validation_gap +=` and `red_flag =` are collections

**Problem.** R03 and R09 (among others) add an item to a list rather than
concluding a single value, which is not backward chaining.

**Resolved.** They are gathered with `findall/3` over the rules whose
bodies currently hold, not by asserting during inference. The same query
produces the FR-09 rule trace, and it re-runs cleanly when the user
changes an answer (FR-10). Rules that both conclude and flag use an
`and/2` term, so `rule/3` keeps the exact shape shown in SRS §7.1.

---

## Observations for the expert

**6. `channel_fit` is collected but never used.** SRS §4.1 lists it as a
fact created by screen 6, but none of the 25 rules refer to it. It is
still collected (and hidden for purely online businesses, per §11), but it
currently affects nothing. Either a rule is missing, or the fact can go.

**7. The session-fact count in §4 understates §4.1.** The table in §4 says
"approximately 12–18 facts", but the seven screens in §4.1 list 24. This
implementation emits 24–26 depending on which conditional fields apply.

**8. Nothing in the SRS says what happens when no final rule fires.** A
case can reach the end of the §9.1 ladder without matching R23, R24 or R25
— for example one severe risk and a low market. The system returns
FURTHER VALIDATION REQUIRED (CF 0.0) in that case, on the grounds that
insufficient basis is the safe answer. The expert may prefer a different
default.

**9. The validation cases' figures were chosen, not given.** SRS §12 gives
each case's expected verdict and CF but no input numbers. The figures in
`test/cases.pl` were chosen to produce the stated outcome through the
stated rules. They are plausible for the Sri Lankan small-business context
but they are not the expert's own numbers, and should be replaced with
real ones at sign-off.

**10. Two helper tables are not domain facts.** `margin_floor/2` and
`free_capital/1` live in `kb/boss_derive.pl` as derivation parameters.
The 25 knowledge-base facts of §5 are in `kb/boss_kb.pl` and remain
exactly 25, unchanged.

---

## Interface note

SRS §11 asks for seven screens with a 1/7…7/7 progress indicator. The
prototype presents the seven as seven sections on one scrollable page,
revealed one at a time, with a sticky progress indicator that tracks which
section is open. §4.1 explicitly permits several controls per screen; this
keeps every screen's fact set intact while making the flow continuous.
Completed sections collapse to a one-line summary and can be reopened and
changed at any point, before or after the result (FR-10).

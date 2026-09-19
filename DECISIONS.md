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

**6. Three facts in §4.1 are read by no rule.** An audit of every session
fact against the 25 rules and all derived values found that
`venture_type`, `experienced_support` and `channel_fit` are never read.

- `experienced_support` and `channel_fit` are **no longer collected**. They
  appear only in §4.1's screen table; no functional requirement names them,
  and removing them changes no verdict — all six validation cases return
  identical recommendations, CFs and rule traces without them. This takes
  the interface from 25 questions to 23.
- `venture_type` **is still collected**, even though no rule reads it,
  because FR-01 names it explicitly ("identify whether the case is a new
  business or an additional branch").

The expert may want to look at `experienced_support` in particular. §3.5
must-have condition 3 says the owner must be able to do the core work "or
has a named, committed person who can", and §3.6 Example 4 says a mentor or
experienced partner compensates for no prior ownership experience — but
R16 and R17 consider only `owner_experience` and `reversibility`. The rule
set does not implement what the prose describes. If the expert confirms the
intent, R17 should read
`owner_experience(none), ( reversibility(high) ; experienced_support(committed) )`
and the question comes back.

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

## Decision 11 — Reducing the interface to nine questions

**Problem.** The literal reading of §4.1 produced 25 separate questions,
which is too long for §11's "one to two minutes" demonstration target.

**Resolved.** The interface is now **nine numbered questions holding
nineteen inputs**, across the same seven sections. §4.1 explicitly permits
this: "The interface may place several short controls on one screen. This
keeps the demonstration brief without reducing the number of facts
available to the inference engine."

Three controls each set more than one fact, in every case because a single
rule already reads those facts together:

| Control | Facts it sets | Read by |
|---|---|---|
| "What evidence do you have?" | `demand_evidence`, `repeat_demand`, `target_customer` | R01, R02, R03 |
| "Have you done this work yourself?" | `owner_experience`, `reversibility` | R15, R16, R17 |
| "How do customers reach you, and can you be there?" | `channel_type`, `owner_time` | R18 |

No distinction the rules can make is lost. The demand control offers eight
options, which is exactly the number of states R01–R03 and the unknown check
can tell apart. The owner control leaves `reversibility` unset when
experience is `direct` or `related`, because R16 and R17 only consult it
when experience is `none` — asserting a value there would be inventing one.

**This is the floor with all 25 rules intact.** Seven inputs are numbers
that §4.2's arithmetic needs separately, and each remaining choice feeds a
different rule, so merging any two would make one of them unanswerable.
Reaching twelve inputs would require deleting `price_status`, `cash_cycle`,
`breakeven_months`, `personal_runway`, `dependency` and `venture_type`,
which kills R04, R12, R13, R14, R19 and R20 and fails FR-01.

**One deliberate exception:** `competition` and `differentiation` are read
together by R05 and R06 and could have been merged, but their cross-product
is nine mechanical options. They are kept as two short adjacent selects
inside one question instead — nineteen inputs rather than eighteen.

**Two validation cases were adjusted** so their inputs are reachable from
the merged demand control: case 2's `repeat_demand` went `one_off` →
`occasional` and `target_customer` `broad` → `unclear`; case 5's
`repeat_demand` went `recurring` → `occasional`. Both are rule-neutral —
`repeat_demand` only matters to R01, which needs `validated` demand, and
`target_customer` only to R02, which needs `observed` or `validated`. All
six cases still return identical verdicts, CFs and rule traces.

## Decision 12 — Fifteen inputs, with every rule still reachable

**Problem.** A literal reading of §4.1 gives 25 separate questions. That is
too slow for §11's one-to-two-minute demonstration target.

**Resolved.** The interface asks **fifteen inputs** in nine questions
across the seven sections. Six are numbers §4.2's arithmetic needs
separately; the other nine are choices. Every one of the 25 rules remains
reachable — nothing was disabled to shorten the form.

Four controls set more than one fact, in each case because a single rule
already reads them together:

| Control | Facts | Read by |
|---|---|---|
| "What evidence do you have?" | `demand_evidence`, `repeat_demand`, `target_customer`, `price_status` | R01–R04 |
| "Have you done this work yourself, and can you give it the hours?" | `owner_experience`, `reversibility`, `owner_time` | R15–R18 |
| "Who else does this, and why would a customer choose you?" | `competition`, `differentiation` | R05, R06 |
| "Where is the money coming from, and what does it cost?" | `funding_source`, `stated_rate` | R07, R10, R11 |

Two further points:

- **`price_status` folds into the demand control by entailment.** If a
  customer has paid your price, the price is accepted; if nobody has paid,
  it is an untested estimate. One option — "nobody has paid yet, but I have
  checked competitor prices" — keeps decision 4's distinction between case 2
  (tested and absent) and case 4 (never tested) expressible.
- **`venture_type` rides along with the channel question.** FR-01 asks the
  system to "start a new screening and identify whether the case is a new
  business or an additional branch". No rule reads `venture_type`, so rather
  than spend a question on it, the channel control's six options set both
  `channel_type` and `venture_type` ("They come to a physical place — my
  first location" / "— an additional branch"). FR-01 is satisfied at no
  extra input.

**Funding rate bands.** Asking an interest rate as a separate number was
replaced by bands on the funding question. Each band sets `stated_rate` to
its **lower** bound, so R11 (margin below funding cost) only fires when the
margin is below the cheapest rate the band can mean. It can under-fire, but
it can never fire on a guess.

## Decision 13 — Making the fixed facts do work

**Problem.** An audit found that only **6 of the 25 fixed facts were ever
called**. `supported_business`, `demand_level`, `cash_cycle_type` and
`legal_value` — nineteen facts — were declared in §5 but referenced by no
rule and no derived value.

Separately, **§2's exclusion list was not implemented at all.** The SRS is
explicit that B0SS must not evaluate pharmaceuticals, financial services,
franchises and the rest, but nothing in the rule base enforced it.

**Resolved.** Those facts are now the system's type and scope layer:

- `supported_business/1` backs `in_scope/0` and `out_of_scope/1`. A business
  type outside the supported list is reported before any recommendation.
- `demand_level/1`, `cash_cycle_type/1`, `legal_value/1`, `safe_funding/1`
  and `dangerous_funding/1` back `known_value/1`, so an answer the knowledge
  base does not recognise is reported rather than reasoned from.

All 25 fixed facts are now called. `assess/1` carries the scope result.

An out-of-scope business now **returns no recommendation at all** — the
verdict is OUTSIDE WHAT B0SS CAN SCREEN, with no certainty factor, and the
assessment blocks are not rendered. Giving a business B0SS is forbidden to
evaluate a PROCEED verdict would contradict §2 directly. The business-type
question therefore offers "Something else", so the gate is reachable from
the interface rather than only from hand-written facts.

## Decision 14 — Two supplementary validation cases

The six cases in §12 exercise 22 of the 25 rules; R04, R17 and R21 are
reachable but never reached by them. Two cases were added to close the gap,
clearly marked as additions:

- **Case 7**, first-time home baker — reaches R04 (price assumed) and R17
  (no experience, reversible start). Expected FURTHER VALIDATION REQUIRED.
- **Case 8**, food outlet with a licence blocker — reaches R21. Expected
  NOT RECOMMENDED, CF −1.0.

All eight pass under SWI-Prolog and Tau-Prolog. `npm test` now asserts
coverage: 25/25 rules fired and 25/25 fixed facts called.

## Decision 15 — Issues found and fixed after implementation

An audit of the finished system found six defects, all now fixed:

1. **`fires/1` returned duplicate solutions.** A rule whose body consults
   `holds/1` succeeded once per rule supporting the same conclusion — R23
   fired twice whenever both R07 and R12 concluded `financial_readiness(ready)`.
   No verdict was wrong (`trace/1` sorts, `recommendation/2` commits through
   `->`), but any count taken from `fires/1` was inflated. Fixed with `\+ \+`.
2. **The validation gap was computed but never shown.** `gaps/1` collected
   `validation_gap` items from R03 and R04 and passed them to the interface,
   which ignored them — so the SRS's headline output, §6's "list of
   unknown/assumed critical items", never reached the user. Now rendered
   under "Not yet known", with `gap_action/2` supplying each next step.
3. **`gap_action/2` was dead code**, for the same reason. Now live.
4. **`override_rule/1` and `red_flags/1` were dead code.** Removed:
   `absolute_override/0` already covers the first, and the red-flag rules
   already appear in the concerns block with their text and CF.
5. **Unrecognised answers were detected but never reported.** `scope/1`
   returned them; the interface dropped them. Now shown as a notice.
6. **Nothing guarded `rule_level/2` completeness.** A rule added without a
   level entry is invisible to `fires/1` and `holds/1` and can never fire,
   silently and with no error. `npm test` now fails on a missing or orphaned
   level entry — verified by removing R19's entry, which correctly reported
   R19 *and* R24 as unreachable.

## Decision 16 — Making the result readable

§10 lists what the explanation must contain but not how to present it. The
result now opens with the six intermediate conclusions of §6 as a compact
scorecard (Demand / Competition / Money / Owner / Operations / Risk), then a
single numbered "Do this next" list, then the supporting detail. Actions
appear once rather than repeated under every concern. `conclusion_label/2`,
`conclusion_word/3` and `conclusion_tone/3` in `boss_advice.pl` hold the
wording, so it is editable without touching the interface (FR-11).

## Decision 17 — One question per screen, and a visible decision path

**Scrolling.** The Back / Continue bar is `position: sticky; bottom: 0`
with a gradient fade above it, so the action is always in view and content
visibly continues underneath. The step position ("4 of 9") sits beside the
buttons as well as in the dot strip. Verified at 390×780: on all nine
questions, including the two whose content runs past 1200px, Continue is
reachable without scrolling.

**Landing.** One call to action. The worked-example loader is a quiet text
link rather than a button — it is needed for §11's one-to-two-minute
demonstration target, but it should not compete with starting a real
screening.

**Interaction.** The nine questions are now presented one screen at a time
rather than on a single scrolling page. Each screen shows its section name,
the question, its controls, Back and Continue. A dot strip across the top
gives position and progress; a filled dot is an answered question, the taller
one is where you are, and any answered dot can be clicked to jump back.
Left/right arrow keys move between questions. This still satisfies §11's
progress-indicator requirement and keeps §4.1's seven sections intact —
the section name appears above every question.

**Decision path.** The result now shows **how the answer was reached**:
the §9.1 priority ladder drawn as a flow, with the route actually taken
highlighted, the exit gate marked, and gates never reached dimmed. Each
passed gate states why it passed ("2 weaknesses found", "Unknown: legal").

This is generated by `decision_path/1` in `boss_infer.pl`, which walks the
same checks `recommendation/2` makes and returns a list of
`d(Gate, pass|exit, Detail)`. It is derived from the inference, not a
picture drawn alongside it — if the ladder changes, the diagram changes
with it. `gate_label/2`, `gate_detail/2` and `gate_outcome/2` in
`boss_advice.pl` hold the wording (FR-11).

The rule trace (FR-09) is unchanged and still sits under "Show reasoning";
the flow answers "why this verdict", the trace answers "which rules fired".

**Branding.** The interface uses the project trademark
(`web/public/trademark.png`) and a palette sampled from it:

| Token | Value | From |
|---|---|---|
| `--brand` | `#123E63` | the briefcase navy |
| `--accent` | `#12735F` | the chart bars and tick marks |
| `--ink-3` | `#8492A1` | the slate in the document rules |

Navy carries the primary button, progress dots, focus rings, selected
options and the decision path. The accent green carries the eyebrow labels
and list markers. Verdict colours stay semantic, but are drawn from the
same family — PROCEED uses the mark's own green, and FURTHER VALIDATION
REQUIRED uses the brand navy, which reads as neutral rather than alarming.
Dark mode lifts both to `#7FAAD6` and `#4FB89A`.

Two assets are generated from the trademark by cropping to content and
quantising to an indexed palette, which is lossless for flat artwork:
`logo.png` (560×416, 112 KB, the full mark for the landing page) and
`icon.png` (256×256, 40 KB, the briefcase alone, used as the favicon and
in the top bar). The source file is kept for reference. Because the
artwork has a white ground, the landing page sets it on a white rounded
panel, which is invisible against the light theme and reads as a
deliberate card in the dark one.

---

## Interface note

SRS §11 asks for seven screens with a 1/7…7/7 progress indicator. The
prototype presents nine questions one screen at a time, each labelled with
the section it belongs to, with a dot strip for progress and free
navigation backwards. A question may hold several short controls, which
§4.1 explicitly permits. Every screen's fact set is intact; see decisions
12 and 17.
Completed sections collapse to a one-line summary and can be reopened and
changed at any point, before or after the result (FR-10).

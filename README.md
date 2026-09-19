# B0SS — Business Opportunity Screening System

A rule-based expert system that gives a first-pass screening on a proposed
small business. It applies 25 IF–THEN rules captured from a small-business
advisor to what the user tells it, and returns a recommendation that can be
traced back to the exact rules that produced it.

Its stated purpose is not the verdict. It is the list of assumptions the
user has not yet tested.

## Running it

**No install.** Open `web/index.html` in any browser. The Prolog engine
(Tau-Prolog) runs in the page; there is no server and no backend.

**With a server** (so edits to `kb/*.pl` show up without rebuilding):

```
npm run serve          # http://localhost:8080
```

**Published.** Push to GitHub and enable Pages on the repository root —
`index.html` redirects into `web/`, and `.nojekyll` keeps the vendor files
intact.

## Layout

```
kb/                   the knowledge base — no interface code
  boss_kb.pl          25 fixed domain facts (SRS §5)
  boss_derive.pl      session-fact declarations and derived values (§4.2)
  boss_rules.pl       the 25 expert rules with their certainty factors (§7)
  boss_infer.pl       rule stratification, severity tables, §9.1 priority ladder
  boss_advice.pl      plain-language rule text and next actions (§10)

web/                  the interface — no business knowledge
  index.html          page shell
  schema.js           which control creates which Prolog fact (§4.1);
                      7 sections, 23 questions
  app.js              rendering, progress, saved assessments
  styles.css
  vendor/             Tau-Prolog core + lists modules
  kb-bundle.js        generated; lets the page work from file://
  cases-bundle.js     generated; the six §12 cases as loadable examples

test/
  cases.pl            the six expert validation scenarios (§12)
  run_swi.pl          runs them under SWI-Prolog
  run_tau.js          runs them under Tau-Prolog (the shipping engine)
  run_ui.js           runs them through web/schema.js's fact mapping
  run_browser.js      drives the real page in Chromium

build.js              regenerates the two bundles from kb/ and test/
DECISIONS.md          the five underdetermined SRS points, and how they were resolved
```

The knowledge base and the interface are strictly separate (FR-11): no rule
or certainty factor appears anywhere in `web/`, and no display logic appears
in `kb/`. Editing a rule means editing `kb/boss_rules.pl` and nothing else.

## Testing

```
npm test               # Tau-Prolog + UI-mapping integration, 6 cases each
npm run test:swi       # the same 6 cases under SWI-Prolog
npm run test:e2e       # drives the page in Chromium (needs playwright)
```

All six SRS §12 validation cases pass under both engines with identical
rule traces.

| Case | Scenario | Expected | CF |
|---|---|---|---|
| 1 | Home-based tuition | PROCEED | +0.8 |
| 2 | Bubble tea outlet | NOT RECOMMENDED IN THIS FORM | −0.8 |
| 3 | Cloud kitchen | FURTHER VALIDATION REQUIRED | 0.0 |
| 4 | Home-based web agency | FURTHER VALIDATION REQUIRED | 0.0 |
| 5 | Grocery shop, pawned-jewellery funding | NOT RECOMMENDED | −1.0 |
| 6 | Second salon branch | PROCEED WITH CAUTION | +0.6 |

## What it does not do

It does not analyse market data, predict or guarantee success or failure,
or give legal, tax, accounting, investment or lending advice. It never
outputs a probability of success, and it never converts an unknown answer
into a positive one. See SRS §15.

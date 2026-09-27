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

**With a server** (so edits to `kb/*.pl` show up without rebuilding, and
the knowledge editor can save):

```
npm run serve          # http://localhost:8080/web/
```

## Deploying the expert system with GitHub Pages

The production-ready static site is in `deploy/`. It contains only the
assessment interface, Tau-Prolog runtime, bundled knowledge base and image
assets. The knowledge editor, local server, tests and editable `kb/` source
files are not published.

The workflow in `.github/workflows/pages.yml` uploads only `deploy/` whenever
the `main` branch is pushed. Enable it once on GitHub under **Settings → Pages →
Build and deployment → Source → GitHub Actions**, then commit and push:

```
git add deploy .github/workflows/pages.yml
git commit -m "Deploy expert system with GitHub Pages"
git push origin main
```

The site is published at:

```
https://adeepak2.github.io/BOSS-Expert-System/
```

When the assessment interface changes, update the corresponding files in
`deploy/` before pushing. After changing files in `kb/`, run `node build.js`
and copy the regenerated `web/kb-bundle.js` into `deploy/`.

## Knowledge editor

`http://localhost:8080/web/editor.html`. The passcode is `boss-admin`
until you copy `.env.example` to `.env` and set `BOSS_EDITOR_PASS` there
(or set it in the environment, which takes priority); restart the server
after changing it. It is for the knowledge engineer, not the person
screening a business, so the assessment does not link to it.

- **Rules:** each rule's conclusion, CF, level, conditions, explanation
  and next action. Add or delete rules. A picker inserts conditions over
  the attributes the questionnaire already collects.
- **Facts:** the 25 fixed domain facts, as values to add or remove.
- **Source:** the five `.pl` files as text, for anything the forms do not cover.
- **Changes:** a line diff against what is saved.

After every change the whole knowledge base is checked again. It is
consulted, verified by `kb/boss_kbcheck.pl`, and all eight validation
cases are replayed; a case whose verdict changed is marked. **Save** is
refused while there are errors. The server checks again before writing,
keeps the old files in `kb/.history/`, and rebuilds the bundles. Form
edits change only the clause or line concerned, so comments and layout
in the `.pl` files survive.

Opened directly from disk, the editor is read-only: it still validates, and
**Export** downloads the changed files. The editor is deliberately excluded
from `deploy/` and the GitHub Pages site. See DECISIONS.md, decisions 18 and 19.

## Layout

```
kb/                   the knowledge base — no interface code
  boss_kb.pl          25 fixed domain facts (SRS §5)
  boss_derive.pl      session-fact declarations and derived values (§4.2)
  boss_rules.pl       the 25 expert rules with their certainty factors (§7)
  boss_infer.pl       rule stratification, severity tables, §9.1 priority ladder
  boss_advice.pl      plain-language rule text and next actions (§10)
  boss_kbcheck.pl     knowledge-base verification for the editor; not
                      loaded by the assessment

web/                  the interface — no business knowledge
  index.html          page shell
  schema.js           which control creates which Prolog fact (§4.1);
                      7 sections, 9 questions, 15 inputs
  app.js              step navigation, decision-path diagram, saved assessments
  editor.html/.js/.css  the knowledge editor
  kbtools.js          validation shared by the editor, server.js and the tests
  styles.css
  public/             trademark.png (source) and the logo.png / icon.png
                      generated from it; brand palette is sampled from it
  vendor/             Tau-Prolog core + lists modules
  kb-bundle.js        generated; lets the page work from file://
  cases-bundle.js     generated; the six §12 cases as loadable examples

test/
  cases.pl            the six expert validation scenarios (§12)
  run_swi.pl          runs them under SWI-Prolog
  run_tau.js          runs them under Tau-Prolog (the shipping engine)
  run_ui.js           runs them through web/schema.js's fact mapping
  run_browser.js      drives the real page in Chromium
  run_kbcheck.js      runs the checker on the shipped KB, plus ten mutations it must catch

deploy/               expert-system-only static GitHub Pages package
.github/workflows/
  pages.yml           publishes only deploy/ when main is pushed
build.js              regenerates the two bundles from kb/ and test/
server.js             serves the app and saves editor changes; no dependencies
DECISIONS.md          the five underdetermined SRS points, and how they were resolved
```

The knowledge base and the interface are strictly separate (FR-11): no rule
or certainty factor appears anywhere in `web/`, and no display logic appears
in `kb/`. Editing a rule means editing `kb/boss_rules.pl` and nothing else.

## Testing

```
npm test               # Tau-Prolog + UI mapping + coverage + KB checks
npm run test:swi       # the same 6 cases under SWI-Prolog
npm run test:e2e       # drives the page in Chromium (needs playwright)
```

All eight validation cases pass under both engines with identical rule
traces. `npm test` also asserts coverage: **25/25 rules fire** and **25/25
fixed facts are called** by a rule or derivation.

| Case | Scenario | Expected | CF |
|---|---|---|---|
| 1 | Home-based tuition | PROCEED | +0.8 |
| 2 | Bubble tea outlet | NOT RECOMMENDED IN THIS FORM | −0.8 |
| 3 | Cloud kitchen | FURTHER VALIDATION REQUIRED | 0.0 |
| 4 | Home-based web agency | FURTHER VALIDATION REQUIRED | 0.0 |
| 5 | Grocery shop, pawned-jewellery funding | NOT RECOMMENDED | −1.0 |
| 6 | Second salon branch | PROCEED WITH CAUTION | +0.6 |
| 7 | First-time home baker *(added: R04, R17)* | FURTHER VALIDATION REQUIRED | 0.0 |
| 8 | Food outlet, licence blocker *(added: R21)* | NOT RECOMMENDED | −1.0 |

## What it does not do

It does not analyse market data, predict or guarantee success or failure,
or give legal, tax, accounting, investment or lending advice. It never
outputs a probability of success, and it never converts an unknown answer
into a positive one. See SRS §15.

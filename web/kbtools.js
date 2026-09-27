/* ============================================================
   B0SS - web/kbtools.js
   Validation of a (possibly edited) knowledge base: consult it,
   run kb/boss_kbcheck.pl, replay the SRS section 12 cases and
   measure rule coverage.

   One implementation, three callers: server.js refuses to save a
   knowledge base that fails here, web/editor.js shows the same
   report while the expert edits, and test/run_kbcheck.js runs it
   against the shipped files. Loaded in node via require() and in
   the browser as window.BOSS_KBTOOLS (it then uses window.pl).
   ============================================================ */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    const pl = require('./vendor/tau-prolog-core.js');
    require('./vendor/tau-prolog-lists.js')(pl);
    module.exports = factory(pl, require('./schema.js'));
  } else {
    root.BOSS_KBTOOLS = factory(root.pl, root.BOSS_SCHEMA);
  }
})(typeof self !== 'undefined' ? self : this, function (pl, schema) {
'use strict';

// The five files the assessment consults, in order. The checker is
// consulted after them, by the editor and tests only.
const KB_FILES = ['boss_kb.pl', 'boss_derive.pl', 'boss_rules.pl', 'boss_infer.pl', 'boss_advice.pl'];
const CHECK_FILE = 'boss_kbcheck.pl';
const PRELUDE = ':- use_module(library(lists)).\n';

/* ---------- Tau-Prolog plumbing ---------- */

function consult(session, program) {
  return new Promise((resolve, reject) =>
    session.consult(program, { success: resolve, error: e => reject(e) }));
}

function all(session, goal) {
  return new Promise((resolve, reject) => {
    session.query(goal, {
      success: () => {
        const out = [];
        const next = () => session.answer(a => {
          if (!a || a === false) return resolve(out);
          if (pl.type.is_error(a)) return reject(new Error(pl.format_answer(a)));
          out.push(a.links);
          next();
        });
        next();
      },
      error: e => reject(new Error(pl.format_answer(e)))
    });
  });
}

const show = (t, s) => t.toString({ quoted: false, session: s });
const listOf = t => { const o = []; let c = t; while (c && c.indicator === './2') { o.push(c.args[0]); c = c.args[1]; } return o; };

/* Join the files into one program, remembering where each starts so a
   syntax error can be reported as file:line rather than program line. */
function program(files, names) {
  let text = PRELUDE, line = 2;
  const spans = [];
  for (const f of names) {
    const src = files[f] || '';
    spans.push({ file: f, from: line });
    text += src + '\n';
    line += src.split('\n').length;
  }
  return { text, spans };
}

function locate(spans, line) {
  let hit = null;
  for (const s of spans) if (line >= s.from) hit = s;
  return hit ? { file: hit.file, line: line - hit.from + 1 } : null;
}

function describeConsultError(e, spans) {
  const msg = pl.format_answer(e);
  const m = /line\((\d+)\)/.exec(msg);
  const where = m ? locate(spans, +m[1]) : null;
  const what = (/syntax_error\(([^)]*\))/.exec(msg) || [])[1] || msg.replace(/^uncaught exception: /, '');
  return where ? `${where.file} line ${where.line}: ${what}` : what;
}

/* Every value the questionnaire can produce, as ui_value/2 facts, so the
   checker can tell a misspelt value from a real one. */
function uiValueFacts() {
  if (!schema) return '';
  const seen = new Set();
  for (const sec of schema.SECTIONS)
    for (const q of sec.questions)
      for (const c of q.controls) {
        if (c.unknownFact) seen.add(c.unknownFact + ',unknown');
        if (!c.options) continue;
        for (const o of c.options) {
          const m = schema.optionFacts(c, o);
          for (const k in m) seen.add(k + ',' + m[k]);
        }
      }
  return [...seen].map(p => 'ui_value(' + p + ').').join('\n') + '\n';
}

/* ---------- The SRS section 12 cases ---------- */

// Same shape build.js writes to web/cases-bundle.js.
function parseCases(src) {
  const re = /case\((\d+),\s*'([^']+)',\s*expected\((\w+),\s*(-?[\d.]+)\),\s*\[([\s\S]*?)\]\)\./g;
  const cases = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const answers = {};
    for (const f of m[5].split(',').map(s => s.trim()).filter(Boolean)) {
      const g = /^(\w+)\((.+)\)$/.exec(f);
      if (!g) continue;
      const v = g[2].trim();
      answers[g[1]] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
    }
    cases.push({ id: +m[1], name: m[2], expect: m[3], cf: parseFloat(m[4]), answers });
  }
  return cases;
}

/* Replay one case in an already-consulted session: clear the session
   facts every case uses, assert this case's, and ask for the verdict.
   One consult for all cases instead of one each. */
async function runCase(session, attrs, c) {
  const clear = attrs.map(a => `retractall(${a}(_))`);
  const load = Object.entries(c.answers).map(([k, v]) => `assertz(${k}(${v}))`);
  const goal = clear.concat(load, 'recommendation(R, CF)', 'findall(I, fires(I), Fired)').join(', ') + '.';
  try {
    const [a] = await all(session, goal);
    if (!a) return { ...c, ok: false, why: 'no recommendation' };
    const rec = a.R.id, cf = a.CF.value;
    return { ...c, rec, got: cf, fired: listOf(a.Fired).map(t => t.id),
             ok: rec === c.expect && Math.abs(cf - c.cf) < 0.001 };
  } catch (e) {
    return { ...c, ok: false, why: e.message };
  }
}

/* ---------- The full report ---------- */

/* files: { 'boss_rules.pl': '...', ... , 'boss_kbcheck.pl': '...' }
   cases: parsed cases, or [] to skip replay. */
async function validate(files, cases) {
  const report = { consultError: null, issues: [], cases: [], rules: [], fired: [], ok: false };

  const full = program(files, KB_FILES.concat(CHECK_FILE));
  const s = pl.create(5000000);
  try {
    await consult(s, full.text + uiValueFacts());
  } catch (e) {
    report.consultError = describeConsultError(e, full.spans);
    return report;
  }

  const texts = {};
  for (const r of await all(s, 'check_text(C, T).')) texts[r.C.id] = r.T.id;
  const [iss] = await all(s, 'kb_issues(L).');
  report.issues = listOf(iss.L).map(t => ({
    severity: t.args[0].id,
    code: t.args[1].id,
    subject: show(t.args[2], s),
    text: texts[t.args[1].id] || t.args[1].id
  }));
  report.rules = (await all(s, 'rule_clause(I, _, _, _).')).map(r => r.I.id);

  const attrs = [...new Set(cases.flatMap(c => Object.keys(c.answers)))];
  for (const c of cases) report.cases.push(await runCase(s, attrs, c));
  const fired = new Set();
  for (const r of report.cases) for (const id of r.fired || []) fired.add(id);
  report.fired = report.rules.filter(id => fired.has(id));

  report.errors = report.issues.filter(i => i.severity === 'error').length;
  report.failed = report.cases.filter(c => !c.ok).length;
  report.ok = report.errors === 0;
  return report;
}

return { KB_FILES, CHECK_FILE, PRELUDE, parseCases, validate, uiValueFacts };
});

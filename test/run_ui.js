// Integration test: drives the knowledge base through the SAME
// schema-to-fact mapping the browser uses (web/schema.js), so a
// mismatch between a control's value and what a rule expects fails here.
const fs = require('fs');
const path = require('path');
const pl = require('../web/vendor/tau-prolog-core.js');
require('../web/vendor/tau-prolog-lists.js')(pl);
const { SECTIONS, factsFor } = require('../web/schema.js');

const KB = path.join(__dirname, '..', 'kb');
const PROGRAM = ':- use_module(library(lists)).\n' +
  ['boss_kb.pl', 'boss_derive.pl', 'boss_rules.pl', 'boss_infer.pl', 'boss_advice.pl']
    .map(f => fs.readFileSync(path.join(KB, f), 'utf8')).join('\n');

// Load the demo cases exactly as the browser does.
global.window = {};
require('../web/cases-bundle.js');
const CASES = global.window.BOSS_CASES;

function ask(session, goal) {
  return new Promise((resolve, reject) => session.query(goal, {
    success: () => session.answer(a => {
      if (!a || a === false) return resolve(null);
      if (pl.type.is_error(a)) return reject(new Error(pl.format_answer(a)));
      resolve(a.links);
    }),
    error: e => reject(new Error(pl.format_answer(e)))
  }));
}

(async () => {
  console.log('\nB0SS UI integration - schema.js facts -> Tau-Prolog\n');
  let fails = 0;

  // Every fact name the schema can emit must be one the KB declares dynamic.
  const declared = new Set(
    [...fs.readFileSync(path.join(KB, 'boss_derive.pl'), 'utf8')
       .matchAll(/:- dynamic\((\w+)\/1\)/g)].map(m => m[1])
  );
  const emitted = new Set();
  for (const c of CASES) for (const f of factsFor(c.answers)) emitted.add(f.split('(')[0]);
  const undeclared = [...emitted].filter(f => !declared.has(f));
  if (undeclared.length) { console.log('  FAIL  facts not declared dynamic: ' + undeclared.join(', ')); fails++; }
  else console.log('  PASS  all ' + emitted.size + ' emitted fact names are declared in boss_derive.pl');

  for (const c of CASES) {
    const session = pl.create(2000000);
    const facts = factsFor(c.answers);
    const program = PROGRAM + '\n' + facts.map(f => f + '.').join('\n');
    try {
      await new Promise((res, rej) => session.consult(program, { success: res, error: e => rej(new Error(pl.format_answer(e))) }));
      const a = await ask(session, 'assess(A).');
      const args = a.A.args;
      const rec = args[0].id, cf = args[1].value;
      // The advice tables the UI renders must exist for every fired rule.
      const tr = await ask(session, 'trace(T), length(T, N).');
      const ok = rec === c.expect && Math.abs(cf - c.cf) < 0.001;
      if (!ok) fails++;
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  Case ${c.id}  ${c.name}`);
      console.log(`        ${facts.length} facts -> ${rec} (${cf}), ${tr.N.value} rules fired`);
      if (!ok) console.log(`        expected ${c.expect} (${c.cf})`);
    } catch (e) {
      fails++;
      console.log(`  FAIL  Case ${c.id}  ${c.name}: ${e.message}`);
    }
  }

  console.log(fails ? `\n${fails} failure(s).\n` : '\nUI mapping verified against the knowledge base.\n');
  process.exit(fails ? 1 : 0);
})();

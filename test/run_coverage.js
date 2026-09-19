// Coverage: which of the 25 rules can actually fire given the facts the
// 15-input interface produces, and which of the 25 fixed facts are called.
const fs = require('fs'); const path = require('path');
const pl = require('../web/vendor/tau-prolog-core.js');
require('../web/vendor/tau-prolog-lists.js')(pl);
const { factsFor, answersFromFacts } = require('../web/schema.js');

const KB = path.join(__dirname, '..', 'kb');
const PROGRAM = ':- use_module(library(lists)).\n' +
  ['boss_kb.pl','boss_derive.pl','boss_rules.pl','boss_infer.pl','boss_advice.pl']
    .map(f => fs.readFileSync(path.join(KB, f), 'utf8')).join('\n');

global.window = {}; require('../web/cases-bundle.js');
const CASES = global.window.BOSS_CASES;

const ask = (s, g) => new Promise((res, rej) => s.query(g, {
  success: () => s.answer(a => (!a || a === false) ? res(null)
    : pl.type.is_error(a) ? rej(new Error(pl.format_answer(a))) : res(a.links)),
  error: e => rej(new Error(pl.format_answer(e)))
}));

const toList = t => { const o = []; let c = t; while (c && c.indicator === './2') { o.push(c.args[0]); c = c.args[1]; } return o; };

(async () => {
  const fired = new Set();
  for (const c of CASES) {
    const s = pl.create(2000000);
    const prog = PROGRAM + '\n' + factsFor(answersFromFacts(c.answers)).map(f => f + '.').join('\n');
    await new Promise((r, j) => s.consult(prog, { success: r, error: e => j(new Error(pl.format_answer(e))) }));
    const t = await ask(s, 'findall(I, fires(I), L).');
    for (const x of toList(t.L)) fired.add(x.id);
  }

  const allRules = [...fs.readFileSync(path.join(KB,'boss_rules.pl'),'utf8').matchAll(/^rule\((r\d+)/gm)].map(m => m[1]);
  const unfired = allRules.filter(r => !fired.has(r));

  // Every rule needs a rule_level/2 entry. Without one it is invisible to
  // fires/1 and holds/1 and can never fire - silently, with no error.
  const levelled = new Set([...fs.readFileSync(path.join(KB,'boss_infer.pl'),'utf8')
    .matchAll(/rule_level\((r\d+),\s*\d\)/g)].map(m => m[1]));
  const unlevelled = allRules.filter(r => !levelled.has(r));
  const orphanLevels = [...levelled].filter(r => !allRules.includes(r));

  console.log('\nB0SS coverage\n');
  console.log('  rules in knowledge base : ' + allRules.length);
  console.log('  fired across all cases  : ' + fired.size + '  (' + [...fired].sort().join(' ') + ')');
  console.log('  not fired by any case   : ' + (unfired.length ? unfired.join(' ') : 'none'));
  console.log('  missing a rule_level/2  : ' + (unlevelled.length ? unlevelled.join(' ') + '  <-- can never fire' : 'none'));
  console.log('  rule_level for no rule  : ' + (orphanLevels.length ? orphanLevels.join(' ') : 'none'));

  // Fixed facts: is each predicate called from outside boss_kb.pl?
  const kbSrc = fs.readFileSync(path.join(KB,'boss_kb.pl'),'utf8');
  const preds = {};
  for (const m of kbSrc.matchAll(/^([a-z_]+)\(([a-z_]+)\)\./gm)) (preds[m[1]] ||= []).push(m[2]);
  const consumers = ['boss_rules.pl','boss_derive.pl','boss_infer.pl']
    .map(f => fs.readFileSync(path.join(KB,f),'utf8')).join('\n');
  let used = 0, total = 0;
  const unusedPreds = [];
  for (const p in preds) {
    total += preds[p].length;
    if (new RegExp('\\b' + p + '\\(').test(consumers)) used += preds[p].length;
    else unusedPreds.push(p);
  }
  console.log('\n  fixed facts             : ' + total);
  console.log('  called by a rule/deriv. : ' + used + (unusedPreds.length ? '  (unused: ' + unusedPreds.join(', ') + ')' : ''));

  const ok = fired.size >= 20 && used >= 20
          && unlevelled.length === 0 && orphanLevels.length === 0;
  console.log('\n  >= 20 rules exercised   : ' + (fired.size >= 20 ? 'YES' : 'NO'));
  console.log('  >= 20 facts used        : ' + (used >= 20 ? 'YES' : 'NO'));
  console.log('  every rule levelled     : ' + (unlevelled.length === 0 ? 'YES' : 'NO') + '\n');
  process.exit(ok ? 0 : 1);
})();

// B0SS validation under Tau-Prolog - the engine the prototype ships on.
const fs = require('fs');
const path = require('path');
const pl = require('../web/vendor/tau-prolog-core.js');
require('../web/vendor/tau-prolog-lists.js')(pl);

const KB = path.join(__dirname, '..', 'kb');
const read = f => fs.readFileSync(path.join(KB, f), 'utf8');

const PROGRAM = ':- use_module(library(lists)).\n' +
  ['boss_kb.pl', 'boss_derive.pl', 'boss_rules.pl', 'boss_infer.pl', 'boss_advice.pl']
    .map(read).join('\n');

// Parse the case table out of cases.pl without a Prolog round trip.
const casesSrc = fs.readFileSync(path.join(__dirname, 'cases.pl'), 'utf8');
const cases = [];
const re = /case\((\d+),\s*'([^']+)',\s*expected\((\w+),\s*(-?[\d.]+)\),\s*\[([\s\S]*?)\]\)\./g;
let m;
while ((m = re.exec(casesSrc)) !== null) {
  cases.push({
    id: +m[1], name: m[2], rec: m[3], cf: parseFloat(m[4]),
    facts: m[5].split(',').map(s => s.trim()).filter(Boolean)
      .reduce((acc, s) => { // re-join split arguments (none here, but be safe)
        acc.push(s); return acc;
      }, [])
  });
}

function runCase(c) {
  return new Promise(resolve => {
    const session = pl.create(2000000);
    const program = PROGRAM + '\n' + c.facts.map(f => f + '.').join('\n');
    session.consult(program, {
      success: () => {
        session.query('assess(A).', {
          success: () => {
            session.answer(ans => {
              if (!ans || ans === false || pl.type.is_error(ans)) {
                return resolve({ ok: false, why: 'no answer: ' + pl.format_answer(ans) });
              }
              const txt = pl.format_answer(ans);
              const rec = /assessment\((\w+),\s*(-?[\d.]+)/.exec(txt);
              if (!rec) return resolve({ ok: false, why: 'unparsable: ' + txt.slice(0, 200) });
              const gotRec = rec[1], gotCf = parseFloat(rec[2]);
              session.query('trace(T), length(T, N).', {
                success: () => session.answer(a2 => {
                  const n = (a2 && a2.links && a2.links.N) ? a2.links.N.value : '?';
                  resolve({
                    ok: gotRec === c.rec && Math.abs(gotCf - c.cf) < 0.001,
                    gotRec, gotCf, nFired: n
                  });
                }),
                error: () => resolve({ ok: false, why: 'trace query failed' })
              });
            });
          },
          error: e => resolve({ ok: false, why: 'query error: ' + pl.format_answer(e) })
        });
      },
      error: e => resolve({ ok: false, why: 'consult error: ' + pl.format_answer(e) })
    });
  });
}

(async () => {
  console.log('\nB0SS validation under Tau-Prolog\n');
  let fails = 0;
  for (const c of cases) {
    const r = await runCase(c);
    if (r.ok) {
      console.log(`  PASS  Case ${c.id}  ${c.name}`);
      console.log(`        -> ${r.gotRec} (${r.gotCf})  rules fired: ${r.nFired}`);
    } else {
      fails++;
      console.log(`  FAIL  Case ${c.id}  ${c.name}`);
      console.log(`        expected ${c.rec} (${c.cf})  got ${r.gotRec} (${r.gotCf}) ${r.why || ''}`);
    }
  }
  console.log(fails ? `\n${fails} failure(s).\n` : '\nAll 6 cases passed under Tau-Prolog.\n');
  process.exit(fails ? 1 : 0);
})();

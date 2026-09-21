// Knowledge-base verification: kb/boss_kbcheck.pl against the shipped
// knowledge base, plus the section 12 cases replayed through the same
// validator the knowledge editor and server.js use. Errors fail the
// run; warnings are listed for the expert.
const fs = require('fs');
const path = require('path');
const { KB_FILES, CHECK_FILE, parseCases, validate } = require('../web/kbtools.js');

const KB = path.join(__dirname, '..', 'kb');
const files = {};
for (const f of KB_FILES.concat(CHECK_FILE)) files[f] = fs.readFileSync(path.join(KB, f), 'utf8');
const cases = parseCases(fs.readFileSync(path.join(__dirname, 'cases.pl'), 'utf8'));

// Each mutation breaks the knowledge base one way; the checker must say so.
const MUTATIONS = [
  ['CF above 1',           'boss_rules.pl',  "market_attractiveness(high), 0.8)", "market_attractiveness(high), 1.8)", 'cf_out_of_range'],
  ['rule with no level',   'boss_infer.pl',  'rule_level(r13, 2).', '', 'no_level'],
  ['misspelt value',       'boss_rules.pl',  'member(D, [observed, validated]),\n    target', 'member(D, [observed, validatd]),\n    target', 'unknown_value'],
  ['misspelt attribute',   'boss_rules.pl',  'owner_experience(direct)', 'owner_experince(direct)', 'undefined_goal'],
  ['reads its own level',  'boss_rules.pl',  'holds_upto(1, financial', 'holds_upto(2, financial', 'stratification'],
  ['reserved rule deleted','boss_rules.pl',  'rule(r21,', 'rule(r99,', 'reserved_missing'],
  ['duplicate id',         'boss_rules.pl',  'rule(r06,', 'rule(r05,', 'duplicate_id'],
  ['no explanation text',  'boss_advice.pl', "rule_text(r19,", "rule_textx(r19,", 'no_text'],
  ['fixed fact removed',   'boss_kb.pl',     'demand_level(observed).\n', '', 'ui_unrecognised'],
  ['syntax error',         'boss_rules.pl',  'dependency(high).', 'dependency(high', null],
];

async function mutations() {
  let bad = 0;
  console.log('  mutation tests');
  for (const [name, file, from, to, code] of MUTATIONS) {
    if (!files[file].includes(from)) { console.log(`    SKIP  ${name}: pattern not found`); bad++; continue; }
    const r = await validate({ ...files, [file]: files[file].replace(from, to) }, []);
    const caught = code ? r.issues.some(i => i.code === code && i.severity === 'error') : !!r.consultError;
    if (!caught) bad++;
    console.log(`    ${caught ? 'ok  ' : 'MISS'}  ${name.padEnd(22)} -> ${code || 'consult error'}${code ? '' : ': ' + r.consultError}`);
  }
  return bad;
}

(async () => {
  const r = await validate(files, cases);
  console.log('\nB0SS knowledge-base checks\n');
  if (r.consultError) { console.log('  consult error: ' + r.consultError + '\n'); process.exit(1); }
  for (const i of r.issues)
    console.log(`  ${i.severity === 'error' ? 'ERROR' : 'warn '}  ${i.subject.padEnd(34)} ${i.text}`);
  console.log(`\n  ${r.errors} error(s), ${r.issues.length - r.errors} warning(s)`);
  console.log(`  cases passing: ${r.cases.length - r.failed}/${r.cases.length}`);
  console.log(`  rules fired  : ${r.fired.length}/${r.rules.length}\n`);
  const missed = await mutations();
  console.log('');
  process.exit(r.ok && !r.failed && !missed ? 0 : 1);
})();

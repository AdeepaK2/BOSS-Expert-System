/* ============================================================
   B0SS - knowledge editor.

   The knowledge engineer's view of kb/*.pl. The file texts are
   the only state: the Rules and Facts tabs parse them, and every
   edit made there is a targeted text replacement, so comments and
   layout in the .pl files survive. After each edit the whole
   knowledge base is re-validated (web/kbtools.js): consulted,
   checked by kb/boss_kbcheck.pl, and replayed against the SRS
   section 12 cases.

   Saving goes through server.js, which validates again and
   refuses a knowledge base with errors. Without the server (file://
   or GitHub Pages) the editor is read-only apart from Export.
   ============================================================ */

(function () {
'use strict';

const T = BOSS_KBTOOLS;
const S = BOSS_SCHEMA;
const RULES = 'boss_rules.pl', INFER = 'boss_infer.pl', ADVICE = 'boss_advice.pl',
      FACTS = 'boss_kb.pl', DERIVE = 'boss_derive.pl';
const PASS_KEY = 'boss.editor.pass';
const ADDED_HEADER = '% ---------- Added in the knowledge editor ----------';

const state = {
  server: false, pass: '',
  files: {}, saved: {}, cases: [],
  tab: 'rules', source: RULES, open: new Set(),
  report: null, baseline: null, checking: false, seq: 0
};

const $  = s => document.querySelector(s);
const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
const dirtyFiles = () => T.KB_FILES.filter(f => state.files[f] !== state.saved[f]);

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200);
}

function show(view) {
  for (const v of document.querySelectorAll('.view')) v.classList.add('hidden');
  $('#view-' + view).classList.remove('hidden');
}

/* ---------- 1. Reading Prolog source ---------- */

const SYMBOL = '+-*/\\^<>=~:.?@#&$';

// Top-level clauses with their offsets. Enough of the Prolog lexer to
// skip comments and quoted atoms and to tell an end '.' from 0.8 or =..
function clauses(src) {
  const out = [];
  const n = src.length;
  let i = 0, start = -1, depth = 0;
  while (i < n) {
    const ch = src[i];
    if (ch === '%') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (ch === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (start < 0) { if (/\s/.test(ch)) { i++; continue; } start = i; }
    if (ch === "'" || ch === '"') {
      i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === ch) { if (src[i + 1] === ch) { i += 2; continue; } break; }
        i++;
      }
      i++; continue;
    }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === '.' && depth <= 0 && !SYMBOL.includes(src[i - 1] || ' ') &&
             (i + 1 >= n || /[\s%]/.test(src[i + 1]))) {
      out.push({ start, end: i + 1, text: src.slice(start, i + 1) });
      start = -1; depth = 0;
    }
    i++;
  }
  return out;
}

function matchParen(s, open) {
  let depth = 0, q = null;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c) && --depth === 0) return i;
  }
  return -1;
}

function splitArgs(s) {
  const out = [];
  let depth = 0, q = null, cur = '';
  for (const c of s) {
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

// The comment lines directly above a clause (no blank line between),
// excluding section rules like "% ---------- Market ----------".
function commentAbove(src, pos) {
  let start = pos;
  for (;;) {
    const prevEnd = start - 1;
    if (prevEnd < 0) break;
    const prevStart = src.lastIndexOf('\n', prevEnd - 1) + 1;
    const line = src.slice(prevStart, prevEnd);
    if (!/^\s*%/.test(line) || /^\s*%\s*-{3,}/.test(line)) break;
    start = prevStart;
  }
  return start;
}

function dedent(body) {
  const lines = body.split('\n');
  const rest = lines.slice(1).filter(l => l.trim());
  const pad = rest.length ? Math.min(...rest.map(l => l.match(/^ */)[0].length)) : 0;
  return [lines[0]].concat(lines.slice(1).map(l => l.slice(Math.min(pad, l.match(/^ */)[0].length)))).join('\n');
}

function parseRules(src) {
  const rules = [];
  for (const c of clauses(src)) {
    if (!/^rule\s*\(/.test(c.text)) continue;
    const open = c.text.indexOf('(');
    const close = matchParen(c.text, open);
    if (close < 0) continue;
    const args = splitArgs(c.text.slice(open + 1, close));
    if (args.length !== 3) continue;
    const rest = c.text.slice(close + 1);
    const neck = /^\s*:-\s*/.exec(rest);
    const commentStart = commentAbove(src, c.start);
    rules.push({
      id: args[0], concl: args[1], cf: args[2],
      body: neck ? dedent(rest.slice(neck[0].length, -1)) : 'true',
      start: c.start, end: c.end, headEnd: c.start + close + 1, commentStart,
      comment: src.slice(commentStart, c.start).replace(/^\s*%\s?/gm, '').trim()
    });
  }
  return rules;
}

function unquote(q) { return q.replace(/''/g, "'").replace(/\\\\/g, '\\'); }
function quote(s) { return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "''") + "'"; }

const QUOTED = "'((?:[^'\\\\]|''|\\\\.)*)'";
const factLine = (pred, id) => new RegExp('^' + pred + '\\(\\s*' + id + '\\s*,\\s*' + QUOTED + '\\)\\.[ \\t]*$', 'm');

function textOf(pred, id) {
  const m = factLine(pred, id).exec(state.files[ADVICE]);
  return m ? unquote(m[1]) : '';
}

function levelOf(id) {
  const m = new RegExp('rule_level\\(\\s*' + id + '\\s*,\\s*(\\d+)\\s*\\)\\.').exec(state.files[INFER]);
  return m ? +m[1] : null;
}

/* ---------- 2. Editing Prolog source ---------- */

function setFile(f, src) {
  if (state.files[f] === src) return;
  state.files[f] = src;
  changed();
}

// Insert a line after the last line that starts with prefix (or at the end).
function insertAfterLast(src, prefix, line) {
  const re = new RegExp('^' + prefix + '.*$', 'gm');
  let last = null, m;
  while ((m = re.exec(src)) !== null) last = m;
  if (!last) return src.replace(/\s*$/, '\n') + line + '\n';
  const at = last.index + last[0].length;
  return src.slice(0, at) + '\n' + line + src.slice(at);
}

function removeLineAt(src, index, length) {
  const ls = src.lastIndexOf('\n', index - 1) + 1;
  let le = src.indexOf('\n', index + length); if (le < 0) le = src.length;
  const rest = src.slice(ls, index) + src.slice(index + length, le);
  if (rest.trim()) return src.slice(0, index) + src.slice(index + length).replace(/^[ \t]+/, '');
  return src.slice(0, ls) + src.slice(le + 1);
}

function setText(pred, id, value) {
  let src = state.files[ADVICE];
  const m = factLine(pred, id).exec(src);
  value = value.trim();
  if (!value) { if (m) src = removeLineAt(src, m.index, m[0].length); }
  else {
    const line = `${pred}(${id}, ${quote(value)}).`;
    src = m ? src.slice(0, m.index) + line + src.slice(m.index + m[0].length)
            : insertAfterLast(src, pred + '\\(', line);
  }
  setFile(ADVICE, src);
}

function setLevel(id, level) {
  let src = state.files[INFER];
  const re = new RegExp('rule_level\\(\\s*' + id + '\\s*,\\s*\\d+\\s*\\)\\.');
  const m = re.exec(src);
  if (level == null) { if (m) src = removeLineAt(src, m.index, m[0].length); }
  else if (m) src = src.slice(0, m.index) + `rule_level(${id}, ${level}).` + src.slice(m.index + m[0].length);
  else src = insertAfterLast(src, 'rule_level\\(', `rule_level(${id}, ${level}).`);
  setFile(INFER, src);
}

function cleanBody(b) {
  b = b.replace(/\s+$/, '').replace(/\.$/, '').replace(/^\s+/, '');
  return b || 'true';
}

function setRule(id, patch) {
  let src = state.files[RULES];
  const r = parseRules(src).find(x => x.id === id);
  if (!r) return;
  // Body first: it lies after the head, so the head offsets stay valid.
  if ('body' in patch) {
    const body = cleanBody(patch.body).split('\n').join('\n    ');
    src = src.slice(0, r.headEnd) + ' :-\n    ' + body + '.' + src.slice(r.end);
  }
  if ('concl' in patch || 'cf' in patch) {
    const head = `rule(${id}, ${patch.concl ?? r.concl}, ${patch.cf ?? r.cf})`;
    src = src.slice(0, r.start) + head + src.slice(r.headEnd);
  }
  setFile(RULES, src);
}

function nextRuleId() {
  const n = parseRules(state.files[RULES]).map(r => +(/^r(\d+)$/.exec(r.id) || [0, 0])[1]);
  return 'r' + String(Math.max(0, ...n) + 1).padStart(2, '0');
}

function addRule() {
  const id = nextRuleId();
  const text = 'New rule: say in plain words what it means.';
  let src = state.files[RULES].replace(/\s*$/, '\n');
  if (!src.includes(ADDED_HEADER)) src += '\n' + ADDED_HEADER + '\n';
  src += `\n% ${id.toUpperCase()} - added in the knowledge editor.\n` +
         `rule(${id}, overall_risk(high), -0.4) :-\n    dependency(high).\n`;
  state.files[RULES] = src;
  state.files[ADVICE] = insertAfterLast(state.files[ADVICE], 'rule_text\\(', `rule_text(${id}, ${quote(text)}).`);
  setLevel(id, 1);
  state.open.add(id);
  renderMain();
  const row = document.querySelector(`.rule[data-id="${id}"]`);
  if (row) { row.scrollIntoView({ block: 'center' }); row.querySelector('textarea')?.focus(); }
}

function deleteRule(id) {
  const reserved = ['r10', 'r11', 'r21', 'r22', 'r23', 'r24', 'r25'].includes(id);
  const msg = `Delete ${id.toUpperCase()}, with its level, explanation and next action?` +
    (reserved ? `\n\n${id.toUpperCase()} is named directly in boss_infer.pl. The checker will refuse to save without it.` : '');
  if (!confirm(msg)) return;
  let src = state.files[RULES];
  const r = parseRules(src).find(x => x.id === id);
  if (!r) return;
  let before = src.slice(0, r.commentStart), after = src.slice(r.end).replace(/^[ \t]*\n/, '');
  if (/\n\n$/.test(before) && /^\n/.test(after)) after = after.slice(1);
  state.files[RULES] = before + after;
  let adv = state.files[ADVICE];
  for (const p of ['rule_text', 'next_action']) {
    const m = factLine(p, id).exec(adv);
    if (m) adv = removeLineAt(adv, m.index, m[0].length);
  }
  state.files[ADVICE] = adv;
  state.open.delete(id);
  setLevel(id, null);
  changed();
  renderMain();
}

/* ---------- 3. Fixed facts (boss_kb.pl) ---------- */

function parseFacts(src) {
  const groups = new Map();
  for (const c of clauses(src)) {
    const m = /^([a-z]\w*)\(([a-z]\w*)\)\.$/.exec(c.text);
    if (!m) continue;
    if (!groups.has(m[1])) {
      const heads = [...src.slice(0, c.start).matchAll(/^%\s*-{3}\s*(.+?)\s*-{3}\s*$/gm)];
      const title = heads.length ? heads[heads.length - 1][1].replace(/\s*\(\d+\)\s*$/, '') : m[1];
      groups.set(m[1], { name: m[1], title, values: [] });
    }
    groups.get(m[1]).values.push({ value: m[2], start: c.start, end: c.end });
  }
  return [...groups.values()];
}

function addFact(name, value) {
  const src = state.files[FACTS];
  const g = parseFacts(src).find(x => x.name === name);
  if (!g || g.values.some(v => v.value === value)) return;
  const at = g.values[g.values.length - 1].end;
  setFile(FACTS, src.slice(0, at) + `\n${name}(${value}).` + src.slice(at));
}

function removeFact(name, value) {
  const src = state.files[FACTS];
  const v = parseFacts(src).find(x => x.name === name)?.values.find(x => x.value === value);
  if (v) setFile(FACTS, removeLineAt(src, v.start, v.end - v.start));
}

/* ---------- 4. Vocabulary for writing conditions ---------- */

// What a condition may test: the answers the questionnaire produces
// (schema.js), numeric inputs, and values derived in boss_derive.pl.
function vocabulary() {
  const answers = new Map(), numeric = new Set();
  const add = (k, v) => { if (!answers.has(k)) answers.set(k, new Set()); answers.get(k).add(String(v)); };
  for (const sec of S.SECTIONS) for (const q of sec.questions) for (const c of q.controls) {
    if (c.unknownFact) add(c.unknownFact, 'unknown'), add(c.unknownFact, 'known');
    if (c.type === 'number') { numeric.add(c.fact); continue; }
    for (const o of c.options || []) { const m = S.optionFacts(c, o); for (const k in m) add(k, m[k]); }
  }
  const derived = new Set();
  for (const m of state.files[DERIVE].matchAll(/^([a-z]\w*)\((?:[A-Z_]\w*|[a-z]\w*|\d+)\)\s*:-/gm))
    if (!answers.has(m[1]) && !numeric.has(m[1])) derived.add(m[1]);
  return { answers, numeric: [...numeric], derived: [...derived, 'holds'] };
}

const varName = a => a.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('');

function appendCondition(ta, goal) {
  const v = ta.value.replace(/\s+$/, '').replace(/\.$/, '');
  ta.value = v && v !== 'true' ? v.replace(/,?$/, ',') + '\n' + goal : goal;
  ta.dispatchEvent(new Event('change'));
  ta.focus();
}

/* ---------- 5. Rendering: rules ---------- */

const LEVELS = [
  [1, '1 · from the answers'],
  [2, '2 · reads level-1 conclusions'],
  [3, '3 · verdict rule']
];

function fmtCF(cf) {
  const n = Number(cf);
  if (!isFinite(n) || cf === '') return String(cf);
  return (n > 0 ? '+' : '') + (Number.isInteger(n) ? n.toFixed(1) : String(n));
}

function field(label, input, hint) {
  const f = el('label', 'fld');
  f.append(el('span', 'fld-l', label), input);
  if (hint) f.append(el('span', 'fld-h', hint));
  return f;
}

function renderRules(host) {
  host.append(el('p', 'ed-lede',
    'Each rule reads rule(Id, Conclusion, CF) :- Conditions. Change a certainty factor, ' +
    'rewrite a condition or add a rule; the Validation panel re-checks the whole knowledge base as you go.'));

  const rules = parseRules(state.files[RULES]);
  const concls = new Set(rules.map(r => r.concl));
  const dl = el('datalist'); dl.id = 'concl-list';
  for (const c of concls) { const o = el('option'); o.value = c; dl.append(o); }
  host.append(dl);

  const list = el('div', 'rules');
  for (const r of rules) list.append(ruleRow(r));
  host.append(list);

  const add = el('button', 'btn btn-sm', '+ Add rule');
  add.onclick = addRule;
  const bar = el('div', 'ed-add'); bar.append(add); host.append(bar);
  updateFlags();
}

function ruleRow(r) {
  const row = el('div', 'rule'); row.dataset.id = r.id;
  const open = state.open.has(r.id);

  const head = el('button', 'rule-head');
  head.setAttribute('aria-expanded', open);
  const main = el('span', 'rule-main');
  main.append(el('span', 'rule-concl mono', r.concl), el('span', 'rule-text', textOf('rule_text', r.id) || '—'));
  head.append(el('span', 'rid', r.id.toUpperCase()), main, el('span', 'rule-flags'), el('span', 'rule-cf mono', fmtCF(r.cf)));
  head.onclick = () => {
    state.open.has(r.id) ? state.open.delete(r.id) : state.open.add(r.id);
    row.replaceWith(ruleRow(parseRules(state.files[RULES]).find(x => x.id === r.id) || r));
    updateFlags();
  };
  row.append(head);
  if (!open) return row;

  const body = el('div', 'rule-body');
  if (r.comment) body.append(el('p', 'rule-note', r.comment));

  const grid = el('div', 'rule-grid');
  const concl = el('input', 'mono'); concl.value = r.concl; concl.setAttribute('list', 'concl-list'); concl.spellcheck = false;
  concl.onchange = () => { setRule(r.id, { concl: concl.value.trim() || r.concl }); head.querySelector('.rule-concl').textContent = concl.value.trim(); };

  const cf = el('input', 'mono'); cf.type = 'number'; cf.step = '0.1'; cf.min = '-1'; cf.max = '1'; cf.value = r.cf;
  cf.onchange = () => {
    const v = cf.value.trim() === '' ? r.cf : (Number.isInteger(+cf.value) ? (+cf.value).toFixed(1) : String(+cf.value));
    setRule(r.id, { cf: v }); head.querySelector('.rule-cf').textContent = fmtCF(v);
  };

  const lvl = el('select');
  const cur = levelOf(r.id);
  if (cur == null) { const o = el('option', null, 'none — never fires'); o.value = ''; lvl.append(o); }
  for (const [v, l] of LEVELS) { const o = el('option', null, l); o.value = v; lvl.append(o); }
  lvl.value = cur == null ? '' : cur;
  lvl.onchange = () => setLevel(r.id, lvl.value ? +lvl.value : null);

  grid.append(
    field('Conclusion', concl),
    field('Certainty factor', cf, '−1 … +1. Belief in the conclusion, not a probability of success.'),
    field('Level', lvl)
  );
  body.append(grid);

  const cond = el('textarea', 'mono');
  cond.value = r.body; cond.spellcheck = false;
  cond.rows = Math.max(3, r.body.split('\n').length + 1);
  cond.onchange = () => setRule(r.id, { body: cond.value });
  body.append(field('When (conditions, comma-separated)', cond));
  body.append(vocabPicker(cond));

  const txt = el('input'); txt.value = textOf('rule_text', r.id);
  txt.onchange = () => { setText('rule_text', r.id, txt.value); head.querySelector('.rule-text').textContent = txt.value.trim() || '—'; };
  const act = el('input'); act.value = textOf('next_action', r.id);
  act.placeholder = 'Only needed when the rule raises a concern (negative CF)';
  act.onchange = () => setText('next_action', r.id, act.value);
  body.append(field('Explanation shown to the user', txt), field('Next action', act));

  body.append(el('div', 'rule-issues'));
  const del = el('button', 'btn btn-sm btn-danger', 'Delete rule');
  del.onclick = () => deleteRule(r.id);
  const foot = el('div', 'rule-foot'); foot.append(del); body.append(foot);

  row.append(body);
  return row;
}

function vocabPicker(ta) {
  const v = vocabulary();
  const d = el('details', 'vocab');
  d.append(el('summary', null, 'Insert a condition'));
  const chip = (label, goal, cls) => {
    const b = el('button', 'chip mono' + (cls ? ' ' + cls : ''), label);
    b.type = 'button'; b.onclick = () => appendCondition(ta, goal);
    return b;
  };
  const grp = (title, items) => { const g = el('div', 'vocab-g'); g.append(el('span', 'vocab-t', title)); const w = el('div', 'chips'); w.append(...items); g.append(w); return g; };
  for (const [attr, vals] of v.answers)
    d.append(grp(attr, [...vals].map(val => chip(val, `${attr}(${val})`))));
  d.append(grp('Numbers', v.numeric.map(a => chip(a, `${a}(${varName(a)})`))));
  d.append(grp('Derived', v.derived.map(a => chip(a, a === 'holds' ? 'holds(Conclusion)' : `${a}(${varName(a)})`))));
  return d;
}

// Rule ids mentioned by an issue's subject ("r01-r02:..." names both).
const issueRules = i => [...new Set(i.subject.match(/\br\d+\b/g) || [])];

function updateFlags() {
  const byRule = {};
  for (const i of state.report?.issues || []) for (const id of issueRules(i)) (byRule[id] ||= []).push(i);
  for (const row of document.querySelectorAll('.rule')) {
    const iss = byRule[row.dataset.id] || [];
    const flags = row.querySelector('.rule-flags');
    flags.textContent = '';
    const e = iss.filter(i => i.severity === 'error').length, w = iss.length - e;
    if (e) flags.append(el('span', 'flag bad', e + ' error' + (e > 1 ? 's' : '')));
    else if (w) flags.append(el('span', 'flag warn', w + ' warning' + (w > 1 ? 's' : '')));
    const box = row.querySelector('.rule-issues');
    if (box) { box.textContent = ''; for (const i of iss) box.append(issueLine(i)); }
  }
}

/* ---------- 6. Rendering: facts, source, changes ---------- */

function renderFacts(host) {
  host.append(el('p', 'ed-lede',
    'The fixed domain facts every assessment shares (SRS section 5). Removing a value a rule still tests ' +
    'is caught by the checker.'));
  for (const g of parseFacts(state.files[FACTS])) {
    const sec = el('section', 'fact-g');
    const h = el('h3'); h.append(el('span', null, g.title), el('span', 'fact-n mono', `${g.name}/1 · ${g.values.length}`));
    sec.append(h);
    const chips = el('div', 'chips');
    for (const v of g.values) {
      const c = el('span', 'chip mono', v.value);
      const x = el('button', 'chip-x', '×'); x.title = 'Remove ' + v.value; x.setAttribute('aria-label', 'Remove ' + v.value);
      x.onclick = () => { removeFact(g.name, v.value); renderMain(); };
      c.append(x); chips.append(c);
    }
    const form = el('form', 'fact-add');
    const inp = el('input', 'mono'); inp.placeholder = 'new_value'; inp.spellcheck = false; inp.setAttribute('aria-label', 'New ' + g.name);
    const b = el('button', 'btn btn-sm', 'Add'); b.type = 'submit';
    form.append(inp, b);
    form.onsubmit = e => {
      e.preventDefault();
      const v = inp.value.trim();
      if (!/^[a-z][a-z0-9_]*$/.test(v)) { toast('Use a lowercase atom: letters, digits and _'); return; }
      addFact(g.name, v); renderMain();
      document.querySelector(`.fact-g input[aria-label="New ${g.name}"]`)?.focus();
    };
    sec.append(chips, form);
    host.append(sec);
  }
}

function renderSource(host) {
  const bar = el('div', 'seg');
  for (const f of T.KB_FILES) {
    const b = el('button', f === state.source ? 'on' : '', f + (state.files[f] !== state.saved[f] ? ' •' : ''));
    b.onclick = () => { state.source = f; renderMain(); };
    bar.append(b);
  }
  host.append(bar);
  const ta = el('textarea', 'mono src'); ta.id = 'src'; ta.spellcheck = false;
  ta.value = state.files[state.source];
  ta.oninput = () => {
    state.files[state.source] = ta.value;
    changed();
    bar.querySelector('.on').textContent = state.source + (ta.value !== state.saved[state.source] ? ' •' : '');
  };
  host.append(ta);
}

function gotoLine(file, line) {
  state.source = file; setTab('source');
  const ta = $('#src'); if (!ta) return;
  const lines = ta.value.split('\n');
  const from = lines.slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0);
  ta.focus(); ta.setSelectionRange(from, from + (lines[line - 1] || '').length);
  ta.scrollTop = Math.max(0, (line - 5) * parseFloat(getComputedStyle(ta).lineHeight));
}

// Line diff by longest common subsequence; the files are a few hundred lines.
function diff(a, b) {
  const A = a.split('\n'), B = b.split('\n'), n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { ops.push([' ', A[i], i + 1]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { ops.push(['-', A[i], i + 1]); i++; }
    else { ops.push(['+', B[j], j + 1]); j++; }
  }
  while (i < n) { ops.push(['-', A[i], i + 1]); i++; }
  while (j < m) { ops.push(['+', B[j], j + 1]); j++; }
  return ops;
}

function renderChanges(host) {
  const files = dirtyFiles();
  if (!files.length) { host.append(el('p', 'ed-lede', 'No changes since the last save.')); return; }
  for (const f of files) {
    const sec = el('section', 'chg');
    const h = el('h3'); h.append(el('span', 'mono', f));
    const rev = el('button', 'btn btn-sm', 'Revert file');
    rev.onclick = () => { if (confirm('Discard your changes to ' + f + '?')) { setFile(f, state.saved[f]); renderMain(); } };
    h.append(rev); sec.append(h);
    const ops = diff(state.saved[f], state.files[f]);
    const keep = ops.map((o, k) => ops.slice(Math.max(0, k - 2), k + 3).some(x => x[0] !== ' '));
    const pre = el('pre', 'diff mono');
    let gap = false;
    ops.forEach((o, k) => {
      if (!keep[k]) { if (!gap) pre.append(el('span', 'd-gap', '⋯\n')); gap = true; return; }
      gap = false;
      pre.append(el('span', o[0] === '+' ? 'd-add' : o[0] === '-' ? 'd-del' : 'd-ctx', o[0] + ' ' + o[1] + '\n'));
    });
    sec.append(pre);
    host.append(sec);
  }
}

function renderMain() {
  const host = $('#ed-main');
  const top = host.scrollTop;
  host.textContent = '';
  const inner = el('div', 'ed-inner');
  ({ rules: renderRules, facts: renderFacts, source: renderSource, changes: renderChanges })[state.tab](inner);
  host.append(inner);
  host.scrollTop = top;
  for (const b of document.querySelectorAll('#tabs button')) {
    b.classList.toggle('on', b.dataset.tab === state.tab);
    if (b.dataset.tab === 'changes') b.textContent = 'Changes' + (dirtyFiles().length ? ` (${dirtyFiles().length})` : '');
  }
}

function setTab(t) {
  state.tab = t;
  $('#ed-main').scrollTop = 0;
  renderMain();
}

/* ---------- 7. Validation panel ---------- */

const VERDICT = {
  proceed: 'Proceed', proceed_with_caution: 'Proceed with caution',
  further_validation_required: 'Further validation', not_recommended: 'Not recommended',
  not_recommended_in_this_form: 'Not in this form', out_of_scope: 'Out of scope'
};
const verdict = (rec, cf) => (VERDICT[rec] || rec) + ' ' + fmtCF(cf);

function openRule(id) {
  state.open.add(id);
  setTab('rules');
  document.querySelector(`.rule[data-id="${id}"]`)?.scrollIntoView({ block: 'center' });
}

// "r01-r02:C1/C2" -> R01 and R02 / C1 vs C2; "r05-1.8" -> R05 / 1.8.
function issueParts(i) {
  let m = /^(r\d+)-(r\d+):(.+)\/(.+)$/.exec(i.subject);
  if (m) return { ids: [m[1], m[2]], detail: `${m[3]}  vs  ${m[4]}` };
  m = /^(r\d+)(?:-(.+))?$/.exec(i.subject);
  if (m) return { ids: [m[1]], detail: m[2] || '' };
  return { ids: [], detail: i.subject };
}

function issueLine(i) {
  const li = el('div', 'iss ' + (i.severity === 'error' ? 'bad' : 'warn'));
  const { ids, detail } = issueParts(i);
  const head = el('span', 'iss-s');
  ids.forEach((id, k) => {
    if (k) head.append(document.createTextNode(' and '));
    const a = el('button', 'linkish mono', id.toUpperCase()); a.onclick = () => openRule(id); head.append(a);
  });
  if (ids.length) head.append(document.createTextNode(' '));
  head.append(el('span', 'iss-t', i.text));
  li.append(head);
  if (detail) li.append(el('span', 'iss-d mono', detail));
  return li;
}

function renderSide() {
  const side = $('#ed-side');
  side.textContent = '';
  const r = state.report;
  const h = el('h2', 'side-h', 'Validation');
  if (state.checking) h.append(el('span', 'side-busy', 'checking…'));
  side.append(h);
  if (!r) return;

  if (r.consultError) {
    const box = el('div', 'iss bad');
    const m = /^(\S+\.pl) line (\d+): (.*)$/.exec(r.consultError);
    box.append(el('span', 'iss-t', 'The knowledge base does not load.'));
    if (m) {
      const a = el('button', 'linkish mono', `${m[1]} line ${m[2]}`);
      a.onclick = () => gotoLine(m[1], +m[2]);
      box.append(a, el('span', 'iss-t mono', m[3]));
    } else box.append(el('span', 'iss-t mono', r.consultError));
    side.append(box);
    return;
  }

  const errs = r.issues.filter(i => i.severity === 'error'), warns = r.issues.filter(i => i.severity !== 'error');
  const sec = (title, n) => { const s = el('section', 'side-s'); const t = el('h3', null, title); t.append(el('span', 'side-n mono', String(n))); s.append(t); side.append(s); return s; };

  const e = sec('Errors', errs.length);
  if (!errs.length) e.append(el('p', 'side-ok', 'None. The knowledge base can be saved.'));
  for (const i of errs) e.append(issueLine(i));

  const w = sec('Warnings', warns.length);
  if (!warns.length) w.append(el('p', 'side-ok', 'None.'));
  for (const i of warns) w.append(issueLine(i));

  const passed = r.cases.filter(c => c.ok).length;
  const c = sec('Validation cases', `${passed}/${r.cases.length}`);
  const base = {}; for (const b of state.baseline?.cases || []) base[b.id] = b;
  for (const k of r.cases) {
    const row = el('div', 'case ' + (k.ok ? 'ok' : 'bad'));
    row.append(el('span', 'case-id mono', String(k.id)));
    const body = el('span', 'case-b');
    body.append(el('span', 'case-name', k.name));
    const got = k.why ? 'Error: ' + k.why : verdict(k.rec, k.got);
    body.append(el('span', 'case-v', k.ok ? got : `Expected ${verdict(k.expect, k.cf)} · got ${got}`));
    const b = base[k.id];
    if (b && (b.rec !== k.rec || b.got !== k.got)) body.append(el('span', 'case-chg', 'changed by your edits'));
    row.append(body, el('span', 'case-m', k.ok ? '✓' : '✗'));
    c.append(row);
  }

  const cov = sec('Coverage', `${r.fired.length}/${r.rules.length}`);
  const unfired = r.rules.filter(id => !r.fired.includes(id));
  cov.append(el('p', 'side-ok', unfired.length
    ? 'Never fired by any case: ' + unfired.map(x => x.toUpperCase()).join(', ') + '. Add a case to test it.'
    : 'Every rule fires in at least one case.'));
}

function renderStatus() {
  const s = $('#ed-status');
  const r = state.report, dirty = dirtyFiles().length;
  s.textContent = '';
  s.className = 'ed-status';
  if (state.checking || !r) s.append(el('span', null, 'Checking…'));
  else if (r.consultError) { s.classList.add('bad'); s.append(el('span', null, 'Does not load')); }
  else {
    const passed = r.cases.filter(c => c.ok).length;
    if (r.errors) s.classList.add('bad'); else if (r.failed) s.classList.add('warn');
    s.append(el('span', null, `${r.errors} error${r.errors === 1 ? '' : 's'} · ${passed}/${r.cases.length} cases`));
  }
  if (dirty) s.append(el('span', 'ed-dirty', 'unsaved'));
  const save = $('#btn-save');
  save.disabled = !state.server || !dirty || state.checking || !r || !!r.consultError || r.errors > 0;
  $('#btn-export').disabled = !dirty;
}

/* ---------- 8. Validate, save, export ---------- */

let timer = null;
function changed() {
  state.checking = true;
  renderStatus(); renderSide();
  clearTimeout(timer);
  timer = setTimeout(check, 350);
}

async function check() {
  const seq = ++state.seq;
  const report = await T.validate({ ...state.files }, state.cases);
  if (seq !== state.seq) return;
  state.report = report;
  state.checking = false;
  renderStatus(); renderSide(); updateFlags();
  if (state.tab === 'changes') renderMain();
  else for (const b of document.querySelectorAll('#tabs button[data-tab="changes"]'))
    b.textContent = 'Changes' + (dirtyFiles().length ? ` (${dirtyFiles().length})` : '');
}

async function save() {
  const r = state.report;
  if (!r || r.consultError || r.errors) return;
  if (r.failed && !confirm(
    `${r.failed} validation case${r.failed > 1 ? 's' : ''} no longer give the expected verdict.\n\n` +
    'Save anyway? If the expert agrees with the new result, update its expected verdict in test/cases.pl.')) return;
  const files = {};
  for (const f of dirtyFiles()) files[f] = state.files[f];
  const btn = $('#btn-save'); btn.disabled = true;
  try {
    const res = await fetch('../api/kb', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-boss-pass': state.pass },
      body: JSON.stringify({ files })
    });
    const j = await res.json();
    if (res.status === 401) { lock(); return; }
    if (!res.ok) { toast(j.error || 'Save failed.'); if (j.report) { state.report = j.report; renderSide(); } return; }
    for (const f of Object.keys(files)) state.saved[f] = files[f];
    state.baseline = j.report;
    toast(j.changed.length ? 'Saved ' + j.changed.join(', ') + '. The old version is in kb/.history/.' : 'Nothing to save.');
    renderMain(); renderSide();
  } catch (e) {
    toast('Could not reach the server: ' + e.message);
  } finally {
    renderStatus();
  }
}

function exportFiles() {
  const files = dirtyFiles();
  if (!files.length) { toast('Nothing has changed.'); return; }
  for (const f of files) {
    const a = el('a');
    a.href = URL.createObjectURL(new Blob([state.files[f]], { type: 'text/plain' }));
    a.download = f;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  toast(`Exported ${files.join(', ')}. Copy into kb/ and run node build.js.`);
}

/* ---------- 9. Start-up ---------- */

async function load() {
  try {
    const r = await fetch('../api/kb', { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    state.server = true;
    state.files = j.files;
    state.cases = j.cases;
  } catch (e) {
    // file:// or a static host: the bundled copy, read-only.
    state.files = { ...window.BOSS_KB };
    state.cases = window.BOSS_CASES || [];
  }
  state.saved = { ...state.files };
}

async function login(pass) {
  const r = await fetch('../api/login', { method: 'POST', headers: { 'x-boss-pass': pass } });
  return r.ok;
}

function lock() {
  try { sessionStorage.removeItem(PASS_KEY); } catch (e) {}
  state.pass = '';
  $('#gate-err').textContent = 'Please enter the passcode again.';
  show('gate');
  $('#gate-pass').focus();
}

async function openEditor() {
  show('editor');
  $('#ed-mode').textContent = state.server ? 'saving to kb/*.pl' : 'read-only · run npm run serve to save';
  $('#btn-save').classList.toggle('hidden', !state.server);
  renderMain(); renderStatus(); renderSide();
  state.checking = true;
  await check();
  state.baseline = state.report;
  renderSide();
}

async function start() {
  await load();
  $('#tabs').onclick = e => { const t = e.target.closest('button')?.dataset.tab; if (t) setTab(t); };
  $('#btn-save').onclick = save;
  $('#btn-export').onclick = exportFiles;
  window.addEventListener('beforeunload', e => { if (dirtyFiles().length) { e.preventDefault(); e.returnValue = ''; } });
  $('#gate-form').onsubmit = async e => {
    e.preventDefault();
    const pass = $('#gate-pass').value;
    if (!await login(pass)) { $('#gate-err').textContent = 'That passcode is not right.'; $('#gate-pass').select(); return; }
    state.pass = pass;
    try { sessionStorage.setItem(PASS_KEY, pass); } catch (e) {}
    $('#gate-err').textContent = '';
    if ($('#view-editor').classList.contains('hidden') && state.report) show('editor');
    else openEditor();
  };

  if (!state.server) return openEditor();

  let stored = '';
  try { stored = sessionStorage.getItem(PASS_KEY) || ''; } catch (e) {}
  if (stored && await login(stored)) { state.pass = stored; return openEditor(); }

  show('gate');
  $('#gate-pass').focus();
}

start().catch(e => {
  document.body.textContent = 'The knowledge editor could not start: ' + e.message;
});
})();

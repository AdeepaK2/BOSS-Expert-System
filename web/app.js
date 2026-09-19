/* ============================================================
   B0SS - interface layer.

   This file contains NO business knowledge. Every fact, rule,
   certainty factor and piece of advice lives in kb/*.pl and is
   reached through Tau-Prolog (FR-11). What follows is only:
   which control creates which Prolog fact, and how to display
   what the inference engine returns.
   ============================================================ */

(function () {
'use strict';

/* ---------- 1. Question schema: control -> Prolog fact ---------- */

const { SECTIONS, visibleQuestions: visibleQ, factsFor } = (typeof BOSS_SCHEMA !== 'undefined')
  ? BOSS_SCHEMA : require('./schema.js');

/* ---------- 2. Prolog engine ---------- */

const KB_FILES = ['boss_kb.pl', 'boss_derive.pl', 'boss_rules.pl', 'boss_infer.pl', 'boss_advice.pl'];
let kbSource = null;

async function loadKB() {
  if (kbSource) return kbSource;
  // When served over http, read the .pl files directly so edits show up
  // without rebuilding. Under file:// fall back to the generated bundle.
  if (location.protocol !== 'file:') {
    try {
      const parts = await Promise.all(
        KB_FILES.map(f => fetch('../kb/' + f).then(r => {
          if (!r.ok) throw new Error(r.status); return r.text();
        }))
      );
      kbSource = ':- use_module(library(lists)).\n' + parts.join('\n');
      return kbSource;
    } catch (e) {
      console.info('B0SS: serving kb/*.pl failed, using kb-bundle.js', e.message);
    }
  }
  if (!window.BOSS_KB) throw new Error('kb-bundle.js missing — run: node build.js');
  kbSource = ':- use_module(library(lists)).\n' + KB_FILES.map(f => window.BOSS_KB[f]).join('\n');
  return kbSource;
}

function toJS(t) {
  if (t == null) return null;
  if (pl.type.is_number(t)) return t.value;
  if (pl.type.is_variable(t)) return null;
  if (pl.type.is_term(t)) {
    if (t.indicator === '[]/0') return [];
    if (t.indicator === './2') {
      const arr = []; let cur = t;
      while (cur && cur.indicator === './2') { arr.push(toJS(cur.args[0])); cur = cur.args[1]; }
      return arr;
    }
    if (!t.args.length) return t.id;
    return { f: t.id, args: t.args.map(toJS) };
  }
  return String(t);
}

function query(session, goal) {
  return new Promise((resolve, reject) => {
    session.query(goal, {
      success: () => session.answer(ans => {
        if (!ans || ans === false) return resolve(null);
        if (pl.type.is_error(ans)) return reject(new Error(pl.format_answer(ans)));
        const out = {};
        for (const k in ans.links) out[k] = toJS(ans.links[k]);
        resolve(out);
      }),
      error: e => reject(new Error(pl.format_answer(e)))
    });
  });
}

async function runAssessment(answers) {
  const src = await loadKB();
  const session = pl.create(2000000);
  const program = src + '\n' + factsFor(answers).map(f => f + '.').join('\n');

  await new Promise((resolve, reject) => {
    session.consult(program, { success: resolve, error: e => reject(new Error(pl.format_answer(e))) });
  });

  const a = await query(session, 'assess(A).');
  if (!a || !a.A) throw new Error('The knowledge base returned no assessment.');
  const [rec, cf, pos, con, missing, gaps, flags, trace, money] = a.A.args;

  const lbl  = await query(session, `cf_label(${cf}, L).`);
  const vt   = await query(session, `verdict_text(${rec}, T), verdict_blurb(${rec}, B).`);
  const rt   = await query(session, 'findall(p(I,T), rule_text(I,T), L).');
  const na   = await query(session, 'findall(p(I,T), next_action(I,T), L).');
  const ua   = await query(session, 'findall(p(K,T), unknown_action(K,T), L).');
  const ul   = await query(session, 'findall(p(K,T), unknown_label(K,T), L).');

  const pairs = r => Object.fromEntries((r && r.L ? r.L : []).map(p => [p.args[0], p.args[1]]));

  return {
    rec, cf,
    cfLabel: lbl ? lbl.L : '',
    title: vt ? vt.T : rec,
    blurb: vt ? vt.B : '',
    positives: pos, concerns: con,
    missing, gaps, flags, trace,
    money: { req: money.args[0], funded: money.args[1], gap: money.args[2] },
    ruleText: pairs(rt), nextAction: pairs(na),
    unknownAction: pairs(ua), unknownLabel: pairs(ul)
  };
}

/* ---------- 3. State ---------- */

const state = { answers: {}, open: 0, done: new Set(), result: null, editing: null };

const $  = s => document.querySelector(s);
const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
const fmt = n => typeof n === 'number' ? n.toLocaleString('en-LK', { maximumFractionDigits: 0 }) : String(n);
const fmt1 = n => typeof n === 'number' ? (Math.round(n * 10) / 10).toLocaleString('en-LK') : String(n);

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

function show(view) {
  for (const v of ['landing', 'assess', 'result']) $('#view-' + v).classList.toggle('hidden', v !== view);
  window.scrollTo(0, 0);
}

/* ---------- 4. Assessment form ---------- */

function visibleQuestions(sec) {
  return visibleQ(sec, state.answers);
}

function renderSections() {
  const host = $('#sections');
  host.innerHTML = '';
  SECTIONS.forEach((sec, i) => host.appendChild(renderSection(sec, i)));
  updateProgress();
}

function renderSection(sec, i) {
  const isOpen = state.open === i;
  const isDone = state.done.has(i);
  const node = el('section', 'sec ' + (isOpen ? 'active' : isDone ? 'done' : 'locked'));

  const head = el('button', 'sec-head');
  head.type = 'button';
  head.appendChild(el('span', 'sec-num', String(i + 1).padStart(2, '0')));
  const mid = el('div');
  mid.appendChild(el('div', 'sec-title', sec.title));
  mid.appendChild(el('div', 'sec-sum', isOpen ? sec.blurb : isDone ? summarise(sec) : sec.blurb));
  head.appendChild(mid);
  if (isDone && !isOpen) head.appendChild(el('span', 'sec-edit', 'Change'));
  if (isDone || isOpen) head.onclick = () => { state.open = isOpen ? -1 : i; renderSections(); if (!isOpen) scrollToSection(i); };
  node.appendChild(head);

  const body = el('div', 'sec-body');
  visibleQuestions(sec).forEach(q => body.appendChild(renderQuestion(q, i)));
  if (sec.calc) body.appendChild(renderCalc());

  const err = el('p', 'err');
  err.id = 'err-' + i;
  err.textContent = 'Please answer every question above before continuing.';
  body.appendChild(err);

  const foot = el('div', 'sec-foot');
  const last = i === SECTIONS.length - 1;
  const next = el('button', 'btn btn-primary', last ? 'See the result' : 'Continue');
  next.onclick = () => advance(i);
  foot.appendChild(next);
  if (state.result) {
    const back = el('button', 'btn btn-ghost', 'Back to result');
    back.onclick = () => recompute();
    foot.appendChild(back);
  }
  body.appendChild(foot);

  node.appendChild(body);
  return node;
}

function renderQuestion(q, secIndex) {
  const wrap = el('div', 'q');
  wrap.appendChild(el('label', 'q-label', q.label));
  if (q.help) wrap.appendChild(el('p', 'q-help', q.help));

  if (q.type === 'choice') {
    const opts = el('div', 'opts');
    for (const [val, title, sub, isUnknown] of q.options) {
      const lab = el('label', 'opt' + (isUnknown ? ' unknown' : ''));
      const input = el('input');
      input.type = 'radio'; input.name = q.fact; input.value = val;
      input.checked = state.answers[q.fact] === val;
      input.onchange = () => {
        state.answers[q.fact] = val;
        // Other questions may appear or disappear as a result.
        renderSections(); scrollToSection(secIndex, false);
      };
      lab.appendChild(input);
      const txt = el('div', 'opt-txt');
      txt.appendChild(el('b', null, title));
      if (sub) txt.appendChild(el('span', null, sub));
      lab.appendChild(txt);
      opts.appendChild(lab);
    }
    wrap.appendChild(opts);
  } else {
    const row = el('div', 'num-row');
    if (q.prefix) row.appendChild(el('span', 'num-pre', q.prefix));
    const input = el('input');
    input.type = 'number'; input.min = '0'; input.inputMode = 'numeric';
    input.placeholder = '0';
    input.value = state.answers[q.fact] ?? '';
    input.disabled = q.unknownFact && state.answers[q.unknownFact] === 'unknown';
    input.oninput = () => {
      const v = input.value.trim();
      state.answers[q.fact] = v === '' ? undefined : Number(v);
      if (q.fact === 'startup_cost' || q.fact === 'monthly_cost' || q.fact === 'capital_available') updateCalc();
    };
    row.appendChild(input);
    if (q.suffix) row.appendChild(el('span', 'num-suf', q.suffix));
    wrap.appendChild(row);

    if (q.unknownFact) {
      const lab = el('label', 'opt unknown');
      lab.style.marginTop = '.5rem';
      const cb = el('input'); cb.type = 'checkbox';
      cb.checked = state.answers[q.unknownFact] === 'unknown';
      cb.onchange = () => {
        state.answers[q.unknownFact] = cb.checked ? 'unknown' : 'known';
        if (cb.checked) state.answers[q.fact] = undefined;
        renderSections(); scrollToSection(secIndex, false);
      };
      lab.appendChild(cb);
      const t = el('div', 'opt-txt'); t.appendChild(el('b', null, q.unknownLabel));
      lab.appendChild(t);
      wrap.appendChild(lab);
    }
  }
  return wrap;
}

function renderCalc() {
  const box = el('div', 'calc'); box.id = 'calc';
  return box;
}

/* SRS 4.2 shown live while the money section is being filled. */
function updateCalc() {
  const box = document.getElementById('calc');
  if (!box) return;
  const a = state.answers;
  const s = a.startup_cost, m = a.monthly_cost, c = a.capital_available;
  if (typeof s !== 'number' || typeof m !== 'number') {
    box.innerHTML = '<div class="calc-row"><span>Capital requirement</span><b>—</b></div>' +
      '<div class="calc-row"><span>Startup cost + six months of running costs</span><span></span></div>';
    return;
  }
  const req = s + 6 * m;
  let html = '<div class="calc-row"><span>Capital requirement</span><b>LKR ' + fmt(req) + '</b></div>' +
             '<div class="calc-row"><span>' + fmt(s) + ' + (6 × ' + fmt(m) + ')</span><span></span></div>';
  if (typeof c === 'number' && m > 0 && a.capital_status !== 'unknown') {
    const funded = Math.max(0, c - s) / m;
    html += '<div class="calc-row" style="margin-top:.6em"><span>Months you are funded for</span><b>' + fmt1(funded) + '</b></div>';
  }
  box.innerHTML = html;
}

function summarise(sec) {
  return visibleQuestions(sec).map(q => {
    if (q.unknownFact && state.answers[q.unknownFact] === 'unknown') return 'not known';
    const v = state.answers[q.fact];
    if (v === undefined || v === '') return null;
    if (q.type === 'choice') {
      const o = q.options.find(o => o[0] === v);
      return o ? o[1] : v;
    }
    return (q.prefix ? q.prefix + ' ' : '') + fmt(v) + (q.suffix ? ' ' + q.suffix : '');
  }).filter(Boolean).join(' · ');
}

function sectionComplete(i) {
  return visibleQuestions(SECTIONS[i]).every(q => {
    if (q.unknownFact && state.answers[q.unknownFact] === 'unknown') return true;
    const v = state.answers[q.fact];
    return v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && isNaN(v));
  });
}

function advance(i) {
  const err = document.getElementById('err-' + i);
  if (!sectionComplete(i)) { err.classList.add('show'); return; }
  err.classList.remove('show');
  state.done.add(i);
  if (i === SECTIONS.length - 1) return recompute();
  state.open = i + 1;
  renderSections();
  scrollToSection(i + 1);
}

function scrollToSection(i, smooth = true) {
  requestAnimationFrame(() => {
    const node = $('#sections').children[i];
    if (!node) return;
    const y = node.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo({ top: y, behavior: smooth ? 'smooth' : 'auto' });
  });
}

function updateProgress() {
  const cur = state.open >= 0 ? state.open + 1 : SECTIONS.length;
  $('#step-count').textContent = cur + ' / ' + SECTIONS.length;
}

/* ---------- 5. Result ---------- */

async function recompute() {
  try {
    state.result = await runAssessment(state.answers);
    renderResult();
    show('result');
  } catch (e) {
    console.error(e);
    toast('Could not run the knowledge base: ' + e.message);
  }
}

const TONE = { proceed: 'good', proceed_with_caution: 'warn', further_validation_required: 'info',
               not_recommended: 'bad', not_recommended_in_this_form: 'bad' };

function conclusionText(c) {
  if (typeof c === 'string') return c;
  if (c.f === 'and') return c.args.map(conclusionText).join(', ');
  return c.f + '(' + c.args.map(conclusionText).join(', ') + ')';
}

function renderResult() {
  const r = state.result;
  const host = $('#result-body');
  host.innerHTML = '';

  const v = el('div', 'verdict ' + (TONE[r.rec] || ''));
  v.appendChild(el('div', 'verdict-cf', r.cfLabel));
  const h = el('h1'); h.textContent = r.title;
  const cfn = el('span', 'cf-num', '\u00A0\u00A0(' + (r.cf > 0 ? '+' : '') + r.cf.toFixed(1) + ')');
  h.appendChild(cfn);
  v.appendChild(h);
  v.appendChild(el('p', null, r.blurb));
  host.appendChild(v);

  // Missing information first when that is what decided the outcome.
  if (r.missing.length) {
    const b = block('Still to find out');
    for (const m of r.missing) {
      b.appendChild(finding('unk', '?', r.unknownLabel[m] || (m + ' is not known.'),
        r.unknownAction[m]));
    }
    host.appendChild(b);
  }

  if (r.positives.length) {
    const b = block('In its favour');
    for (const p of r.positives) {
      const [id, concl, cf] = p.args;
      b.appendChild(finding('pos', '+', r.ruleText[id] || conclusionText(concl), null, id, cf));
    }
    host.appendChild(b);
  }

  if (r.concerns.length) {
    const b = block('Concerns');
    for (const c of r.concerns) {
      const [id, concl, cf] = c.args;
      b.appendChild(finding('neg', '−', r.ruleText[id] || conclusionText(concl), r.nextAction[id], id, cf));
    }
    host.appendChild(b);
  }

  // Visible arithmetic - SRS section 10.
  if (typeof r.money.req === 'number') {
    const b = block('The money');
    const t = el('div', 'money-table');
    t.appendChild(moneyRow('Capital requirement', 'Startup cost + six months of running costs',
      'LKR ' + fmt(r.money.req)));
    if (typeof r.money.funded === 'number')
      t.appendChild(moneyRow('Months you are funded for', 'Capital left after opening ÷ monthly cost',
        fmt1(r.money.funded) + ' months'));
    if (typeof r.money.gap === 'number')
      t.appendChild(moneyRow('Survival gap', 'Funded months − months to break even',
        (r.money.gap >= 0 ? '+' : '') + fmt1(r.money.gap) + ' months'));
    b.appendChild(t);
    host.appendChild(b);
  }

  // FR-09: show reasoning.
  const det = el('details', 'reasoning');
  const sum = el('summary', null, 'Show reasoning · ' + r.trace.length + ' rules fired');
  det.appendChild(sum);
  const tr = el('div', 'trace');
  for (const f of r.trace) {
    const [id, concl, cf] = f.args;
    const row = el('div', 'trace-row');
    row.appendChild(el('span', 'trace-id', id.toUpperCase()));
    row.appendChild(el('span', 'trace-concl', conclusionText(concl)));
    row.appendChild(el('span', 'trace-cf ' + (cf > 0 ? 'p' : cf < 0 ? 'n' : 'z'),
      (cf > 0 ? '+' : '') + cf.toFixed(1)));
    tr.appendChild(row);
  }
  det.appendChild(tr);
  host.appendChild(det);

  host.appendChild(el('div', 'disclaimer',
    'B0SS applies decision rules captured from one business advisor to the information you supplied. ' +
    'It does not analyse market data, and it does not predict or guarantee success or failure. ' +
    'It gives no legal, tax, accounting, investment or lending advice. A PROCEED result means only ' +
    'that these screening rules found no reason to stop — verify demand, figures and licensing with ' +
    'real evidence before committing money you cannot lose.'));

  const save = el('div', 'save-row');
  const nameIn = el('input');
  nameIn.type = 'text';
  nameIn.placeholder = 'Name this assessment, e.g. "Tuition class, Gampaha"';
  nameIn.value = state.editing ? state.editing.name : '';
  const saveBtn = el('button', 'btn btn-primary', state.editing ? 'Update saved' : 'Save this assessment');
  saveBtn.onclick = () => saveAssessment(nameIn.value.trim());
  save.appendChild(nameIn); save.appendChild(saveBtn);
  host.appendChild(save);

  const acts = el('div', 'result-actions');
  const edit = el('button', 'btn', 'Change an answer');
  edit.onclick = () => { state.open = 0; renderSections(); show('assess'); };
  const again = el('button', 'btn', 'Screen another business');
  again.onclick = startNew;
  const print = el('button', 'btn btn-ghost', 'Print / save as PDF');
  print.onclick = () => window.print();
  acts.appendChild(edit); acts.appendChild(again); acts.appendChild(print);
  host.appendChild(acts);
}

function block(title, sub) {
  const b = el('div', 'block');
  b.appendChild(el('h2', null, title));
  if (sub) b.appendChild(el('p', 'block-sub', sub));
  return b;
}

function finding(tone, mark, text, action, ruleId, cf) {
  const f = el('div', 'finding ' + tone);
  f.appendChild(el('div', 'finding-mark', mark));
  const body = el('div', 'finding-body');
  const p = el('p');
  p.textContent = text;
  if (ruleId) {
    const pill = el('span', 'rid', ruleId.toUpperCase() + ' ' + (cf > 0 ? '+' : '') + cf.toFixed(1));
    p.appendChild(pill);
  }
  body.appendChild(p);
  if (action) {
    const d = el('div', 'finding-do');
    d.appendChild(el('b', null, 'Do this: '));
    d.appendChild(document.createTextNode(action));
    body.appendChild(d);
  }
  f.appendChild(body);
  return f;
}

function moneyRow(label, sub, value) {
  const row = el('div', 'money-row');
  const l = el('div');
  l.appendChild(document.createTextNode(label));
  l.appendChild(el('small', null, sub));
  row.appendChild(l);
  row.appendChild(el('b', null, value));
  return row;
}

/* ---------- 6. Saved assessments ---------- */

const STORE = 'boss.history.v1';

function history() {
  try { return JSON.parse(localStorage.getItem(STORE) || '[]'); }
  catch (e) { return []; }
}
function writeHistory(list) {
  try { localStorage.setItem(STORE, JSON.stringify(list)); }
  catch (e) { toast('Could not save — browser storage is unavailable.'); }
}

function saveAssessment(name) {
  if (!name) { toast('Give it a name first.'); return; }
  const list = history();
  const entry = {
    id: state.editing ? state.editing.id : String(Date.now()),
    name, ts: Date.now(),
    answers: { ...state.answers },
    rec: state.result.rec, cf: state.result.cf, title: state.result.title
  };
  const at = list.findIndex(e => e.id === entry.id);
  if (at >= 0) list[at] = entry; else list.unshift(entry);
  writeHistory(list);
  state.editing = entry;
  renderHistory();
  toast(at >= 0 ? 'Assessment updated.' : 'Assessment saved.');
}

function renderHistory() {
  const list = history();
  const host = $('#hist-list');
  $('#history').classList.toggle('hidden', list.length === 0);
  host.innerHTML = '';
  for (const e of list) {
    const item = el('button', 'hist-item');
    const dot = el('span', 'hist-dot');
    dot.style.background = 'var(--' + ({ good: 'good', warn: 'warn', info: 'info', bad: 'bad' }[TONE[e.rec]] || 'ink-3') + ')';
    item.appendChild(dot);
    const body = el('div', 'hist-body');
    body.appendChild(el('span', 'hist-name', e.name));
    body.appendChild(el('span', 'hist-meta',
      (e.title || e.rec) + ' · ' + new Date(e.ts).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' })));
    item.appendChild(body);
    item.onclick = () => openSaved(e);
    host.appendChild(item);

    const del = el('button', 'hist-del', '×');
    del.title = 'Delete';
    del.onclick = ev => {
      ev.stopPropagation();
      if (!confirm('Delete "' + e.name + '"? This cannot be undone.')) return;
      writeHistory(history().filter(x => x.id !== e.id));
      renderHistory();
      toast('Deleted.');
    };
    item.appendChild(del);
  }
}

async function openSaved(entry) {
  // Re-run rather than replaying a stored verdict, so a saved assessment
  // always reflects the current knowledge base.
  state.answers = { ...entry.answers };
  state.editing = entry;
  state.done = new Set(SECTIONS.map((_, i) => i));
  state.open = -1;
  renderSections();
  await recompute();
}

/* ---------- 7. Demo cases (SRS section 12) ---------- */

let demoAt = 0;
function loadDemo() {
  const cases = window.BOSS_CASES || [];
  if (!cases.length) { toast('Example cases are not built — run: node build.js'); return; }
  const c = cases[demoAt % cases.length];
  demoAt++;
  state.answers = { ...c.answers };
  state.editing = null;
  state.done = new Set(SECTIONS.map((_, i) => i));
  state.open = 0;
  renderSections();
  show('assess');
  toast('Loaded example ' + c.id + ': ' + c.name);
}

/* ---------- 8. Wiring ---------- */

function startNew() {
  state.answers = {}; state.done = new Set(); state.open = 0;
  state.result = null; state.editing = null;
  renderSections();
  show('assess');
}

$('#btn-start').onclick = startNew;
$('#btn-demo').onclick = loadDemo;
$('#btn-home').onclick = () => { renderHistory(); show('landing'); };
$('#btn-home-2').onclick = () => { renderHistory(); show('landing'); };

renderSections();
renderHistory();

// Warm the engine so the first result is instant (NFR-Performance).
loadKB().catch(e => console.warn('B0SS: knowledge base not preloaded —', e.message));

})();

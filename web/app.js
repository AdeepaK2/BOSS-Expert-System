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

const { SECTIONS, visibleQuestions: visibleQ, visibleControls: visibleC,
        factsFor, answersFromFacts, countQuestions } =
  (typeof BOSS_SCHEMA !== 'undefined') ? BOSS_SCHEMA : require('./schema.js');

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
  const [rec, cf, pos, con, missing, gaps, trace, money, scope, concl, path] = a.A.args;

  const lbl  = await query(session, `cf_label(${cf}, L).`);
  const vt   = await query(session, `verdict_text(${rec}, T), verdict_blurb(${rec}, B).`);
  const rt   = await query(session, 'findall(p(I,T), rule_text(I,T), L).');
  const na   = await query(session, 'findall(p(I,T), next_action(I,T), L).');
  const ua   = await query(session, 'findall(p(K,T), unknown_action(K,T), L).');
  const ul   = await query(session, 'findall(p(K,T), unknown_label(K,T), L).');
  const gl   = await query(session, 'findall(p(K,T), gap_label(K,T), L).');
  const ga   = await query(session, 'findall(p(K,T), gap_action(K,T), L).');
  const gk   = await query(session, 'findall(p(K,T), gate_label(K,T), L).');
  const gd   = await query(session, 'findall(p(K,T), gate_detail(K,T), L).');
  const go   = await query(session, 'findall(p(K,T), gate_outcome(K,T), L).');
  const cl   = await query(session, 'findall(p(K,T), conclusion_label(K,T), L).');
  const cw   = await query(session, 'findall(p(K-V,T), conclusion_word(K,V,T), L).');
  const ct   = await query(session, 'findall(p(K-V,T), conclusion_tone(K,V,T), L).');

  const pairs = r => Object.fromEntries((r && r.L ? r.L : []).map(p => [p.args[0], p.args[1]]));
  // keys arrive as the compound K-V
  const keyed = r => Object.fromEntries((r && r.L ? r.L : []).map(p => {
    const k = p.args[0];
    return [k.args[0] + '-' + k.args[1], p.args[1]];
  }));

  return {
    rec, cf,
    cfLabel: lbl ? lbl.L : '',
    title: vt ? vt.T : rec,
    blurb: vt ? vt.B : '',
    positives: pos, concerns: con,
    missing, gaps, trace,
    money: { req: money.args[0], funded: money.args[1], gap: money.args[2] },
    scope: { state: scope.args[0], bad: scope.args[1] },
    conclusions: (concl || []).map(c => ({ key: c.args[0], value: c.args[1] })),
    cLabel: pairs(cl),
    cWord: keyed(cw), cTone: keyed(ct),
    ruleText: pairs(rt), nextAction: pairs(na),
    unknownAction: pairs(ua), unknownLabel: pairs(ul),
    gapLabel: pairs(gl), gapAction: pairs(ga),
    path: (path || []).map(d => ({ gate: d.args[0], state: d.args[1], detail: d.args[2] })),
    gateLabel: pairs(gk), gateDetail: pairs(gd), gateOutcome: pairs(go)
  };
}

/* ---------- 3. State ---------- */

const state = { answers: {}, step: 0, furthest: 0, result: null, editing: null };

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

/* ---------- 4. Assessment: one question per screen ---------- */

/* The questions of every section, flattened, with their section. */
function steps() {
  const out = [];
  SECTIONS.forEach((sec, si) => {
    visibleQ(sec, state.answers).forEach(q => out.push({ sec, si, q }));
  });
  return out;
}

function controlsOf(q) { return visibleC(q, state.answers); }

function renderStep(dir) {
  const all = steps();
  if (state.step >= all.length) return recompute();
  const { sec, q } = all[state.step];

  const host = $('#step-host');
  host.innerHTML = '';
  const node = el('section', dir === 'none' ? 'step no-anim'
                           : 'step' + (dir === 'back' ? ' back' : ''));

  node.appendChild(el('div', 'eyebrow', sec.title));
  node.appendChild(el('label', 'q-label', q.label));
  if (q.help) node.appendChild(el('p', 'q-help', q.help));

  const cs = controlsOf(q);
  cs.forEach(c => node.appendChild(renderControl(c, cs.length > 1)));
  if (q.calc) node.appendChild(renderCalc());

  const err = el('p', 'err');
  err.id = 'err';
  err.textContent = 'Please answer before continuing.';
  node.appendChild(err);

  const foot = el('div', 'step-foot');
  if (state.step > 0) {
    const back = el('button', 'btn', '← Back');
    back.onclick = goBack;
    foot.appendChild(back);
  }
  foot.appendChild(el('span', 'of', (state.step + 1) + ' of ' + all.length));
  foot.appendChild(el('span', 'spacer'));
  const last = state.step === all.length - 1;
  const next = el('button', 'btn btn-primary', last ? 'See result' : 'Continue');
  next.onclick = goNext;
  foot.appendChild(next);
  node.appendChild(foot);

  host.appendChild(node);
  renderDots();
  renderRail();
  updateCalc();
  if (dir !== 'none') window.scrollTo({ top: 0, behavior: 'auto' });
}

function renderControl(c, showLabel) {
  const box = el('div', 'ctrl');
  // With one control per question the question heading already says it.
  if (showLabel && c.label) box.appendChild(el('label', 'ctrl-label', c.label));
  if (c.help) box.appendChild(el('p', 'q-help', c.help));

  if (c.type === 'number') {
    const row = el('div', 'num-row');
    if (c.prefix) row.appendChild(el('span', 'num-pre', c.prefix));
    const input = el('input');
    input.type = 'number'; input.min = '0'; input.inputMode = 'numeric';
    input.placeholder = '0';
    input.value = state.answers[c.id] ?? '';
    input.disabled = c.unknownFact && state.answers[c.unknownFact] === 'unknown';
    input.oninput = () => {
      const v = input.value.trim();
      state.answers[c.id] = v === '' ? undefined : Number(v);
      updateCalc();
    };
    row.appendChild(input);
    if (c.suffix) row.appendChild(el('span', 'num-suf', c.suffix));
    box.appendChild(row);

    if (c.unknownFact) {
      const l = el('label', 'opt');
      const cb = el('input'); cb.type = 'checkbox';
      cb.checked = state.answers[c.unknownFact] === 'unknown';
      cb.onchange = () => {
        state.answers[c.unknownFact] = cb.checked ? 'unknown' : 'known';
        if (cb.checked) state.answers[c.id] = undefined;
        renderStep();
      };
      l.appendChild(cb);
      const t = el('div', 'opt-txt'); t.appendChild(el('b', null, c.unknownLabel));
      l.appendChild(t);
      box.appendChild(l);
    }
    return box;
  }

  const opts = el('div', 'opts');
  for (const o of c.options) {
    const [val, title, sub, , isUnknown] = o;
    const l = el('label', 'opt' + (isUnknown ? ' unknown' : ''));
    const input = el('input');
    input.type = 'radio'; input.name = c.id; input.value = val;
    input.checked = state.answers[c.id] === val;
    input.onchange = () => {
      const before = controlsOf(currentQ()).map(x => x.id).join();
      state.answers[c.id] = val;
      document.getElementById('err')?.classList.remove('show');
      // Some answers change which controls apply (e.g. funding source).
      if (controlsOf(currentQ()).map(x => x.id).join() !== before) renderStep('none');
    };
    l.appendChild(input);
    const txt = el('div', 'opt-txt');
    txt.appendChild(el('b', null, title));
    if (sub) txt.appendChild(el('span', null, sub));
    l.appendChild(txt);
    opts.appendChild(l);
  }
  box.appendChild(opts);
  return box;
}

function currentQ() {
  const all = steps();
  return all[Math.min(state.step, all.length - 1)].q;
}

function renderCalc() { const b = el('div', 'calc'); b.id = 'calc'; return b; }

/* SRS 4.2, shown live while the money question is answered. */
function updateCalc() {
  const box = document.getElementById('calc');
  if (!box) return;
  const a = state.answers;
  const s = a.startup_cost, m = a.monthly_cost, c = a.capital_available;
  if (typeof s !== 'number' || typeof m !== 'number') {
    box.innerHTML = '<div class="calc-row"><span>Capital requirement</span><b>—</b></div>';
    return;
  }
  const req = s + 6 * m;
  let html = '<div class="calc-row"><span>Capital requirement</span><b>LKR ' + fmt(req) + '</b></div>' +
             '<div class="calc-row"><span>' + fmt(s) + ' + (6 × ' + fmt(m) + ')</span><span></span></div>';
  if (typeof c === 'number' && m > 0 && a.capital_status !== 'unknown') {
    html += '<div class="calc-row" style="margin-top:.55em"><span>Months you are funded for</span><b>' +
            fmt1(Math.max(0, c - s) / m) + '</b></div>';
  }
  box.innerHTML = html;
}

function stepComplete(i) {
  const all = steps();
  if (i >= all.length) return true;
  return controlsOf(all[i].q).every(c => {
    if (c.unknownFact && state.answers[c.unknownFact] === 'unknown') return true;
    const v = state.answers[c.id];
    return v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && isNaN(v));
  });
}

function goNext() {
  if (!stepComplete(state.step)) {
    document.getElementById('err')?.classList.add('show');
    return;
  }
  state.furthest = Math.max(state.furthest, state.step + 1);
  state.step++;
  renderStep();
}

function goBack() {
  if (state.step === 0) return;
  state.step--;
  renderStep('back');
}

function goToStep(i) {
  if (i > state.furthest) return;
  const dir = i < state.step ? 'back' : 'fwd';
  state.step = i;
  renderStep(dir);
}

function renderRail() {
  const all = steps();
  const host = $('#rail');
  if (!host) return;
  host.innerHTML = '';
  let lastSec = null;
  all.forEach((st, i) => {
    if (st.sec !== lastSec) {
      host.appendChild(el('div', 'rail-sec', st.sec.title));
      lastSec = st.sec;
    }
    const cls = i === state.step ? 'now'
              : (i < state.furthest && stepComplete(i)) ? 'done' : 'todo';
    const b = el('button', 'rail-item ' + cls);
    b.type = 'button';
    b.appendChild(el('span', 'n', String(i + 1)));
    b.appendChild(el('span', null, st.q.label));
    if (i <= state.furthest) b.onclick = () => goToStep(i);
    host.appendChild(b);
  });
}

function renderDots() {
  const all = steps();
  const host = $('#dots');
  host.innerHTML = '';
  all.forEach((_, i) => {
    const d = el('button', 'dot ' +
      (i === state.step ? 'now' : stepComplete(i) && i < state.furthest ? 'done' : 'todo'));
    d.type = 'button';
    d.title = 'Question ' + (i + 1) + ' of ' + all.length;
    d.setAttribute('aria-label', d.title);
    if (i <= state.furthest) d.onclick = () => goToStep(i);
    host.appendChild(d);
  });
  $('#step-count').textContent = (state.step + 1) + ' / ' + all.length;
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

const VERDICT_SHORT = {
  out_of_scope: 'Not screenable',
  not_recommended: 'Not recommended',
  further_validation_required: 'Validate first',
  proceed: 'Proceed',
  proceed_with_caution: 'Proceed with caution',
  not_recommended_in_this_form: 'Not in this form'
};

/* Why each gate answered as it did, from the detail the path carries. */
function gateWhy(gate, d, r) {
  const v = d.detail;
  if (gate === 'scope' && d.state === 'exit') return 'Business type: ' + v;
  if (gate === 'override' && d.state === 'exit')
    return (Array.isArray(v) ? v : [v]).map(id => id.toUpperCase() + ' — ' + (r.ruleText[id] || '')).join(' ');
  if (gate === 'unknowns' && d.state === 'exit' && Array.isArray(v))
    return 'Unknown: ' + v.join(', ');
  if ((gate === 'proceed' || gate === 'caution') && typeof v === 'number')
    return v === 0 ? 'No weaknesses found'
         : v + (v === 1 ? ' weakness' : ' weaknesses') + ' found';
  if (gate === 'in_this_form' && typeof v === 'number')
    return v + (v === 1 ? ' serious risk' : ' serious risks') + ' found';
  return '';
}

const TONE = { proceed: 'good', proceed_with_caution: 'warn', further_validation_required: 'info',
               not_recommended: 'bad', not_recommended_in_this_form: 'bad',
               out_of_scope: 'bad' };

function conclusionText(c) {
  if (typeof c === 'string') return c;
  if (c.f === 'and') return c.args.map(conclusionText).join(', ');
  return c.f + '(' + c.args.map(conclusionText).join(', ') + ')';
}

function renderResult() {
  const r = state.result;
  const host = $('#result-body');
  const side = $('#result-side');
  host.innerHTML = '';
  side.innerHTML = '';

  const outOfScope = r.rec === 'out_of_scope';
  const v = el('div', 'verdict ' + (TONE[r.rec] || ''));
  if (!outOfScope) v.appendChild(el('div', 'verdict-cf', r.cfLabel));
  const h = el('h1'); h.textContent = r.title;
  if (!outOfScope) {
    h.appendChild(el('span', 'cf-num', '\u00A0\u00A0(' + (r.cf > 0 ? '+' : '') + r.cf.toFixed(1) + ')'));
  }
  v.appendChild(h);
  v.appendChild(el('p', null, r.blurb));
  side.appendChild(v);

  if (r.scope.bad && r.scope.bad.length) {
    const w = el('div', 'notice');
    w.appendChild(el('b', null, 'Unrecognised answer. '));
    w.appendChild(document.createTextNode(
      'The knowledge base has no facts for: ' + r.scope.bad.join(', ') +
      '. That input was ignored rather than guessed at.'));
    host.appendChild(w);
  }

  if (outOfScope) {
    host.appendChild(el('div', 'disclaimer',
      'B0SS screens small service, retail, online, education, professional-service, food and ' +
      'owner-trade businesses. Anything needing specialist regulatory or technical judgement — ' +
      'pharmacy, finance, insurance, alcohol, firearms, franchises, construction, agriculture — ' +
      'is out of scope. (SRS \u00A72)'));
    const acts = el('div', 'result-actions');
    const again = el('button', 'btn', 'Screen a different business');
    again.onclick = () => startNew();
    acts.appendChild(again);
    host.appendChild(acts);
    return;
  }

  // At a glance: the six intermediate conclusions of SRS section 6.
  if (r.conclusions.length) {
    const b = block('At a glance');
    const grid = el('div', 'scorecard');
    const order = ['market', 'competition', 'finance', 'owner', 'operations', 'risk'];
    for (const key of order) {
      const c = r.conclusions.find(x => x.key === key);
      const cell = el('div', 'score' + (c ? ' ' + (r.cTone[key + '-' + c.value] || '') : ' none'));
      cell.appendChild(el('span', 'score-k', r.cLabel[key] || key));
      cell.appendChild(el('span', 'score-v',
        c ? (r.cWord[key + '-' + c.value] || c.value) : 'Not assessed'));
      grid.appendChild(cell);
    }
    b.appendChild(grid);
    host.appendChild(b);
  }

  // How the answer was reached: the SRS 9.1 ladder with the route taken.
  if (r.path.length) {
    const b = block('How this was decided');
    const flow = el('div', 'flow');
    const GATES = ['scope', 'override', 'unknowns', 'proceed', 'caution', 'in_this_form'];
    const walked = Object.fromEntries(r.path.map(d => [d.gate, d]));
    const exited = r.path[r.path.length - 1];

    for (const g of GATES) {
      const d = walked[g];
      const isExit = d && d.state === 'exit';
      const cls = !d ? 'gate dim' : isExit ? 'gate exit' : 'gate on';
      const row = el('div', cls);

      const rail = el('div', 'gate-rail');
      rail.appendChild(el('div', 'gate-node'));
      row.appendChild(rail);

      const body = el('div', 'gate-body');
      body.appendChild(el('div', 'gate-q', r.gateLabel[g] || g));
      if (r.gateDetail[g]) body.appendChild(el('div', 'gate-d', r.gateDetail[g]));

      if (d) {
        const ans = el('div', 'gate-ans');
        ans.textContent = isExit
          ? 'Yes → ' + (VERDICT_SHORT[r.gateOutcome[g]] || r.gateOutcome[g])
          : (g === 'scope' ? 'Yes, carry on' : 'No, carry on');
        body.appendChild(ans);
        const why = gateWhy(g, d, r);
        if (why) body.appendChild(el('div', 'gate-why', why));
      }
      row.appendChild(body);
      flow.appendChild(row);
    }

    if (exited && exited.gate === 'insufficient') {
      const row = el('div', 'gate exit');
      const rail = el('div', 'gate-rail'); rail.appendChild(el('div', 'gate-node'));
      row.appendChild(rail);
      const body = el('div', 'gate-body');
      body.appendChild(el('div', 'gate-q', r.gateLabel.insufficient));
      const ans = el('div', 'gate-ans');
      ans.textContent = '→ ' + (VERDICT_SHORT.further_validation_required || '');
      body.appendChild(ans);
      row.appendChild(body);
      flow.appendChild(row);
    }

    b.appendChild(flow);
    host.appendChild(b);
  }

  // One consolidated action list - the most useful thing on the page.
  const actions = [];
  for (const m of r.missing) if (r.unknownAction[m]) actions.push(r.unknownAction[m]);
  for (const g of r.gaps) if (r.gapAction[g]) actions.push(r.gapAction[g]);
  for (const c of r.concerns) { const a = r.nextAction[c.args[0]]; if (a) actions.push(a); }
  if (actions.length) {
    const b = block('Do this next');
    const ol = el('ol', 'todo');
    for (const a of actions.slice(0, 4)) ol.appendChild(el('li', null, a));
    b.appendChild(ol);
    host.appendChild(b);
  }

  // Missing information first when that is what decided the outcome.
  // SRS section 6: critical items that are unknown or merely assumed.
  if (r.missing.length || r.gaps.length) {
    const b = block('Not yet known');
    for (const m of r.missing)
      b.appendChild(finding('unk', '?', r.unknownLabel[m] || (m + ' is not known.')));
    for (const g of r.gaps)
      b.appendChild(finding('unk', '?', r.gapLabel[g] || (g + ' is assumed.')));
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
      b.appendChild(finding('neg', '−', r.ruleText[id] || conclusionText(concl), null, id, cf));
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
    'B0SS applies one advisor\u2019s screening rules to what you entered. It does not analyse market ' +
    'data, predict success, or give legal, tax or financial advice. A PROCEED means only that these ' +
    'rules found no reason to stop.'));

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
  edit.onclick = () => { state.step = 0; state.furthest = steps().length; renderStep(); show('assess'); };
  const again = el('button', 'btn', 'Screen another business');
  again.onclick = () => startNew();
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
  state.step = 0;
  state.furthest = steps().length;
  await recompute();
}

/* ---------- 7. Demo cases (SRS section 12) ---------- */

let demoAt = 0;
function loadDemo() {
  const cases = window.BOSS_CASES || [];
  if (!cases.length) { toast('Example cases are not built — run: node build.js'); return; }
  const c = cases[demoAt % cases.length];
  demoAt++;
  state.answers = answersFromFacts(c.answers);
  state.editing = null;
  state.step = 0;
  state.furthest = steps().length;
  renderStep();
  show('assess');
  toast('Example ' + c.id + ': ' + c.name);
}

/* ---------- 8. Wiring ---------- */

function startNew() {
  state.answers = {};
  state.step = 0; state.furthest = 0;
  state.result = null; state.editing = null;
  renderStep();
  show('assess');
}

$('#btn-start').onclick = () => startNew();
$('#btn-demo').onclick = loadDemo;
$('#btn-home').onclick = () => { renderHistory(); show('landing'); };
$('#btn-home-2').onclick = () => { renderHistory(); show('landing'); };

renderHistory();

document.addEventListener('keydown', e => {
  if ($('#view-assess').classList.contains('hidden')) return;
  if (e.target.matches('input, textarea')) return;
  if (e.key === 'ArrowLeft') goBack();
  if (e.key === 'ArrowRight' || e.key === 'Enter') goNext();
});

// Warm the engine so the first result is instant (NFR-Performance).
loadKB().catch(e => console.warn('B0SS: knowledge base not preloaded —', e.message));

})();

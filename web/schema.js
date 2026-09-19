/* ============================================================
   B0SS — schema.js
   The seven sections, the questions in each, and which Prolog
   fact every control creates (SRS 4.1).

   A QUESTION is one numbered block. It may hold several short
   CONTROLS — SRS 4.1 explicitly permits this: "The interface may
   place several short controls on one screen. This keeps the
   demonstration brief without reducing the number of facts
   available to the inference engine."

   A control normally creates one fact. Where the same rule reads
   several facts together (R01–R03 demand, R15–R17 owner, R18
   channel) one control creates all of them, via the facts object
   on each option. No combination the rules can distinguish is
   lost — see DECISIONS.md, decision 11.

   This file holds no business logic: every rule, certainty factor
   and piece of advice lives in kb/*.pl. It is loaded both by the
   browser (window.BOSS_SCHEMA) and by test/run_ui.js in node, so
   the fact mapping is tested against the real knowledge base.
   ============================================================ */

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BOSS_SCHEMA = api;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const SECTIONS = [
  {
    title: 'Business profile',
    blurb: 'What kind of business, and what shape it is in.',
    questions: [{
      label: 'Tell us about the business',
      controls: [
        { id: 'business_type', fact: 'business_type', label: 'What kind of business is it?',
          options: [
            ['service', 'Service business', 'Salon, repairs, cleaning, events'],
            ['retail', 'Retail shop', 'Grocery, hardware, clothing'],
            ['online', 'Online / e-commerce', 'Reselling, digital storefront'],
            ['education', 'Education or tuition', 'Classes, training, skills'],
            ['professional_service', 'Professional service', 'Design, accounting, IT support'],
            ['food', 'Food and beverage', 'Outlet, cloud kitchen, catering'],
            ['owner_trade', 'Owner-operated trade', 'Carpentry, electrical, tailoring'],
            // Not in supported_business/1, so this trips the SRS section 2
            // scope gate rather than being screened on rules that do not apply.
            ['other', 'Something else',
             'Pharmacy, finance, insurance, alcohol, franchise, construction, agriculture']
          ] },

        // FR-01 asks the system to identify a new business from an additional
        // branch. No rule reads venture_type, so it rides along with the
        // channel question rather than costing a question of its own.
        { id: 'channel', label: 'How do customers reach you?',
          options: [
            ['walkin_new',    'They come to a physical place', 'My first location',
              { channel_type: 'walk_in', venture_type: 'new' }],
            ['walkin_branch', 'They come to a physical place', 'An additional branch',
              { channel_type: 'walk_in', venture_type: 'branch' }],
            ['online_new',    'Entirely online', 'My first',
              { channel_type: 'online', venture_type: 'new' }],
            ['online_branch', 'Entirely online', 'Alongside an existing business',
              { channel_type: 'online', venture_type: 'branch' }],
            ['hybrid_new',    'Both physical and online', 'My first location',
              { channel_type: 'hybrid', venture_type: 'new' }],
            ['hybrid_branch', 'Both physical and online', 'An additional branch',
              { channel_type: 'hybrid', venture_type: 'branch' }]
          ] }
      ]
    }]
  },

  {
    title: 'Demand and price',
    blurb: 'The one factor with no substitute: will somebody actually pay.',
    questions: [{
      label: 'Evidence that someone will pay',
      controls: [
        // R01 (validated + recurring), R02 (observed/validated + specific)
        // and R03 (none/anecdotal) read these three together.
        { id: 'demand', label: 'What evidence do you have?',
          help: 'Money changing hands \u2014 not encouragement.',
          options: [
            ['regulars', 'Regular customers already pay me this price',
              'Repeat business at the price you intend to charge',
              { demand_evidence: 'validated', repeat_demand: 'recurring',
                target_customer: 'specific', price_status: 'accepted' }],
            ['paid_once', 'Someone has paid my price, but not repeatedly yet',
              'And I know who my customers are',
              { demand_evidence: 'validated', repeat_demand: 'occasional',
                target_customer: 'specific', price_status: 'accepted' }],
            ['paid_broad', 'Someone has paid, but I am not sure who the wider market is', '',
              { demand_evidence: 'validated', repeat_demand: 'occasional',
                target_customer: 'broad', price_status: 'accepted' }],
            ['seen_specific', 'I have seen the demand and what competitors charge',
              'A waiting list, or rivals turning work away',
              { demand_evidence: 'observed', repeat_demand: 'occasional',
                target_customer: 'specific', price_status: 'benchmarked' }],
            ['seen_broad', 'I have seen the demand and competitor prices, but the customer group is broad', '',
              { demand_evidence: 'observed', repeat_demand: 'occasional',
                target_customer: 'broad', price_status: 'benchmarked' }],
            ['talk', 'People tell me it is a good idea, but nobody has paid',
              'So my price is still my own estimate',
              { demand_evidence: 'anecdotal', repeat_demand: 'occasional',
                target_customer: 'broad', price_status: 'assumed' }],
            ['untested_priced', 'Nobody has paid yet, but I have checked competitor prices',
              'I know the demand is untested',
              { demand_evidence: 'none', repeat_demand: 'occasional',
                target_customer: 'unclear', price_status: 'benchmarked' }],
            ['untested', 'Nobody has paid, and I have checked nothing yet', '',
              { demand_evidence: 'none', repeat_demand: 'occasional',
                target_customer: 'unclear', price_status: 'assumed' }],
            ['unknown', "I don't know", 'I genuinely cannot say yet',
              { demand_evidence: 'unknown', repeat_demand: 'occasional',
                target_customer: 'unclear', price_status: 'unknown' }, true]
          ] },

      ]
    }]
  },

  {
    title: 'Owner readiness',
    blurb: 'In a small business the owner is the quality control, the sales team and the cost controller.',
    questions: [{
      label: 'Your own experience',
      controls: [
        // R15 (direct), R16 (none + low) and R17 (none + high) read these
        // two together; reversibility matters only when experience is none,
        // so the first two options leave it unset rather than invent it.
        { id: 'owner', label: 'Have you done this work yourself, and can you give it the hours?',
          help: 'The hours the business needs, not the hours you have spare.',
          options: [
            ['direct_full', 'I have done this exact work — and I can give it full hours', '',
              { owner_experience: 'direct', owner_time: 'sufficient' }],
            ['direct_part', 'I have done this exact work — but only part-time', '',
              { owner_experience: 'direct', owner_time: 'insufficient' }],
            ['related_full', 'Something closely related — and I can give it full hours', '',
              { owner_experience: 'related', owner_time: 'sufficient' }],
            ['related_part', 'Something closely related — but only part-time', '',
              { owner_experience: 'related', owner_time: 'insufficient' }],
            ['none_rev_full', 'No experience — but I could stop within a month, and I am there full-time',
              'Low fixed costs, nothing locked in',
              { owner_experience: 'none', reversibility: 'high', owner_time: 'sufficient' }],
            ['none_rev_part', 'No experience — I could stop cheaply, but only part-time', '',
              { owner_experience: 'none', reversibility: 'high', owner_time: 'insufficient' }],
            ['none_locked_full', 'No experience — and stopping would cost me a lot',
              'A lease, staff or heavy equipment',
              { owner_experience: 'none', reversibility: 'low', owner_time: 'sufficient' }],
            ['none_locked_part', 'No experience, locked in, and only part-time', '',
              { owner_experience: 'none', reversibility: 'low', owner_time: 'insufficient' }]
          ] }
      ]
    }]
  },

  {
    title: 'Money',
    blurb: 'Startup cost alone is a misleading number. What matters is six months of running costs too.',
    questions: [
      {
        label: 'What it costs, and what you have',
        calc: true,
        controls: [
          { id: 'startup_cost', fact: 'startup_cost', type: 'number', prefix: 'LKR',
            label: 'Cost to open',
            help: 'Fit-out, equipment, deposits, stock.' },
          { id: 'monthly_cost', fact: 'monthly_cost', type: 'number', prefix: 'LKR',
            label: 'Cost to run, each month',
            help: 'Rent, salaries, utilities, your drawings.' },
          { id: 'capital_available', fact: 'capital_available', type: 'number', prefix: 'LKR',
            label: 'Money in hand or firmly committed',
            unknownFact: 'capital_status', unknownLabel: "I don't know yet" },
          { id: 'margin_rate', fact: 'margin_rate', type: 'number', suffix: '%',
            label: 'Expected gross margin',
            help: 'Of every 100 rupees taken, what is left after the direct cost of what you sold.' }
        ]
      },
      {
        label: 'Where the money comes from',
        controls: [
          // Rate bands remove a separate numeric question. Each band sets
          // stated_rate to its LOWER bound, so R11 (margin below funding
          // cost) only fires when the margin is below the cheapest rate the
          // band can mean - it never over-fires on a guess.
          { id: 'funding', label: 'Where is the money coming from, and what does it cost you?',
            options: [
              ['savings', 'My own savings', 'No interest cost',
                { funding_source: 'own_savings' }],
              ['family', 'Family, interest-free', '',
                { funding_source: 'family_interest_free' }],
              ['bank_low', 'A bank or formal lender, under 15% a year', '',
                { funding_source: 'formal_affordable', stated_rate: 10 }],
              ['bank_mid', 'A bank or formal lender, 15–25% a year', '',
                { funding_source: 'formal_affordable', stated_rate: 15 }],
              ['bank_high', 'A bank or formal lender, over 25% a year', '',
                { funding_source: 'formal_affordable', stated_rate: 25 }],
              ['informal', 'Informal high-interest borrowing', '',
                { funding_source: 'informal_high_interest', stated_rate: 40 }],
              ['pawned', 'Pawned jewellery or assets', '',
                { funding_source: 'pawned_asset', stated_rate: 30 }],
              ['home', 'A loan against the family home', '',
                { funding_source: 'home_secured_loan', stated_rate: 15 }]
            ] }
        ]
      }
    ]
  },

  {
    title: 'Survival and cash',
    blurb: 'More small businesses die from the owner running out of household money than from a competitor.',
    questions: [
      {
        label: 'How long you have',
        controls: [
          { id: 'breakeven_months', fact: 'breakeven_months', type: 'number', suffix: 'months',
            label: 'Months until the business covers its own costs' },
          { id: 'personal_runway', fact: 'personal_runway', type: 'number', suffix: 'months',
            label: 'Months your household can live without it',
            help: 'Money outside the business.' }
        ]
      },
      {
        label: 'When the money actually reaches you',
        controls: [
          { id: 'cash_cycle', fact: 'cash_cycle',
            options: [
              ['advance_payment', 'Before I deliver', 'Fees or deposits paid in advance'],
              ['on_delivery', 'At the time I deliver'],
              ['long_credit', 'Weeks or months later', 'Customers pay on credit'],
              ['heavy_stock', 'After stock sits for a long time']
            ] }
        ]
      }
    ]
  },

  {
    title: 'Competition and operations',
    blurb: 'In small local markets, competition is rarely about being better overall.',
    questions: [{
      label: 'Who else is doing this, and what could break',
      controls: [
        // R05 and R06 read competition and differentiation together.
        { id: 'market', label: 'Who else does this, and why would a customer choose you?',
          help: 'One narrow, defensible reason beats being better overall.',
          options: [
            ['few_strong', 'Few competitors — and I have a specific reason to be chosen', '',
              { competition: 'few', differentiation: 'strong' }],
            ['few_price', 'Few competitors — mainly I would be cheaper', '',
              { competition: 'few', differentiation: 'price_only' }],
            ['few_none', 'Few competitors — nothing specific sets me apart', '',
              { competition: 'few', differentiation: 'none' }],
            ['weak_strong', 'Many competitors but poor ones — and I have a specific reason', '',
              { competition: 'many_weak', differentiation: 'strong' }],
            ['weak_price', 'Many poor competitors — mainly I would be cheaper', '',
              { competition: 'many_weak', differentiation: 'price_only' }],
            ['weak_none', 'Many poor competitors — nothing specific sets me apart', '',
              { competition: 'many_weak', differentiation: 'none' }],
            ['strong_strong', 'Many strong competitors — but I have a specific reason', '',
              { competition: 'many_strong', differentiation: 'strong' }],
            ['strong_price', 'Many strong competitors — mainly I would be cheaper', '',
              { competition: 'many_strong', differentiation: 'price_only' }],
            ['strong_none', 'Many strong competitors — nothing specific sets me apart', '',
              { competition: 'many_strong', differentiation: 'none' }]
          ] },
        { id: 'dependency', fact: 'dependency',
          label: 'Does everything depend on one customer, supplier, person or platform?',
          help: 'Something that could be withdrawn without notice.',
          options: [
            ['high', 'Yes'],
            ['low', 'No']
          ] }
      ]
    }]
  },

  {
    title: 'Legal and licensing',
    blurb: 'A legal blocker is binary. Everything else is a matter of degree.',
    questions: [{
      label: 'Licensing position',
      controls: [
        { id: 'legal_status', fact: 'legal_status',
          options: [
            ['none_required', 'Nothing special is required'],
            ['routine', 'Routine registration I can obtain'],
            ['unknown', "I don't know what is required", 'I have not checked yet', null, true],
            ['blocking', 'Something required that I cannot realistically get']
          ] }
      ]
    }]
  }
];

/* Facts set outside the question flow. None at present. */
const PRESET_FACTS = [];

/* ---------- helpers shared by the browser and the tests ---------- */

function visibleQuestions(sec, answers) {
  return sec.questions.filter(q => !q.showIf || q.showIf(answers));
}

function visibleControls(q, answers) {
  return q.controls.filter(c => !c.showIf || c.showIf(answers));
}

/* The facts one option produces: an explicit map, or the control's
   single fact set to the option's value. */
function optionFacts(control, opt) {
  if (opt[3]) return opt[3];
  return { [control.fact]: opt[0] };
}

/* Turn the answer sheet into working-memory facts (SRS 4.1). */
function factsFor(answers) {
  const facts = [];
  for (const f of PRESET_FACTS) {
    if (answers[f] !== undefined && answers[f] !== null) facts.push(f + '(' + answers[f] + ')');
  }
  for (const sec of SECTIONS) {
    for (const q of visibleQuestions(sec, answers)) {
      for (const c of visibleControls(q, answers)) {
        const v = answers[c.id];

        if (c.unknownFact) {
          if (answers[c.unknownFact] === 'unknown') { facts.push(c.unknownFact + '(unknown)'); continue; }
          facts.push(c.unknownFact + '(known)');
        }
        if (v === undefined || v === null || v === '') continue;

        if (c.type === 'number') { facts.push(c.fact + '(' + v + ')'); continue; }

        const opt = c.options.find(o => o[0] === v);
        if (!opt) continue;
        const map = optionFacts(c, opt);
        for (const f in map) facts.push(f + '(' + map[f] + ')');
      }
    }
  }
  return facts;
}

/* Reverse of factsFor: given a map of Prolog facts (as the validation
   cases carry them), find the control answers that would produce them.
   Used to load the SRS section 12 examples into the form. */
function answersFromFacts(f) {
  const a = {};
  for (const p of PRESET_FACTS) if (f[p] !== undefined) a[p] = f[p];
  for (const sec of SECTIONS) {
    for (const q of sec.questions) {
      for (const c of q.controls) {
        if (c.unknownFact) a[c.unknownFact] = f[c.unknownFact] || 'known';
        if (c.type === 'number') {
          if (f[c.fact] !== undefined) a[c.id] = f[c.fact];
          continue;
        }
        const opt = c.options.find(o => {
          const m = optionFacts(c, o);
          return Object.keys(m).every(k => String(f[k]) === String(m[k]));
        });
        if (opt) a[c.id] = opt[0];
      }
    }
  }
  return a;
}

function countQuestions() {
  return SECTIONS.reduce((n, s) => n + s.questions.length, 0);
}
function countControls() {
  return SECTIONS.reduce((n, s) => n + s.questions.reduce((m, q) => m + q.controls.length, 0), 0);
}

return { SECTIONS, PRESET_FACTS, visibleQuestions, visibleControls, optionFacts,
         factsFor, answersFromFacts, countQuestions, countControls };
});

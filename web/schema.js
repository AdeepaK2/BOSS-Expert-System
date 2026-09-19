/* ============================================================
   B0SS - schema.js
   The seven sections, and which Prolog fact each control creates.

   This file is the single place where an interface control is tied
   to a working-memory fact (SRS 4.1). It holds no business logic:
   every rule, certainty factor and piece of advice lives in kb/*.pl.

   Loaded both by the browser (window.BOSS_SCHEMA) and by
   test/run_ui.js in node, so the fact mapping is tested against
   the real knowledge base rather than assumed correct.
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
    blurb: 'What kind of business, and what shape is it in.',
    questions: [
      { fact: 'business_type', label: 'What kind of business is this?', type: 'choice',
        options: [
          ['service', 'Service business', 'Salon, repairs, cleaning, events'],
          ['retail', 'Retail shop', 'Grocery, hardware, clothing'],
          ['online', 'Online / e-commerce', 'Reselling, digital storefront'],
          ['education', 'Education or tuition', 'Classes, training, skills'],
          ['professional_service', 'Professional service', 'Design, accounting, IT support'],
          ['food', 'Food and beverage', 'Outlet, cloud kitchen, catering'],
          ['owner_trade', 'Owner-operated trade', 'Carpentry, electrical, tailoring']
        ] },
      { fact: 'venture_type', label: 'Is this a new business or another branch?', type: 'choice',
        options: [
          ['new', 'A new business', ''],
          ['branch', 'A second location or branch', '']
        ] },
      { fact: 'channel_type', label: 'How will customers reach you?', type: 'choice',
        options: [
          ['walk_in', 'They come to a physical place', 'Walk-in shop, salon, outlet'],
          ['online', 'Entirely online', 'No premises customers visit'],
          ['hybrid', 'Both', '']
        ] }
    ]
  },
  {
    title: 'Demand and price',
    blurb: 'The one factor with no substitute: will somebody actually pay.',
    questions: [
      { fact: 'demand_evidence', label: 'What evidence do you have that someone will pay?', type: 'choice',
        help: 'Money changing hands, or being firmly promised — not encouragement.',
        options: [
          ['validated', 'Someone has already paid', 'A deposit, a pre-order, an existing customer'],
          ['observed', 'I have seen the demand directly', 'Competitors turning work away, a waiting list'],
          ['anecdotal', 'People have told me it is a good idea', 'Encouragement, but no money'],
          ['none', 'No evidence yet — and I have not tested it', 'I know it is untested'],
          ['unknown', "I don't know", 'I genuinely cannot say yet', true]
        ] },
      { fact: 'target_customer', label: 'How clearly can you describe the customer?', type: 'choice',
        options: [
          ['specific', 'Very specifically', 'I could name or find them today'],
          ['broad', 'Broadly', ''],
          ['unclear', 'Not clearly yet', '']
        ] },
      { fact: 'repeat_demand', label: 'Would the same customer buy again?', type: 'choice',
        options: [
          ['recurring', 'Regularly', 'Weekly, monthly, by subscription'],
          ['occasional', 'Occasionally', ''],
          ['one_off', 'Usually once only', '']
        ] },
      { fact: 'price_status', label: 'Has your selling price been checked against the real market?', type: 'choice',
        options: [
          ['accepted', 'Yes — a customer has accepted it', ''],
          ['benchmarked', 'Yes — I checked competitor prices', ''],
          ['assumed', 'No — it is my own estimate', ''],
          ['unknown', "I don't know", 'I have not set a price yet', true]
        ] }
    ]
  },
  {
    title: 'Owner readiness',
    blurb: 'In a small business the owner is the quality control, the sales team and the cost controller.',
    questions: [
      { fact: 'owner_experience', label: 'Have you done this work yourself — not managed it, done it?', type: 'choice',
        options: [
          ['direct', 'Yes, hands-on', ''],
          ['related', 'Something closely related', ''],
          ['none', 'No', '']
        ] },
      { fact: 'owner_time', label: 'Can you give the business the hours it actually needs?', type: 'choice',
        help: 'The hours the business needs, not the hours you have spare.',
        options: [
          ['sufficient', 'Yes', ''],
          ['insufficient', 'No — only part of them', '']
        ] },
      { fact: 'reversibility', label: 'If this went badly, could you stop cheaply?', type: 'choice',
        help: 'Long leases, hired staff and bought equipment make stopping expensive.',
        options: [
          ['high', 'Yes — I could stop within a month', ''],
          ['low', 'No — I would lose a lot', 'Lease, staff or equipment']
        ] }
    ]
  },
  {
    title: 'Money',
    blurb: 'Startup cost alone is a misleading number. What matters is six months of running costs too.',
    questions: [
      { fact: 'startup_cost', label: 'What will it cost to open?', type: 'number', prefix: 'LKR',
        help: 'Everything before your first sale: fit-out, equipment, deposits, stock.' },
      { fact: 'monthly_cost', label: 'What will it cost to run each month?', type: 'number', prefix: 'LKR',
        help: 'Rent, salaries, utilities, your own drawings.' },
      { fact: 'capital_available', label: 'How much do you have in hand or firmly committed?', type: 'number', prefix: 'LKR',
        unknownFact: 'capital_status', unknownLabel: "I don't know yet" },
      { fact: 'funding_source', label: 'Where is that money coming from?', type: 'choice',
        options: [
          ['own_savings', 'My own savings', ''],
          ['family_interest_free', 'Family, interest-free', ''],
          ['formal_affordable', 'A bank or formal lender', 'At a rate I can service'],
          ['informal_high_interest', 'Informal high-interest borrowing', ''],
          ['pawned_asset', 'Pawned jewellery or assets', ''],
          ['home_secured_loan', 'A loan against the family home', '']
        ] },
      { fact: 'stated_rate', label: 'What annual interest rate are you paying on it?', type: 'number', suffix: '%',
        showIf: a => a.funding_source && !['own_savings', 'family_interest_free'].includes(a.funding_source) },
      { fact: 'margin_rate', label: 'What gross margin do you expect?', type: 'number', suffix: '%',
        help: 'Of every 100 rupees a customer pays, how many are left after the direct cost of what you sold.' }
    ],
    calc: true
  },
  {
    title: 'Survival and cash',
    blurb: 'More small businesses die from the owner running out of household money than from a competitor.',
    questions: [
      { fact: 'breakeven_months', label: 'How many months until the business covers its own costs?', type: 'number', suffix: 'months' },
      { fact: 'personal_runway', label: 'How many months can your household live on without this business?', type: 'number', suffix: 'months',
        help: 'Money outside the business that your family can live on.' },
      { fact: 'cash_cycle', label: 'When does the money actually reach you?', type: 'choice',
        options: [
          ['advance_payment', 'Before I deliver', ''],
          ['on_delivery', 'At the time I deliver', ''],
          ['long_credit', 'Weeks or months later', ''],
          ['heavy_stock', 'After stock sits for a long time', '']
        ] }
    ]
  },
  {
    title: 'Competition and operations',
    blurb: 'In small local markets, competition is rarely about being better overall.',
    questions: [
      { fact: 'competition', label: 'Who else is already doing this near you or online?', type: 'choice',
        options: [
          ['few', 'Very few', ''],
          ['many_weak', 'Many, but not good', 'Crowded with poor operators'],
          ['many_strong', 'Many, and they are strong', '']
        ] },
      { fact: 'differentiation', label: 'Why would a customer leave them for you?', type: 'choice',
        help: 'One narrow, defensible reason beats being better overall.',
        options: [
          ['strong', 'A specific reason I can defend', 'A skill, location, language, timing or relationship'],
          ['price_only', 'Mainly because I am cheaper', ''],
          ['none', 'Nothing specific yet', '']
        ] },
      { fact: 'dependency', label: 'Does everything depend on one customer, supplier, person or platform?', type: 'choice',
        help: 'Something that could be withdrawn without notice.',
        options: [
          ['high', 'Yes', ''],
          ['low', 'No', '']
        ] }
    ]
  },
  {
    title: 'Legal and licensing',
    blurb: 'A legal blocker is binary. Everything else is a matter of degree.',
    questions: [
      { fact: 'legal_status', label: 'What is the licensing position?', type: 'choice',
        options: [
          ['none_required', 'Nothing special is required', ''],
          ['routine', 'Routine registration I can obtain', ''],
          ['unknown', "I don't know what is required", '', true],
          ['blocking', 'Something required that I cannot realistically get', '']
        ] }
    ]
  }
];

/* experienced_support and channel_fit were listed by SRS 4.1 but are read by
   no rule and no derived value, so they are not collected. venture_type is
   also read by no rule, but FR-01 names it explicitly, so it stays.
   See DECISIONS.md, observation 6. */

function visibleQuestions(sec, answers) {
  return sec.questions.filter(q => !q.showIf || q.showIf(answers));
}

/* Turn the answer sheet into working-memory facts (SRS 4.1). */
function factsFor(answers) {
  const facts = [];
  for (const sec of SECTIONS) {
    for (const q of visibleQuestions(sec, answers)) {
      const v = answers[q.fact];
      if (q.unknownFact) {
        if (answers[q.unknownFact] === 'unknown') { facts.push(q.unknownFact + '(unknown)'); continue; }
        facts.push(q.unknownFact + '(known)');
      }
      if (v === undefined || v === null || v === '') continue;
      facts.push(q.fact + '(' + v + ')');
    }
  }
  return facts;
}

return { SECTIONS, visibleQuestions, factsFor };
});

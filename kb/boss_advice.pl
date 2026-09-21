% ============================================================
% B0SS - boss_advice.pl
% Presentation knowledge: what each rule means in plain business
% language, and the specific next action for every concern
% (SRS section 10). Kept in the knowledge base rather than the
% interface so it can be edited without touching the UI (FR-11).
% ============================================================

% ---------- Plain-language reading of each rule ----------

rule_text(r01, 'Repeat customers already pay your price.').
rule_text(r02, 'Observed demand, and you know the customer.').
rule_text(r03, 'Nobody has paid yet; interest is not demand.').
rule_text(r04, 'Your price is untested against the market.').
rule_text(r05, 'Strong competitors, nothing that sets you apart.').
rule_text(r06, 'A clear edge offsets the competition.').
rule_text(r07, 'Capital covers startup plus 6 months, from a safe source.').
rule_text(r08, 'You have most of the money, not all of it.').
rule_text(r09, 'You have under half the money needed.').
rule_text(r10, 'The funding could take the household down with it.').
rule_text(r11, 'Margin is below the cost of the funding.').
rule_text(r12, 'Healthy margin and early cash.').
rule_text(r13, 'Cash goes out well before it comes in.').
rule_text(r14, 'Funded months run out before break-even.').
rule_text(r15, 'You have done this work yourself.').
rule_text(r16, 'No hands-on experience, no cheap way to stop.').
rule_text(r17, 'No experience, but a small, reversible start.').
rule_text(r18, 'A walk-in business needs you there in customer hours.').
rule_text(r19, 'One customer, supplier, person or platform can end it.').
rule_text(r20, 'The household runs out of money before the business pays.').
rule_text(r21, 'It cannot legally operate in this form.').
rule_text(r22, 'Something critical is unknown, so no positive answer.').
rule_text(r23, 'Nothing argues against detailed planning.').
rule_text(r24, 'The core case holds; weaknesses need mitigation.').
rule_text(r25, 'Several serious but fixable problems.').

% ---------- A specific next action for every concern ----------

next_action(r03, 'Get one real payment or signed commitment at your price.').
next_action(r04, 'Ask 3 likely customers what they pay; check 2 competitors'' prices.').
next_action(r05, 'Name the one reason a customer would switch to you, or change the offer.').
next_action(r08, 'Raise the shortfall first, or cut the plan to fit your capital.').
next_action(r09, 'Redesign to a version you can fund for six months.').
next_action(r10, 'Change the funding or scale: no home-secured or high-interest money.').
next_action(r11, 'Recheck margin and interest; if the margin is real, each sale loses money.').
next_action(r13, 'Negotiate deposits or faster payment before buying stock.').
next_action(r14, 'Cut monthly costs or raise capital until funded months beat break-even.').
next_action(r16, 'Work in the trade for a season, or bring in an experienced partner.').
next_action(r18, 'Arrange cover for customer hours, or change channel.').
next_action(r19, 'Get the dependency in writing and line up a second option.').
next_action(r20, 'Keep 3 months of household costs outside the business, or delay.').
next_action(r21, 'Confirm the licence position with the authority first.').

% ---------- Missing information -> what to go and find out ----------

unknown_label(demand,  'Whether anyone will pay is untested.').
unknown_label(price,   'The selling price is unvalidated.').
unknown_label(capital, 'Your actual capital is not known.').
unknown_label(legal,   'The licensing position is unknown.').

unknown_action(demand,  'Take one deposit, pre-order or paid trial.').
unknown_action(price,   'Check the price against real competitors and customers.').
unknown_action(capital, 'Work out startup and monthly running costs.').
unknown_action(legal,   'Find out which licences are needed, and if you can get them.').

% SRS section 6 "validation gap": critical items that are assumed rather
% than known. These are the heart of what B0SS is for.
gap_label(test_demand,    'Demand is untested with money.').
gap_label(validate_price, 'The selling price is unvalidated.').

gap_action(test_demand,    'Take one deposit, pre-order or paid trial.').
gap_action(validate_price, 'Check the price against 2 competitors and 3 likely customers.').

% ---------- CF labels, SRS section 8 ----------

cf_label(CF, 'Definitely not')    :- CF =< -0.9.
cf_label(CF, 'Almost certainly not') :- CF > -0.9, CF =< -0.7.
cf_label(CF, 'Probably not')      :- CF > -0.7, CF =< -0.5.
cf_label(CF, 'Maybe not')         :- CF > -0.5, CF =< -0.3.
cf_label(CF, 'Unknown / insufficient basis') :- CF > -0.3, CF < 0.3.
cf_label(CF, 'Maybe')             :- CF >= 0.3, CF < 0.5.
cf_label(CF, 'Probably')          :- CF >= 0.5, CF < 0.7.
cf_label(CF, 'Almost certainly')  :- CF >= 0.7, CF < 0.9.
cf_label(CF, 'Definitely')        :- CF >= 0.9.

% ---------- The six intermediate conclusions (SRS section 6) ----------

conclusion_label(market,     'Demand').
conclusion_label(competition,'Competition').
conclusion_label(finance,    'Money').
conclusion_label(owner,      'Owner').
conclusion_label(operations, 'Operations').
conclusion_label(risk,       'Risk').

conclusion_word(market, high,     'Strong').
conclusion_word(market, moderate, 'Moderate').
conclusion_word(market, low,      'No evidence').
conclusion_word(competition, strong,   'Defensible').
conclusion_word(competition, adequate, 'Adequate').
conclusion_word(competition, weak,     'Exposed').
conclusion_word(finance, ready,     'Funded').
conclusion_word(finance, marginal,  'Short').
conclusion_word(finance, not_ready, 'Not funded').
conclusion_word(owner, strong,   'Experienced').
conclusion_word(owner, adequate, 'Learnable').
conclusion_word(owner, weak,     'Unready').
conclusion_word(operations, ready,     'Workable').
conclusion_word(operations, marginal,  'Tight').
conclusion_word(operations, not_ready, 'Not workable').
conclusion_word(risk, low,      'Low').
conclusion_word(risk, moderate, 'Moderate').
conclusion_word(risk, high,     'High').
conclusion_word(risk, critical, 'Critical').

% Whether a conclusion reads as positive, mixed or negative. Depends on
% the dimension: 'high' is good for demand and bad for risk.
conclusion_tone(market, high, good).      conclusion_tone(market, moderate, warn).
conclusion_tone(market, low, bad).
conclusion_tone(competition, strong, good). conclusion_tone(competition, adequate, warn).
conclusion_tone(competition, weak, bad).
conclusion_tone(finance, ready, good).    conclusion_tone(finance, marginal, warn).
conclusion_tone(finance, not_ready, bad).
conclusion_tone(owner, strong, good).     conclusion_tone(owner, adequate, warn).
conclusion_tone(owner, weak, bad).
conclusion_tone(operations, ready, good). conclusion_tone(operations, marginal, warn).
conclusion_tone(operations, not_ready, bad).
conclusion_tone(risk, low, good).         conclusion_tone(risk, moderate, warn).
conclusion_tone(risk, high, bad).         conclusion_tone(risk, critical, bad).

% ---------- The SRS 9.1 decision ladder, in plain words ----------

gate_label(scope,        'Can B0SS screen it?').
gate_label(override,     'Any deal-breaker?').
gate_label(unknowns,     'Anything critical unknown?').
gate_label(proceed,      'Core case clean?').
gate_label(caution,      'Sound, with fixable weaknesses?').
gate_label(in_this_form, '2+ serious risks?').
gate_label(insufficient, 'Not enough to decide.').

gate_detail(override,     'Dangerous funding, margin below funding cost, or a legal blocker.').
gate_detail(unknowns,     'Demand, price, capital or licensing.').
gate_detail(proceed,      'Demand, money, owner and operations all hold, with no weakness.').
gate_detail(caution,      'Core factors positive and at most two weaknesses.').
gate_detail(in_this_form, 'Serious but correctable - the plan should change first.').

gate_outcome(scope,        out_of_scope).
gate_outcome(override,     not_recommended).
gate_outcome(unknowns,     further_validation_required).
gate_outcome(proceed,      proceed).
gate_outcome(caution,      proceed_with_caution).
gate_outcome(in_this_form, not_recommended_in_this_form).
gate_outcome(insufficient, further_validation_required).

% ---------- Verdict headline text ----------

verdict_text(out_of_scope, 'OUTSIDE WHAT B0SS CAN SCREEN').
verdict_text(proceed, 'PROCEED').
verdict_text(proceed_with_caution, 'PROCEED WITH CAUTION').
verdict_text(further_validation_required, 'FURTHER VALIDATION REQUIRED').
verdict_text(not_recommended, 'NOT RECOMMENDED').
verdict_text(not_recommended_in_this_form, 'NOT RECOMMENDED IN THIS FORM').

verdict_blurb(out_of_scope, 'This type needs specialist judgement these rules do not contain.').
verdict_blurb(proceed, 'Continue to detailed planning. This is not a prediction of success.').
verdict_blurb(proceed_with_caution, 'The core case is positive, but fix the concerns below before or during launch.').
verdict_blurb(further_validation_required, 'Something critical is unknown. Check it before deciding.').
verdict_blurb(not_recommended, 'A blocking condition makes this unacceptable, whatever else is strong.').
verdict_blurb(not_recommended_in_this_form, 'Change the scale, model, dependency or timing, then assess again.').

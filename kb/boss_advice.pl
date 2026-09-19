% ============================================================
% B0SS - boss_advice.pl
% Presentation knowledge: what each rule means in plain business
% language, and the specific next action for every concern
% (SRS section 10). Kept in the knowledge base rather than the
% interface so it can be edited without touching the UI (FR-11).
% ============================================================

% ---------- Plain-language reading of each rule ----------

rule_text(r01, 'Repeat customers have already paid at your intended price.').
rule_text(r02, 'There is observed demand and you know exactly who the customer is.').
rule_text(r03, 'Nobody has paid yet - interest and encouragement are not demand.').
rule_text(r04, 'Your price is an assumption that has not been tested against the market.').
rule_text(r05, 'Strong competitors and nothing specific that makes a customer choose you.').
rule_text(r06, 'A clear reason to choose you offsets the number of competitors.').
rule_text(r07, 'Capital covers startup plus six months of running costs, from a safe source.').
rule_text(r08, 'You have most of the money you need, but not all of it.').
rule_text(r09, 'You have less than half the money this plan requires.').
rule_text(r10, 'The funding source can take the household down with the business.').
rule_text(r11, 'Your margin is below the cost of the money funding the business.').
rule_text(r12, 'Healthy margin and you collect cash early.').
rule_text(r13, 'Cash goes out well before it comes back in.').
rule_text(r14, 'You run out of funded months before you reach break-even.').
rule_text(r15, 'You have done this work yourself, not just managed it.').
rule_text(r16, 'No hands-on experience and no cheap way to stop.').
rule_text(r17, 'No experience yet, but the start is small and reversible.').
rule_text(r18, 'A walk-in business needs you there during customer hours.').
rule_text(r19, 'One customer, supplier, person or platform can end the business.').
rule_text(r20, 'The household runs out of money before the business can pay it.').
rule_text(r21, 'The business cannot legally operate in this form.').
rule_text(r22, 'Something critical is still unknown, so no positive answer is possible.').
rule_text(r23, 'Nothing in this screening argues against detailed planning.').
rule_text(r24, 'The core case holds, with weaknesses that need explicit mitigation.').
rule_text(r25, 'Several serious but fixable problems exist in the current plan.').

% ---------- A specific next action for every concern ----------

next_action(r03, 'Before spending anything, get one real payment or a signed commitment at your intended price.').
next_action(r04, 'Ask three likely customers what they pay now, and check two competitors'' actual prices.').
next_action(r05, 'Write down the one narrow reason a customer would leave a competitor for you. If you cannot, change the offer.').
next_action(r08, 'Either raise the shortfall before starting, or cut the plan until your capital covers it.').
next_action(r09, 'Do not start at this scale. Redesign to a version you can fund for six months.').
next_action(r10, 'Do not fund this with money secured on the home or borrowed at high interest. Change the funding or the scale.').
next_action(r11, 'Recheck your margin and your interest rate. If the margin is genuinely lower, this plan loses money on every sale.').
next_action(r13, 'Negotiate deposits or faster payment terms before committing to stock or credit.').
next_action(r14, 'Reduce monthly costs or raise capital until funded months exceed your break-even estimate.').
next_action(r16, 'Work in this trade for a season first, or bring in a committed partner who has.').
next_action(r18, 'Arrange cover for customer hours, or move to a channel that does not need you present.').
next_action(r19, 'Get the dependency in writing and line up a second option before you launch.').
next_action(r20, 'Keep at least three months of household costs outside the business, or delay the start.').
next_action(r21, 'Confirm the licence position with the relevant authority before going further.').

% ---------- Missing information -> what to go and find out ----------

unknown_label(demand,  'Whether anyone will actually pay has not been tested.').
unknown_label(price,   'The selling price has not been validated.').
unknown_label(capital, 'How much capital you actually have is not known.').
unknown_label(legal,   'The licensing position is not known.').

unknown_action(demand,  'Test whether anyone will pay: take one deposit, pre-order or paid trial.').
unknown_action(price,   'Validate the selling price against real competitor prices and real customer responses.').
unknown_action(capital, 'Work out your actual startup cost and monthly running cost before deciding anything else.').
unknown_action(legal,   'Find out exactly which licences or approvals this business needs, and whether you can get them.').

gap_action(test_demand,   'Demand has not been tested with money.').
gap_action(validate_price,'The selling price has not been validated.').

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

% ---------- Verdict headline text ----------

verdict_text(proceed, 'PROCEED').
verdict_text(proceed_with_caution, 'PROCEED WITH CAUTION').
verdict_text(further_validation_required, 'FURTHER VALIDATION REQUIRED').
verdict_text(not_recommended, 'NOT RECOMMENDED').
verdict_text(not_recommended_in_this_form, 'NOT RECOMMENDED IN THIS FORM').

verdict_blurb(proceed, 'Continue to detailed planning. This does not mean the business will succeed.').
verdict_blurb(proceed_with_caution, 'The core case is positive, but fix the concerns below before or during launch.').
verdict_blurb(further_validation_required, 'Something critical is unknown. Find it out before deciding; the list below is what to check.').
verdict_blurb(not_recommended, 'A blocking condition makes this unacceptable in its current form, whatever else is strong.').
verdict_blurb(not_recommended_in_this_form, 'Change the scale, model, dependency or timing, then assess again.').

% ============================================================
% B0SS - boss_rules.pl
% The 25 expert IF-THEN rules (SRS section 7).
%
% Representation is the one documented in SRS 7.1:
%     rule(Id, Conclusion, CF) :- Evidence.
%
% Where the expert stated two outcomes for one rule (a conclusion
% plus a validation_gap or red_flag entry) the conclusion is an
% and/2 term. concludes/3 in boss_infer.pl unfolds it, so rule/3
% keeps the arity and shape the SRS shows.
%
% CF expresses the expert's belief in the rule conclusion when its
% evidence is present. It is NOT a probability of business success.
% ============================================================

% ---------- Market attractiveness ----------

% R01 - strongest practical evidence of a repeatable market.
rule(r01, market_attractiveness(high), 0.8) :-
    demand_evidence(validated),
    repeat_demand(recurring).

% R02 - real evidence plus a reachable customer group.
% Concludes 'moderate': R01 already covers the 'high' case.
rule(r02, market_attractiveness(moderate), 0.6) :-
    demand_evidence(D),
    member(D, [observed, validated]),
    target_customer(specific).

% R03 - interest or encouragement is not willingness to pay.
rule(r03, and(market_attractiveness(low), validation_gap(test_demand)), -0.8) :-
    demand_evidence(D),
    member(D, [none, anecdotal]).

% R04 - financial conclusions are weak until the price is checked.
rule(r04, validation_gap(validate_price), -0.4) :-
    price_status(assumed).

% ---------- Competitive position ----------

% R05 - a small entrant cannot rely on an undifferentiated price fight.
rule(r05, competitive_position(weak), -0.8) :-
    competition(many_strong),
    differentiation(D),
    member(D, [none, price_only]).

% R06 - a specific reason to choose the business can offset crowding.
rule(r06, competitive_position(strong), 0.6) :-
    competition(C),
    member(C, [few, many_weak]),
    differentiation(strong).

% ---------- Financial readiness ----------

% R07 - funded through startup and six months from a safe source.
rule(r07, financial_readiness(ready), 0.8) :-
    capital_available(A),
    capital_requirement(R),
    A >= R,
    funding_source(S),
    safe_funding(S).

% R08 - underfunded; the plan should be reduced or delayed.
% Concludes 'marginal': R09 already covers the severe case.
rule(r08, financial_readiness(marginal), -0.6) :-
    capital_available(A),
    capital_requirement(R),
    Half is 0.5 * R,
    A >= Half,
    A < R.

% R09 - unlikely to stay open long enough to test the market.
rule(r09, and(overall_risk(high), red_flag(severe_underfunding)), -0.8) :-
    capital_available(A),
    capital_requirement(R),
    Half is 0.5 * R,
    A < Half.

% ---------- Absolute overrides ----------

% R10 - risky funding can endanger the household.
rule(r10, recommendation(not_recommended), -1.0) :-
    funding_source(S),
    dangerous_funding(S).

% R11 - each sale destroys value at the financing cost.
rule(r11, recommendation(not_recommended), -1.0) :-
    margin_rate(M),
    effective_funding_cost(C),
    M < C.

% ---------- Margin, cash cycle and survival ----------

% R12 - healthy margin and early cash collection make mistakes survivable.
rule(r12, financial_readiness(ready), 0.6) :-
    margin_level(L),
    member(L, [adequate, strong]),
    cash_cycle(C),
    member(C, [advance_payment, on_delivery]).

% R13 - money is tied up before cash returns to the business.
rule(r13, overall_risk(high), -0.6) :-
    cash_cycle(C),
    member(C, [long_credit, heavy_stock]),
    \+ holds_upto(1, financial_readiness(ready)).

% R14 - expected to run out of funded time before break-even.
rule(r14, and(overall_risk(high), survival_runway(insufficient)), -0.8) :-
    breakeven_months(B),
    funded_months(F),
    B > F.

% ---------- Owner readiness ----------

% R15 - hands-on experience reduces operating and quality-control errors.
rule(r15, owner_readiness(strong), 0.8) :-
    owner_experience(direct).

% R16 - learning is expensive when the commitment cannot be reversed.
rule(r16, owner_readiness(weak), -0.8) :-
    owner_experience(none),
    reversibility(low).

% R17 - low-cost reversible starts allow the owner to learn safely.
rule(r17, owner_readiness(adequate), 0.4) :-
    owner_experience(none),
    reversibility(high).

% ---------- Operations ----------

% R18 - a walk-in business must be available during customer hours.
rule(r18, operational_readiness(not_ready), -0.6) :-
    owner_time(insufficient),
    channel_type(walk_in).

% R19 - one customer, supplier, person or platform is a single point of failure.
rule(r19, and(overall_risk(high), red_flag(concentration)), -0.6) :-
    dependency(high).

% R20 - household pressure forces damaging short-term business decisions.
rule(r20, and(overall_risk(high), red_flag(household_exposure)), -0.8) :-
    personal_runway(P),
    P < 3,
    breakeven_months(B),
    B > 6.

% R21 - the business cannot legally operate in the proposed form.
rule(r21, recommendation(not_recommended), -1.0) :-
    legal_status(blocking).

% ---------- Final recommendation rules ----------

% R22 - report insufficient basis rather than guess.
% \+ \+ gives exactly one solution however many unknowns exist.
rule(r22, recommendation(further_validation_required), 0.0) :-
    \+ \+ critical_unknown(_).

% R23 - nothing in the screening currently argues against detailed planning.
rule(r23, recommendation(proceed), 0.8) :-
    \+ absolute_override,
    \+ critical_unknown(_),
    core_positive,
    holds(financial_readiness(ready)),
    holds(owner_readiness(O)),
    member(O, [adequate, strong]),
    \+ weakness(_).

% R24 - the opportunity may continue only with stated mitigations.
rule(r24, recommendation(proceed_with_caution), 0.6) :-
    \+ absolute_override,
    \+ critical_unknown(_),
    core_positive,
    weakness_count(N),
    N > 0,
    N =< 2.

% R25 - the current scale/model should change before reassessment.
rule(r25, recommendation(not_recommended_in_this_form), -0.8) :-
    \+ absolute_override,
    \+ critical_unknown(_),
    severe_risk_count(N),
    N >= 2.

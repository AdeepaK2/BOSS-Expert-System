% ============================================================
% B0SS - boss_infer.pl
% Inference control: rule stratification, severity tables and the
% SRS section 9.1 priority ladder.
%
% Backward chaining is the query strategy (SRS section 4). Rules
% are grouped into levels so that a rule which asks what another
% rule concluded can never re-enter its own body:
%
%   level 1  intermediate conclusions drawn straight from facts
%   level 2  intermediate conclusions that consult level 1 (R13)
%   level 3  recommendation rules (overrides and final verdicts)
%
% holds/1 exposes levels 1-2 only, so the final rules can read the
% intermediate picture while remaining outside it.
% ============================================================

rule_level(r01, 1). rule_level(r02, 1). rule_level(r03, 1).
rule_level(r04, 1). rule_level(r05, 1). rule_level(r06, 1).
rule_level(r07, 1). rule_level(r08, 1). rule_level(r09, 1).
rule_level(r12, 1). rule_level(r14, 1). rule_level(r15, 1).
rule_level(r16, 1). rule_level(r17, 1). rule_level(r18, 1).
rule_level(r19, 1). rule_level(r20, 1).
rule_level(r13, 2).
rule_level(r10, 3). rule_level(r11, 3). rule_level(r21, 3).
rule_level(r22, 3). rule_level(r23, 3). rule_level(r24, 3).
rule_level(r25, 3).

% Unfold an and/2 conclusion into its individual conclusions.
unfold(and(A, B), C) :- !, ( unfold(A, C) ; unfold(B, C) ).
unfold(C, C).

% A rule fires when its body succeeds. Id is always bound before
% rule/3 is called, so only that one clause is ever executed.
fires(Id) :-
    rule_level(Id, _),
    rule(Id, _, _).

% What an applicable rule up to level L concludes.
holds_upto(L, C) :-
    rule_level(Id, RL),
    RL =< L,
    rule(Id, Concl, _),
    unfold(Concl, C).

% Intermediate conclusions visible to the final recommendation rules.
holds(C) :- holds_upto(2, C).

% ------------------------------------------------------------
% Severity tables (decision 3)
% These make the SRS's prose thresholds - "at most two manageable
% weaknesses", "two or more severe unmitigated risks" - countable,
% and keep them editable in one place.
% ------------------------------------------------------------

severe_risk(no_market)           :- holds(market_attractiveness(low)).
severe_risk(owner_unready)       :- holds(owner_readiness(weak)).
severe_risk(competitive_weak)    :- holds(competitive_position(weak)).
severe_risk(severe_underfunding) :- holds(red_flag(severe_underfunding)).
severe_risk(concentration)       :- holds(red_flag(concentration)).
severe_risk(household_exposure)  :- holds(red_flag(household_exposure)).
severe_risk(survival_runway)     :- holds(survival_runway(insufficient)).

weakness(W) :- severe_risk(W).
weakness(financial_marginal)     :- holds(financial_readiness(marginal)).
weakness(operations_not_ready)   :- holds(operational_readiness(not_ready)).
weakness(cash_cycle_slow) :-
    holds(overall_risk(high)),
    cash_cycle(C),
    member(C, [long_credit, heavy_stock]).

severe_risk_count(N) :-
    findall(R, severe_risk(R), L0),
    sort(L0, L),
    length(L, N).

weakness_count(N) :-
    findall(W, weakness(W), L0),
    sort(L0, L),
    length(L, N).

% The core case the expert checks before any softer factor.
core_positive :-
    \+ \+ ( holds(market_attractiveness(M)), member(M, [high, moderate]) ),
    \+ holds(owner_readiness(weak)),
    \+ holds(red_flag(severe_underfunding)).

% ------------------------------------------------------------
% Absolute overrides - SRS 8.1: R10, R11 and R21 bypass all
% positive evidence.
% ------------------------------------------------------------

absolute_override :-
    member(Id, [r10, r11, r21]),
    rule(Id, _, _),
    !.

override_rule(Id) :-
    member(Id, [r10, r11, r21]),
    rule(Id, _, _).

% ------------------------------------------------------------
% SRS 9.1 priority order
% ------------------------------------------------------------

recommendation(Rec, CF) :-
    (   absolute_override
    ->  Rec = not_recommended,               CF = -1.0
    ;   critical_unknown(_)
    ->  Rec = further_validation_required,   CF = 0.0
    ;   fires(r23)
    ->  Rec = proceed,                       CF = 0.8
    ;   fires(r24)
    ->  Rec = proceed_with_caution,          CF = 0.6
    ;   fires(r25)
    ->  Rec = not_recommended_in_this_form,  CF = -0.8
    ;   Rec = further_validation_required,   CF = 0.0
    ).

% ------------------------------------------------------------
% Explanation support - SRS section 10 / FR-08 / FR-09
% ------------------------------------------------------------

% Every rule that fired, with its conclusion and CF, strongest first.
trace(Trace) :-
    findall(t(Abs, Id, Concl, CF),
            ( fires(Id), rule(Id, Concl, CF), Abs is -abs(CF) ),
            L0),
    sort(L0, L1),
    findall(fired(Id, Concl, CF), member(t(_, Id, Concl, CF), L1), Trace).

positives(Top) :-
    trace(T),
    findall(fired(Id, C, CF), ( member(fired(Id, C, CF), T), CF > 0 ), L),
    first_n(3, L, Top).

concerns(Top) :-
    trace(T),
    findall(fired(Id, C, CF), ( member(fired(Id, C, CF), T), CF < 0 ), L),
    first_n(3, L, Top).

missing(M) :-
    findall(U, critical_unknown(U), L0),
    sort(L0, M).

gaps(G) :-
    findall(Item, holds(validation_gap(Item)), L0),
    sort(L0, G).

red_flags(F) :-
    findall(Flag, holds(red_flag(Flag)), L0),
    sort(L0, F).

first_n(0, _, []) :- !.
first_n(_, [], []) :- !.
first_n(N, [H|T], [H|R]) :- N1 is N - 1, first_n(N1, T, R).

% ------------------------------------------------------------
% Single entry point queried by the interface.
% ------------------------------------------------------------

assess(assessment(Rec, CF, Pos, Con, Missing, Gaps, Flags, Trace, Money)) :-
    recommendation(Rec, CF),
    positives(Pos),
    concerns(Con),
    missing(Missing),
    gaps(Gaps),
    red_flags(Flags),
    trace(Trace),
    money(Money).

% Visible arithmetic for the explanation (SRS section 10).
money(money(Req, Funded, Gap)) :-
    ( capital_requirement(R) -> Req = R ; Req = unknown ),
    ( funded_months(F)       -> Funded = F ; Funded = unknown ),
    ( survival_gap(G)        -> Gap = G ; Gap = unknown ).

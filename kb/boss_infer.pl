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
%
% The \+ \+ gives exactly one solution per rule. Without it a rule whose
% body consults holds/1 succeeds once per rule that supports the same
% conclusion - R23 yields two identical solutions when both R07 and R12
% conclude financial_readiness(ready).
fires(Id) :-
    rule_level(Id, _),
    \+ \+ rule(Id, _, _).

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

% ------------------------------------------------------------
% SRS 9.1 priority order
% ------------------------------------------------------------

recommendation(Rec, CF) :-
    (   out_of_scope(_)
    ->  Rec = out_of_scope,                  CF = 0.0
    ;   absolute_override
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
% The path through the SRS 9.1 ladder that produced this answer.
% Returned as a list of d(Gate, pass|exit, Detail) so the interface can
% draw the route actually taken. This is derived from the same checks
% recommendation/2 makes - it is not a hand-drawn picture of them.
% ------------------------------------------------------------

override_fired(Id) :-
    member(Id, [r10, r11, r21]),
    rule(Id, _, _).

decision_path(P) :-
    (   out_of_scope(T)
    ->  P = [d(scope, exit, T)]
    ;   S = d(scope, pass, ok),
        (   absolute_override
        ->  findall(I, override_fired(I), Os),
            P = [S, d(override, exit, Os)]
        ;   O = d(override, pass, []),
            (   critical_unknown(_)
            ->  findall(U, critical_unknown(U), Us0), sort(Us0, Us),
                P = [S, O, d(unknowns, exit, Us)]
            ;   U = d(unknowns, pass, []),
                weakness_count(W),
                severe_risk_count(V),
                (   fires(r23)
                ->  P = [S, O, U, d(proceed, exit, W)]
                ;   Pr = d(proceed, pass, W),
                    (   fires(r24)
                    ->  P = [S, O, U, Pr, d(caution, exit, W)]
                    ;   C = d(caution, pass, W),
                        (   fires(r25)
                        ->  P = [S, O, U, Pr, C, d(in_this_form, exit, V)]
                        ;   P = [S, O, U, Pr, C, d(in_this_form, pass, V),
                                 d(insufficient, exit, 0)]
                        )
                    )
                )
            )
        )
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

first_n(0, _, []) :- !.
first_n(_, [], []) :- !.
first_n(N, [H|T], [H|R]) :- N1 is N - 1, first_n(N1, T, R).

% ------------------------------------------------------------
% Single entry point queried by the interface.
% ------------------------------------------------------------

assess(assessment(Rec, CF, Pos, Con, Missing, Gaps, Trace, Money, Scope, Concl, Path)) :-
    scope(Scope),
    conclusions(Concl),
    decision_path(Path),
    recommendation(Rec, CF),
    positives(Pos),
    concerns(Con),
    missing(Missing),
    gaps(Gaps),
    trace(Trace),
    money(Money).

% The six intermediate conclusions of SRS section 6, for the summary
% panel. Each is whatever the applicable rules concluded.
conclusion(market,     V) :- holds(market_attractiveness(V)).
conclusion(competition,V) :- holds(competitive_position(V)).
conclusion(finance,    V) :- holds(financial_readiness(V)).
conclusion(owner,      V) :- holds(owner_readiness(V)).
conclusion(operations, V) :- holds(operational_readiness(V)).
conclusion(risk,       V) :- holds(overall_risk(V)).

conclusions(L) :-
    findall(c(K, V), conclusion(K, V), L0),
    sort(L0, L).

% Scope and input validation (SRS section 2).
scope(scope(State, Bad)) :-
    ( out_of_scope(T) -> State = out_of_scope(T)
    ; in_scope        -> State = ok
    ;                    State = ok
    ),
    findall(N, unrecognised(N), Bad0),
    sort(Bad0, Bad).

% Visible arithmetic for the explanation (SRS section 10).
money(money(Req, Funded, Gap)) :-
    ( capital_requirement(R) -> Req = R ; Req = unknown ),
    ( funded_months(F)       -> Funded = F ; Funded = unknown ),
    ( survival_gap(G)        -> Gap = G ; Gap = unknown ).

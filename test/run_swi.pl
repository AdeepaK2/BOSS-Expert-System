:- initialization(main, main).

:- consult('../kb/boss_kb').
:- consult('../kb/boss_derive').
:- consult('../kb/boss_rules').
:- consult('../kb/boss_infer').
:- consult('../kb/boss_advice').
:- consult('cases').

clear :-
    forall(member(P/A, [business_type/1, venture_type/1, channel_type/1,
        demand_evidence/1, target_customer/1, repeat_demand/1, price_status/1,
        owner_experience/1, owner_time/1, experienced_support/1, reversibility/1,
        startup_cost/1, monthly_cost/1, capital_available/1, capital_status/1,
        funding_source/1, stated_rate/1, margin_rate/1, breakeven_months/1,
        personal_runway/1, cash_cycle/1, competition/1, differentiation/1,
        dependency/1, channel_fit/1, legal_status/1]),
        ( functor(H, P, A), retractall(H) )).

load([]).
load([F|Fs]) :- assertz(F), load(Fs).

run(Id, ok) :-
    case(Id, Name, expected(ERec, ECF), Facts),
    clear, load(Facts),
    assess(assessment(Rec, CF, _, _, Miss, _, Flags, Trace, _)),
    length(Trace, NT),
    (   Rec == ERec, abs(CF - ECF) < 0.001
    ->  format("  PASS  Case ~w  ~w~n        -> ~w (~w)  rules fired: ~w~n",
               [Id, Name, Rec, CF, NT])
    ;   format("  FAIL  Case ~w  ~w~n        expected ~w (~w)  got ~w (~w)~n        missing=~w flags=~w~n",
               [Id, Name, ERec, ECF, Rec, CF, Miss, Flags]),
        fail
    ).

main :-
    format("~nB0SS validation - SRS section 12~n~n"),
    findall(Id, case(Id, _, _, _), Ids),
    (   forall(member(Id, Ids), run(Id, ok))
    ->  format("~nAll 6 cases passed.~n~n"), halt(0)
    ;   format("~nFailures above.~n~n"), halt(1)
    ).

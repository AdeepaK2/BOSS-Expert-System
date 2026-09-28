% Working memory and values calculated from user answers (SRS 4.2).

% Session facts supplied by the interface
:- dynamic(business_type/1).
:- dynamic(venture_type/1).
:- dynamic(channel_type/1).
:- dynamic(demand_evidence/1).
:- dynamic(target_customer/1).
:- dynamic(repeat_demand/1).
:- dynamic(price_status/1).
:- dynamic(owner_experience/1).
:- dynamic(owner_time/1).
:- dynamic(reversibility/1).
:- dynamic(startup_cost/1).
:- dynamic(monthly_cost/1).
:- dynamic(capital_available/1).
:- dynamic(capital_status/1).
:- dynamic(funding_source/1).
:- dynamic(stated_rate/1).
:- dynamic(margin_rate/1).
:- dynamic(breakeven_months/1).
:- dynamic(personal_runway/1).
:- dynamic(cash_cycle/1).
:- dynamic(competition/1).
:- dynamic(differentiation/1).
:- dynamic(dependency/1).
:- dynamic(legal_status/1).

% Arithmetic

% capital_requirement = startup_cost + (6 x monthly_operating_cost)
capital_requirement(C) :-
    startup_cost(S),
    monthly_cost(M),
    C is S + 6 * M.

% funded_months = max(0, capital_available - startup_cost) / monthly_cost
% Use a conditional because Tau-Prolog does not fully support max/2.
funded_months(F) :-
    capital_available(A),
    startup_cost(S),
    monthly_cost(M),
    M > 0,
    Spare is A - S,
    (   Spare > 0
    ->  F is Spare / M
    ;   F = 0
    ).

% survival_gap = funded_months - breakeven_months
survival_gap(G) :-
    funded_months(F),
    breakeven_months(B),
    G is F - B.

% Margin categories
% SRS 3.5 rule of thumb: above 30% retail, above 45% services.

margin_floor(retail, 30).
margin_floor(food, 30).
margin_floor(service, 45).
margin_floor(online, 45).
margin_floor(education, 45).
margin_floor(professional_service, 45).
margin_floor(owner_trade, 45).

margin_level(L) :-
    margin_rate(R),
    business_type(T),
    margin_floor(T, Floor),
    Strong is Floor + 15,
    (   R >= Strong ->  L = strong
    ;   R >= Floor  ->  L = adequate
    ;                   L = low
    ).

% Funding cost for R11. Unknown rates fail instead of using a default.

free_capital(own_savings).
free_capital(family_interest_free).

effective_funding_cost(0) :-
    funding_source(S),
    free_capital(S).
effective_funding_cost(R) :-
    funding_source(S),
    \+ free_capital(S),
    stated_rate(R).

% Domain and scope validation (SRS section 2)

known_value(business_type(T))   :- supported_business(T).
known_value(demand_evidence(unknown)).
known_value(demand_evidence(D)) :- demand_level(D).
known_value(cash_cycle(C))      :- cash_cycle_type(C).
known_value(legal_status(L))    :- legal_value(L).
known_value(funding_source(F))  :- safe_funding(F).
known_value(funding_source(F))  :- dangerous_funding(F).

checked_input(demand_evidence(_)).
checked_input(cash_cycle(_)).
checked_input(legal_status(_)).
checked_input(funding_source(_)).

% Reject answers outside the known domain.
unrecognised(Name) :-
    checked_input(Fact),
    call(Fact),
    \+ known_value(Fact),
    functor(Fact, Name, _).

% Unsupported businesses need specialist assessment.
in_scope :-
    business_type(T),
    supported_business(T).

out_of_scope(T) :-
    business_type(T),
    \+ supported_business(T).

% Unknown demand, price, capital or legal status blocks a positive result.

critical_unknown(demand) :-
    demand_evidence(unknown).
critical_unknown(price) :-
    price_status(P),
    member(P, [assumed, unknown]).
critical_unknown(capital) :-
    capital_status(unknown).
critical_unknown(legal) :-
    legal_status(unknown).

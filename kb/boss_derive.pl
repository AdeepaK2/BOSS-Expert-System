% ============================================================
% B0SS - boss_derive.pl
% Working-memory declarations and derived values.
%
% SRS section 4.2: these are CALCULATED from user answers and are
% never asked as separate questions.
%
% The clauses in this file are derivation parameters, NOT domain
% facts: the 25 knowledge-base facts of SRS section 5 remain
% exactly 25. See DECISIONS.md, decision 1.
% ============================================================

% --- Session facts, asserted by the interface (SRS 4.1) ---
:- dynamic(business_type/1).
:- dynamic(venture_type/1).
:- dynamic(channel_type/1).
:- dynamic(demand_evidence/1).
:- dynamic(target_customer/1).
:- dynamic(repeat_demand/1).
:- dynamic(price_status/1).
:- dynamic(owner_experience/1).
:- dynamic(owner_time/1).
:- dynamic(experienced_support/1).
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
:- dynamic(channel_fit/1).
:- dynamic(legal_status/1).

% ------------------------------------------------------------
% SRS 4.2 - arithmetic
% ------------------------------------------------------------

% capital_requirement = startup_cost + (6 x monthly_operating_cost)
capital_requirement(C) :-
    startup_cost(S),
    monthly_cost(M),
    C is S + 6 * M.

% funded_months = max(0, capital_available - startup_cost) / monthly_cost
% Written as a conditional rather than max/2: Tau-Prolog's evaluable
% functor coverage is thinner than SWI's.
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

% ------------------------------------------------------------
% Margin: numeric input -> category (decision 1)
% SRS 3.5 rule of thumb: above 30% retail, above 45% services.
% ------------------------------------------------------------

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

% ------------------------------------------------------------
% Cost of the money funding the business (needed by R11).
% Own savings and interest-free family money cost nothing.
% Any borrowed source uses the rate the user stated; if no rate
% is known this simply fails, so R11 cannot fire on a guess
% (NFR-Robustness: the system must not invent defaults).
% ------------------------------------------------------------

free_capital(own_savings).
free_capital(family_interest_free).

effective_funding_cost(0) :-
    funding_source(S),
    free_capital(S).
effective_funding_cost(R) :-
    funding_source(S),
    \+ free_capital(S),
    stated_rate(R).

% ------------------------------------------------------------
% Critical unknowns - SRS 9.1 step 2 (decision 4)
% Demand, price, capital and legal status are the four inputs
% that block a positive answer when they are not known.
% ------------------------------------------------------------

critical_unknown(demand) :-
    demand_evidence(unknown).
critical_unknown(price) :-
    price_status(P),
    member(P, [assumed, unknown]).
critical_unknown(capital) :-
    capital_status(unknown).
critical_unknown(legal) :-
    legal_status(unknown).

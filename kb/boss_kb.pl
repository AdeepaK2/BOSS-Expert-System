% ============================================================
% B0SS - Business Opportunity Screening System
% boss_kb.pl - Fixed domain knowledge base
%
% 25 unconditional facts, transcribed verbatim from SRS section 5.
% These never change between assessments. Session facts asserted
% from the user's answers live in working memory, not here.
%
% Count: 7 supported_business + 3 safe_funding + 3 dangerous_funding
%      + 4 demand_level + 4 cash_cycle_type + 4 legal_value = 25
% ============================================================

% --- Business types B0SS is allowed to screen (7) ---
supported_business(service).
supported_business(retail).
supported_business(online).
supported_business(education).
supported_business(professional_service).
supported_business(food).
supported_business(owner_trade).

% --- Funding sources that do not endanger the household (3) ---
safe_funding(own_savings).
safe_funding(family_interest_free).
safe_funding(formal_affordable).

% --- Funding sources that trigger the R10 absolute override (3) ---
dangerous_funding(informal_high_interest).
dangerous_funding(pawned_asset).
dangerous_funding(home_secured_loan).

% --- Strength of evidence that somebody will actually pay (4) ---
demand_level(none).
demand_level(anecdotal).
demand_level(observed).
demand_level(validated).

% --- How money moves in and out of the business (4) ---
cash_cycle_type(advance_payment).
cash_cycle_type(on_delivery).
cash_cycle_type(long_credit).
cash_cycle_type(heavy_stock).

% --- Licensing / legal position (4) ---
legal_value(none_required).
legal_value(routine).
legal_value(unknown).
legal_value(blocking).

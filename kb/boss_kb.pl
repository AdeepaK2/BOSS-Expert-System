% Fixed domain facts from SRS section 5. Session facts are stored separately.

% Supported business types
supported_business(service).
supported_business(retail).
supported_business(online).
supported_business(education).
supported_business(professional_service).
supported_business(food).
supported_business(owner_trade).

% Safe funding sources
safe_funding(own_savings).
safe_funding(family_interest_free).
safe_funding(formal_affordable).

% Funding sources that trigger R10
dangerous_funding(informal_high_interest).
dangerous_funding(pawned_asset).
dangerous_funding(home_secured_loan).

% Demand evidence
demand_level(none).
demand_level(anecdotal).
demand_level(observed).
demand_level(validated).

% Cash cycles
cash_cycle_type(advance_payment).
cash_cycle_type(on_delivery).
cash_cycle_type(long_credit).
cash_cycle_type(heavy_stock).

% Legal status
legal_value(none_required).
legal_value(routine).
legal_value(unknown).
legal_value(blocking).

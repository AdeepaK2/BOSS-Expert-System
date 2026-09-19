% ============================================================
% B0SS - test/cases.pl
% The six expert validation scenarios of SRS section 12.
%
% The SRS states each case's expected verdict and CF but not its
% input figures. The numbers below were chosen to produce the
% stated outcome through the stated rules; they are listed in
% DECISIONS.md for the expert to confirm at sign-off (SRS 16).
% ============================================================

case(1, 'Home-based tuition', expected(proceed, 0.8), [
    business_type(education), venture_type(new), channel_type(hybrid),
    demand_evidence(validated), target_customer(specific),
    repeat_demand(recurring), price_status(accepted),
    owner_experience(direct), owner_time(sufficient), reversibility(high),
    startup_cost(60000), monthly_cost(25000), capital_available(300000),
    capital_status(known), funding_source(own_savings), margin_rate(70),
    breakeven_months(3), personal_runway(6), cash_cycle(advance_payment),
    competition(many_weak), differentiation(strong),
    dependency(low), legal_status(none_required)
]).

case(2, 'Bubble tea outlet', expected(not_recommended_in_this_form, -0.8), [
    business_type(food), venture_type(new), channel_type(walk_in),
    demand_evidence(none), target_customer(broad),
    repeat_demand(one_off), price_status(benchmarked),
    owner_experience(none), owner_time(sufficient), reversibility(low),
    startup_cost(1500000), monthly_cost(300000), capital_available(1400000),
    capital_status(known), funding_source(own_savings), margin_rate(50),
    breakeven_months(12), personal_runway(4), cash_cycle(heavy_stock),
    competition(many_strong), differentiation(none),
    dependency(low), legal_status(routine)
]).

case(3, 'Cloud kitchen', expected(further_validation_required, 0.0), [
    business_type(food), venture_type(new), channel_type(online),
    demand_evidence(observed), target_customer(specific),
    repeat_demand(occasional), price_status(benchmarked),
    owner_experience(direct), owner_time(sufficient), reversibility(high),
    startup_cost(800000), monthly_cost(250000), capital_available(1000000),
    capital_status(known), funding_source(own_savings), margin_rate(55),
    breakeven_months(8), personal_runway(5), cash_cycle(on_delivery),
    competition(many_weak), differentiation(strong),
    dependency(high), legal_status(unknown)
]).

case(4, 'Home-based web agency', expected(further_validation_required, 0.0), [
    business_type(professional_service), venture_type(new), channel_type(online),
    demand_evidence(unknown), target_customer(unclear),
    repeat_demand(occasional), price_status(assumed),
    owner_experience(direct), owner_time(sufficient), reversibility(high),
    startup_cost(50000), monthly_cost(40000), capital_available(350000),
    capital_status(known), funding_source(own_savings), margin_rate(80),
    breakeven_months(4), personal_runway(8), cash_cycle(on_delivery),
    competition(many_strong), differentiation(price_only),
    dependency(low), legal_status(none_required)
]).

case(5, 'Grocery shop, pawned-jewellery funding', expected(not_recommended, -1.0), [
    business_type(retail), venture_type(new), channel_type(walk_in),
    demand_evidence(observed), target_customer(specific),
    repeat_demand(recurring), price_status(benchmarked),
    owner_experience(none), owner_time(insufficient), reversibility(low),
    startup_cost(1200000), monthly_cost(200000), capital_available(1300000),
    capital_status(known), funding_source(pawned_asset),
    stated_rate(36), margin_rate(12),
    breakeven_months(10), personal_runway(2), cash_cycle(heavy_stock),
    competition(many_strong), differentiation(none),
    dependency(low), legal_status(routine)
]).

case(6, 'Second salon branch', expected(proceed_with_caution, 0.6), [
    business_type(service), venture_type(branch), channel_type(walk_in),
    demand_evidence(validated), target_customer(specific),
    repeat_demand(recurring), price_status(accepted),
    owner_experience(direct), owner_time(sufficient), reversibility(high),
    startup_cost(900000), monthly_cost(350000), capital_available(3200000),
    capital_status(known), funding_source(own_savings), margin_rate(62),
    breakeven_months(5), personal_runway(9), cash_cycle(on_delivery),
    competition(many_weak), differentiation(strong),
    dependency(high), legal_status(routine)
]).

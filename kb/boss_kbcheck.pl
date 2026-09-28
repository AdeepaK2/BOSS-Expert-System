% Editor checks for incomplete, inconsistent or unused knowledge.
% kb_issues/1 returns sorted i(Severity, Code, Subject) entries.

:- dynamic(ui_value/2).
:- discontiguous(kb_issue/3).

kb_issues(L) :-
    findall(i(S, C, X), kb_issue(S, C, X), L0),
    sort(L0, L).

% Read rules as data

rule_clause(Id, Concl, CF, Body) :-
    clause(rule(Id, Concl, CF), Body).

rule_id(Id) :- rule_clause(Id, _, _, _).

% Extract simple goals, including those under negation.
body_goal(G, _) :- var(G), !, fail.
body_goal((A, B), G)    :- !, ( body_goal(A, G) ; body_goal(B, G) ).
body_goal((A ; B), G)   :- !, ( body_goal(A, G) ; body_goal(B, G) ).
body_goal((A -> B), G)  :- !, ( body_goal(A, G) ; body_goal(B, G) ).
body_goal(\+ A, G)      :- !, body_goal(A, G).
body_goal(call(A), G)   :- !, body_goal(A, G).
body_goal(G, G).

% Goals a rule may call that are not defined in the knowledge base.
builtin(member/2).  builtin(memberchk/2). builtin(is/2).
builtin((<)/2).     builtin((>)/2).       builtin((=<)/2).
builtin((>=)/2).    builtin((=:=)/2).     builtin((=\=)/2).
builtin((=)/2).     builtin((\=)/2).      builtin((==)/2).
builtin((\==)/2).   builtin(true/0).      builtin(fail/0).
builtin(length/2).  builtin(findall/3).   builtin(sort/2).
builtin(between/3). builtin(number/1).    builtin(atom/1).

% Session attributes are dynamic predicates from boss_derive.pl.
session_attribute(A) :-
    atom(A),
    A \== rule,
    A \== ui_value,
    functor(H, A, 1),
    predicate_property(H, dynamic).

% The values an attribute is allowed to take, where anything says.
has_domain(A) :- T =.. [A, _], \+ \+ known_value(T), !.
has_domain(A) :- \+ \+ ui_value(A, _).

known_attr_value(A, V) :- T =.. [A, V], known_value(T), !.
known_attr_value(A, V) :- ui_value(A, V), !.
known_attr_value(A, unknown) :- ui_value(A, _), !.   % the "I don't know" answer

% Read attr(const) and attr(X) with member(X, [...]) constraints.
constraint(Body, A, [V]) :-
    body_goal(Body, G),
    G =.. [A, V],
    atom(V),
    session_attribute(A).
constraint(Body, A, Vs) :-
    body_goal(Body, G),
    G =.. [A, X],
    var(X),
    session_attribute(A),
    body_goal(Body, member(Y, Vs)),
    Y == X,
    is_list(Vs).

tested_value(Body, A, V) :-
    constraint(Body, A, Vs),
    member(V, Vs).

% What a rule concludes, one term at a time (unfold/2: boss_infer.pl).
concludes_term(Id, C) :-
    rule_clause(Id, Concl, _, _),
    unfold(Concl, C).

% 1. Certainty factors and identity

kb_issue(error, cf_not_number, Id) :-
    rule_clause(Id, _, CF, _),
    \+ number(CF).
kb_issue(error, cf_out_of_range, Id-CF) :-
    rule_clause(Id, _, CF, _),
    number(CF),
    ( CF < -1 ; CF > 1 ).
kb_issue(error, id_not_atom, Id) :-
    rule_clause(Id, _, _, _),
    \+ atom(Id).
kb_issue(error, duplicate_id, Id) :-
    rule_id(Id),
    findall(x, rule_clause(Id, _, _, _), Xs),
    length(Xs, N),
    N > 1.

% 2. Inference and explanation coverage

% Without a level, fires/1 and holds/1 never see the rule.
kb_issue(error, no_level, Id) :-
    rule_id(Id),
    \+ rule_level(Id, _).
kb_issue(error, bad_level, Id-L) :-
    rule_level(Id, L),
    \+ member(L, [1, 2, 3]).
kb_issue(warning, orphan_level, Id) :-
    rule_level(Id, _),
    \+ rule_id(Id).

kb_issue(error, no_text, Id) :-
    rule_id(Id),
    \+ rule_text(Id, _).
kb_issue(warning, orphan_text, Id) :-
    rule_text(Id, _),
    \+ rule_id(Id).

% A concern with nothing the user can do about it.
kb_issue(warning, no_action, Id) :-
    rule_clause(Id, _, CF, _),
    number(CF),
    CF < 0,
    \+ next_action(Id, _).
kb_issue(warning, orphan_action, Id) :-
    next_action(Id, _),
    \+ rule_id(Id).

% boss_infer.pl names these rules directly.
reserved_rule(r10, override).  reserved_rule(r11, override).
reserved_rule(r21, override).  reserved_rule(r22, ladder).
reserved_rule(r23, ladder).    reserved_rule(r24, ladder).
reserved_rule(r25, ladder).

kb_issue(error, reserved_missing, Id) :-
    reserved_rule(Id, _),
    \+ rule_id(Id).

% 3. Vocabulary

kb_issue(error, undefined_goal, Id-(N/A)) :-
    rule_clause(Id, _, _, Body),
    body_goal(Body, G),
    callable(G),
    functor(G, N, A),
    \+ builtin(N/A),
    \+ current_predicate(N/A).

% A value no answer can ever produce: the condition can never hold.
kb_issue(error, unknown_value, Id-T) :-
    rule_clause(Id, _, _, Body),
    tested_value(Body, A, V),
    has_domain(A),
    \+ known_attr_value(A, V),
    T =.. [A, V].

% Flag questionnaire values no longer recognised by the knowledge base.
kb_issue(error, ui_unrecognised, T) :-
    ui_value(A, V),
    T =.. [A, V],
    checked_input(T),
    \+ known_value(T).

kb_issue(error, unknown_verdict, Id-V) :-
    concludes_term(Id, recommendation(V)),
    \+ verdict_text(V, _).

kb_issue(warning, gap_unlabelled, Id-G) :-
    concludes_term(Id, validation_gap(G)),
    \+ gap_label(G, _).

% The body asks for a conclusion that no rule draws.
kb_issue(warning, unsupported_holds, Id-C) :-
    rule_clause(Id, _, _, Body),
    body_goal(Body, G),
    ( G = holds(C) ; G = holds_upto(_, C) ),
    nonvar(C),
    \+ concludes_term(_, C).

% 4. Stratification: rules may read only lower-level conclusions.

reads_level(holds(_), 2).
reads_level(holds_upto(K, _), K).
reads_level(core_positive, 2).
reads_level(weakness(_), 2).
reads_level(weakness_count(_), 2).
reads_level(severe_risk(_), 2).
reads_level(severe_risk_count(_), 2).
reads_level(absolute_override, 3).
reads_level(fires(_), 3).

kb_issue(error, stratification, Id-G) :-
    rule_clause(Id, _, _, Body),
    rule_level(Id, L),
    L < 3,
    body_goal(Body, G),
    reads_level(G, K),
    ( var(K) ; K >= L ).

% Level 3 is outside holds/1: a non-verdict drawn there is never read.
kb_issue(warning, level_unread, Id-C) :-
    rule_level(Id, 3),
    concludes_term(Id, C),
    C \= recommendation(_).
kb_issue(warning, verdict_below_3, Id) :-
    rule_level(Id, L),
    L < 3,
    concludes_term(Id, recommendation(_)).

% Verdict rules outside the fixed ladder cannot change its result.
kb_issue(warning, not_in_ladder, Id) :-
    rule_level(Id, 3),
    rule_id(Id),
    \+ reserved_rule(Id, _).

% 5. Conflicting rules

% These conclusions may have multiple values.
multi_valued(validation_gap).
multi_valued(red_flag).
multi_valued(recommendation).

% Numeric tests are not compared, so conflicts are warnings only.
exclusive(B1, B2) :-
    constraint(B1, A, V1s),
    constraint(B2, A, V2s),
    \+ ( member(V, V1s), member(V, V2s) ).

kb_issue(warning, conflict, (I1-I2):C1/C2) :-
    rule_clause(I1, _, _, B1),
    rule_clause(I2, _, _, B2),
    I1 @< I2,
    rule_level(I1, L), rule_level(I2, L),
    concludes_term(I1, C1),
    concludes_term(I2, C2),
    C1 =.. [F, V1],
    C2 =.. [F, V2],
    \+ multi_valued(F),
    V1 \== V2,
    \+ exclusive(B1, B2).

% Messages shown in the editor

check_text(cf_not_number,     'Certainty factor is not a number').
check_text(cf_out_of_range,   'Certainty factor is outside -1 .. 1').
check_text(id_not_atom,       'Rule id must be an atom such as r26').
check_text(duplicate_id,      'Two rules share this id').
check_text(no_level,          'No rule_level/2, so the rule can never fire').
check_text(bad_level,         'Rule level must be 1, 2 or 3').
check_text(orphan_level,      'rule_level/2 for a rule that does not exist').
check_text(no_text,           'No rule_text/2, so the rule cannot be explained').
check_text(orphan_text,       'rule_text/2 for a rule that does not exist').
check_text(no_action,         'A concern with no next_action/2 for the user').
check_text(orphan_action,     'next_action/2 for a rule that does not exist').
check_text(reserved_missing,  'boss_infer.pl names this rule directly; it must exist').
check_text(undefined_goal,    'The body calls a predicate the knowledge base does not define').
check_text(unknown_value,     'A value no answer can produce, so the condition never holds').
check_text(ui_unrecognised,   'The questionnaire offers this answer, but the knowledge base no longer recognises it').
check_text(unknown_verdict,   'A verdict with no verdict_text/2').
check_text(gap_unlabelled,    'A validation gap with no gap_label/2').
check_text(unsupported_holds, 'Reads a conclusion that no rule draws').
check_text(stratification,    'Reads conclusions from its own level or above (can loop)').
check_text(level_unread,      'Level 3 is invisible to holds/1, so nothing can use this conclusion').
check_text(verdict_below_3,   'A verdict drawn below level 3 is not a recommendation rule').
check_text(not_in_ladder,     'The SRS 9.1 ladder does not consult this rule; it cannot change the verdict').
check_text(conflict,          'Can fire together with a different conclusion (numeric tests not compared)').

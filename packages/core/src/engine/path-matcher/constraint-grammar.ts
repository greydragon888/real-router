// packages/path-matcher/src/constraint-grammar.ts

/**
 * Single source of truth for the constraint-delimiter `<...>` grammar (#804).
 *
 * Before this module the `<...>` grammar was re-spelled independently in 6
 * places across `path-matcher` + `route-tree`, with a live `+`/`*` desync
 * between the match side (`<[^>]+>`) and the strip/build side (`<[^>]*>`) — the
 * exact "two desynced regexes" class #738 unified for the param-*name* axis.
 * This module is the constraint-axis counterpart of `PARAM_NAME_PATTERN`:
 *
 * - `CONSTRAINT_BODY_PATTERN` — the one atom every constraint-parsing regex
 *   (match / strip / build) derives from, so they can never disagree again.
 * - `isConstraintBalanced` — the one balance predicate the route-tree gate and
 *   the `registerTree` backstop consume, so no layer re-rolls the scan.
 *
 * @module constraint-grammar
 */

/**
 * Constraint body between `<` and `>`: any run of characters except the
 * closing `>`. Canonical quantifier is `*` (empties allowed at the *grammar*
 * level; the semantically-useless empty `<>` is rejected at the route-tree gate
 * and the `registerTree` backstop, not smuggled through — see #804 §3.3). Every
 * regex that parses `<...>` derives from this constant via interpolation, so the
 * match / strip / build phases share one definition — the same discipline
 * `PARAM_NAME_PATTERN` established for the param-name axis (#738).
 */
export const CONSTRAINT_BODY_PATTERN = "[^>]*";

/**
 * Reports whether a path's `<...>` constraint delimiters are balanced.
 *
 * Single linear scan: a `<` opens a constraint and the first following `>`
 * closes it; a `<` inside the body is allowed (`<[a<b]>`). A `>` seen outside a
 * constraint, or a `<` left unclosed at the end, is a stray/unbalanced
 * delimiter.
 *
 * Implemented as a scan rather than a `replaceAll(new RegExp(...), "")` strip so
 * the intent — delimiter *balance*, not HTML *sanitization* — is unambiguous to
 * both readers and static analysis (the regex strip is the classic
 * incomplete-tag-sanitizer pattern CodeQL flags, which this is not).
 *
 * Authoritative in the producing layer (#804): `route-tree`'s `validateRoutePath`
 * gate and `path-matcher`'s own `registerTree` backstop both consume this — the
 * opt-in/gate validators never reimplement the scan (same axis as #1047).
 */
export function isConstraintBalanced(path: string): boolean {
  let insideConstraint = false;

  for (const char of path) {
    if (char === "<") {
      insideConstraint = true;
    } else if (char === ">") {
      if (!insideConstraint) {
        return false; // stray `>` with no open `<`
      }

      insideConstraint = false;
    }
  }

  return !insideConstraint; // a still-open `<` is an unclosed constraint
}

/**
 * A query-param NAME may not contain `<`/`>` (#1242 §5.1) — such a char is a
 * constraint delimiter leaked into the query, e.g. a reverse-order modifier typo
 * `/a/:b?<\d+>` parses the `?` as the query start, making `<\d+>` the query name.
 * Single-sourced so the route-tree gate and the `registerTree` backstop share one
 * definition of "invalid query-name char".
 */
export const INVALID_QUERY_NAME_RGX = /[<>]/u;

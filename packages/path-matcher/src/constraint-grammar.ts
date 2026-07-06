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
 * Reports whether a `<...>` constraint occupies a STATIC segment — one WITHOUT a
 * leading `:`/`*` marker (`/foo<bar>`, `/a<b>`). The marker-agnostic constraint
 * strip (`CONSTRAINT_PATTERN_RGX`) silently removes such a constraint
 * (`/foo<bar>` → `/foo`), reshaping the route with no signal. `hasFusedConstraintSuffix`
 * (#1150) catches only a constraint fused with TRAILING text (`/:id<\d+>x`); one
 * cleanly ENDING a static segment slips through. The sibling of #1050/#1150 on the
 * static-segment axis (#1311).
 *
 * A linear scan (a constraint body may contain `/` — `<[a/b]>` — so a plain
 * segment split is unsafe). `isConstraintBalanced` runs first, so every `<` has a
 * matching `>`. Like `isConstraintBalanced`, authoritative in the producing layer:
 * `route-tree`'s `validateRoutePath` gate and `path-matcher`'s `registerTree`
 * backstop both consume this — no layer re-rolls the scan (#804 discipline).
 */
export function hasConstraintInStaticSegment(path: string): boolean {
  let atSegmentStart = true;
  let segmentIsParam = false;
  let inConstraint = false;

  for (const char of path) {
    if (inConstraint) {
      // A `<` inside the body belongs to it; the FIRST `>` closes (mirrors
      // isConstraintBalanced). A `/` inside a constraint is not a segment boundary.
      if (char === ">") {
        inConstraint = false;
      }

      continue;
    }

    if (char === "/") {
      atSegmentStart = true;
      segmentIsParam = false;

      continue;
    }

    if (atSegmentStart) {
      segmentIsParam = char === ":" || char === "*";
      atSegmentStart = false;
    }

    if (char === "<") {
      if (!segmentIsParam) {
        return true;
      }

      inConstraint = true;
    }
  }

  return false;
}

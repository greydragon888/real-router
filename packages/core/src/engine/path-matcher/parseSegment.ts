/**
 * Canonical route-segment tokenizer.
 *
 * The single owner of "where does a name / marker / constraint end" for ONE
 * path segment (post-`/`-split). It replaces the five name-boundary compositions
 * of `PARAM_NAME_PATTERN` currently spread across `buildParamMeta` (L1),
 * `registration` (L2 build + L3 trie), and `route-tree`'s validation gate (L4),
 * so those layers can never disagree on a boundary (the gate↔backstop drift
 * class — #858 / #1050 / #1150 / #1311 / #1149 / #1324).
 *
 * A single left-to-right `charCodeAt` scan produces either a token tuple or a
 * typed error. Grammar — **3 tokens only** (`static | :param | *splat`); the
 * grammar has no optional `:x?` or `<re>` constraint forms. Any `<`/`>` or a
 * post-name `?` in the path is a *registration error* carrying a replacement
 * recipe (`optional-removed` / `constraint-removed`), not a token:
 * 1. Leading `:`/`*` → param/splat; otherwise `static` (a marker glued *after* a
 *    static prefix ⇒ `fused-marker`; any `<`/`>` (a former constraint) ⇒
 *    `constraint-removed`; a trailing `?` on a marker-less segment ⇒ `name-less`
 *    — the modifier has no param name, #1241 / `/faq?`).
 * 2. name = any char except `<`/`?` (no `/` remains inside a segment); a name
 *    ending in a bare `:`/`*` ⇒ `trailing-marker` (#1324). A *mid* marker stays
 *    a name char — `:a:b` → name `a:b`, preserved.
 * 3. empty name ⇒ `name-less` (#858).
 * 4. a `<` after the name (a former `<re>` constraint) ⇒ `constraint-removed`.
 * 5. a post-name `?` (a former optional modifier, on `:param` or `*splat`) ⇒
 *    `optional-removed`.
 *
 * @module parseSegment
 */

/* eslint-disable unicorn/prefer-code-point, unicorn/prefer-includes-over-repeated-comparisons, sonarjs/cognitive-complexity -- charCodeAt code-unit scan + a single inlined branchy pass are this RFC's char-scan perf basis (§9); the same deliberate choices as registration/trie.ts hasNonAsciiSegment (#1285) and SegmentMatcher's inlined #traverseFrom. A `[LT,GT,QUESTION].includes(code)` boundary check would allocate an array literal per scanned char. Markers compared are ASCII (`:` `*` `<` `>` `?`, < 0x80). */

/** A successfully tokenized segment (3-token grammar: `static | :param | *splat`). */
export type SegmentTokens =
  | { readonly kind: "static"; readonly text: string }
  | { readonly kind: "param"; readonly name: string }
  | { readonly kind: "splat"; readonly name: string };

/** Grammar-shape rejections, each mirroring a registration guard. */
export type SegmentErrorCode =
  | "name-less" // #858 — a marker with no name
  | "trailing-marker" // #1324 — a param name ending in a bare `:`/`*`
  | "fused-marker" // #1050 — a marker glued after a static prefix
  | "optional-removed" // M1 — a `:x?`/`*x?` optional modifier (removed; two sibling routes)
  | "constraint-removed"; // M1 — a `<re>` constraint or stray `<`/`>` (removed; validate in a guard)

export interface SegmentError {
  readonly error: SegmentErrorCode;
}

const COLON = 58; // :
const STAR = 42; // *
const LT = 60; // <
const GT = 62; // >
const QUESTION = 63; // ?
const SLASH = 47; // /

const isMarker = (code: number): boolean => code === COLON || code === STAR;

/**
 * Splits a path into its `/`-delimited segments. A plain `/`-split (M1): the
 * 3-token grammar has no `<...>` constraint whose body could legally contain a
 * `/`, so no constraint-awareness is needed — a stray `<`/`>` is a
 * `constraint-removed` error, caught per segment by `parseSegment`. This is the
 * **segmentation** half of the path-grammar unification: `parseSegment` owns the
 * per-segment grammar, `splitPathSegments` owns where a segment begins and ends.
 *
 * @param path - a route path (query already stripped by the caller)
 * @returns the segments in order, including empty leading/trailing/`//` segments
 *   (the caller skips empties, matching the current behaviour)
 */
export function splitPathSegments(path: string): string[] {
  const segments: string[] = [];
  let start = 0;

  for (let i = 0; i < path.length; i += 1) {
    if (path.charCodeAt(i) !== SLASH) {
      continue;
    }

    segments.push(path.slice(start, i));
    start = i + 1;
  }

  segments.push(path.slice(start));

  return segments;
}

/**
 * Tokenizes a single path segment (already split on `/`).
 *
 * @param segment - one `/`-delimited segment of a route path
 * @returns the segment's tokens, or a typed grammar error
 */
export function parseSegment(segment: string): SegmentTokens | SegmentError {
  const length = segment.length;

  if (length === 0) {
    return { kind: "static", text: "" };
  }

  // ---- static segment (no leading marker) -------------------------------
  if (!isMarker(segment.charCodeAt(0))) {
    for (let i = 0; i < length; i += 1) {
      const code = segment.charCodeAt(i);

      // A `<`/`>` (a former `<re>` constraint or a stray delimiter) is no longer
      // grammar — M1 removed constraints. Reject with the constraint recipe.
      if (code === LT || code === GT) {
        return { error: "constraint-removed" };
      }

      // A marker glued after a static prefix is extracted as a param by build/meta
      // but compiled as a static literal by the trie (#1050) — reject it as fused.
      // A marker ENDING the segment (a static ending in `:`/`*` — `/a:`, `/a*`, F2)
      // is NOT fused: caught by `i + 1 < length` being false. Every other following
      // char is fused — including a `?` (`a:?`): that shape never reaches the
      // tokenizer through a real path (a `?` after a bare marker is not a valid
      // `:name?` form, so the query mask strips it before `/`-segmentation), so a
      // direct call correctly reports fused-marker. (`a<`/`a>` already returned
      // `constraint-removed` above, so no `<`-follows exception is needed here.)
      if (isMarker(code) && i + 1 < length) {
        return { error: "fused-marker" };
      }
    }

    // A trailing `?` is a former optional modifier; on a marker-less segment (no
    // param name) it is a modifier-with-no-name — name-less (#858/#1241, `/faq?`),
    // NOT `optional-removed` (there is no param to route to two siblings). The
    // backstop rejects it by the SAME rule: its `endsWith("?")` fork routes the
    // segment to `extractParamName` → this tokenizer. Owning the `?` here (not
    // only in the marker branch) is what lets the gate and backstop agree on it —
    // otherwise the gate reads `faq?` as a valid static (#1324 §4).
    if (segment.charCodeAt(length - 1) === QUESTION) {
      return { error: "name-less" };
    }

    return { kind: "static", text: segment };
  }

  const splat = segment.charCodeAt(0) === STAR;

  // ---- name: up to the first `<`/`>` (former constraint delimiter, reserved —
  // В1.3) or `?` (former optional). A segment holds no `/`. -----------------
  let cursor = 1;

  while (cursor < length) {
    const code = segment.charCodeAt(cursor);

    if (code === LT || code === GT || code === QUESTION) {
      break;
    }

    cursor += 1;
  }

  const name = segment.slice(1, cursor);

  if (name.length === 0) {
    return { error: "name-less" }; // #858
  }

  if (isMarker(name.charCodeAt(name.length - 1))) {
    return { error: "trailing-marker" }; // #1324
  }

  // ---- former constraint / optional modifiers (removed in M1) ------------
  // The name scan stops at the first `<`/`>` or `?`. Either is a form removed
  // in M1: a `<re>` constraint (also a stray `<`/`>` — В1.3), or a `:x?`/`*x?`
  // optional. Only `?` is the optional; `<`/`>` are the constraint recipe.
  // Reject with the matching replacement recipe rather than tokenize it.
  if (cursor < length) {
    return segment.charCodeAt(cursor) === QUESTION
      ? { error: "optional-removed" }
      : { error: "constraint-removed" }; // LT or GT
  }

  return splat ? { kind: "splat", name } : { kind: "param", name };
}

/**
 * Returns the first per-segment grammar error in a path, or `undefined` if every
 * segment tokenizes cleanly.
 *
 * The **validation-facing** entry over the tokenizer: `route-tree`'s
 * `validateRoutePath` calls this instead of re-running its own split+parse loop,
 * so the gate and the matcher's own grammar cannot drift (#1324) and the loop
 * stays single-sourced here — the tokenizer primitives (`parseSegment`,
 * `splitPathSegments`) need not leak into the package's public surface. An empty
 * segment tokenizes as `static` (never an error), so leading/trailing/`//`
 * empties are skipped naturally.
 *
 * @param path - a route path (query already stripped by the caller)
 * @returns the first `SegmentErrorCode` (scanned left to right), or `undefined`
 */
export function findSegmentGrammarError(
  path: string,
): SegmentErrorCode | undefined {
  for (const segment of splitPathSegments(path)) {
    const token = parseSegment(segment);

    if ("error" in token) {
      return token.error;
    }
  }

  return undefined;
}

/** A removed-form (M1) match, describing the offending segment and — for an
 * optional — the two sibling paths that replace it (path without the optional
 * segment + path with the param made required). The route-tree gate uses this to
 * build a route-contextual replacement recipe; the matcher backstop uses only the
 * error code (a shorter, path-free recipe). */
export type RemovedForm =
  | {
      readonly code: "optional-removed";
      readonly segment: string;
      readonly withoutSegment: string;
      readonly requiredForm: string;
    }
  | { readonly code: "constraint-removed"; readonly segment: string };

/**
 * The rich (route-tree gate) view over the tokenizer for a removed form: finds
 * the first `optional-removed` / `constraint-removed` segment and, for an
 * optional, computes its two replacement sibling paths from the ACTUAL path
 * (dropping the segment → without-form; dropping the trailing `?` → required
 * form). Returns `undefined` if no removed form is present (the gate then uses
 * `findSegmentGrammarError` for a surviving grammar rejection).
 *
 * @param path - a route path (query already stripped by the caller)
 */
export function describeRemovedForm(path: string): RemovedForm | undefined {
  const segments = splitPathSegments(path);

  for (let i = 0; i < segments.length; i += 1) {
    const token = parseSegment(segments[i]);

    if (!("error" in token)) {
      continue;
    }

    // First error wins (mirrors `findSegmentGrammarError`): describe it ONLY if
    // it is a removed form, else return undefined so the caller falls to the
    // surviving-code message — this keeps the gate's reason in lockstep with the
    // matcher backstop's first-error verdict.
    if (token.error === "optional-removed") {
      const segment = segments[i];
      const required = [...segments];

      // Drop the `?` optional modifier AND everything after it (the tokenizer
      // stopped the name at the first `?`, so it is the modifier). Using the `?`
      // index — not a blind `slice(0, -1)` — keeps the required sibling VALID for
      // a reverse/compound form whose `?` is not the last char: `:b?<x>` → `:b`
      // (not `:b?<x`), `:id??` → `:id` (not `:id?`). #1516
      required[i] = segment.slice(0, segment.indexOf("?"));

      return {
        code: "optional-removed",
        segment,
        withoutSegment: segments.filter((_, j) => j !== i).join("/"),
        requiredForm: required.join("/"),
      };
    }

    return token.error === "constraint-removed"
      ? { code: "constraint-removed", segment: segments[i] }
      : undefined;
  }

  return undefined;
}

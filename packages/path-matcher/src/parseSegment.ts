// packages/path-matcher/src/parseSegment.ts

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
 * typed error. Grammar (RFC §4):
 * 1. Leading `:`/`*` → param/splat; otherwise `static` (a marker glued *after* a
 *    static prefix ⇒ `fused-marker`; a `<...>` in a marker-less segment ⇒
 *    `constraint-in-static`).
 * 2. name = any char except `<`/`?` (no `/` remains inside a segment); a name
 *    ending in a bare `:`/`*` ⇒ `trailing-marker` (#1324). A *mid* marker stays
 *    a name char — `:a:b` → name `a:b`, preserved.
 * 3. empty name ⇒ `name-less` (#858).
 * 4. constraint = `<...>` after the name; unbalanced/`<>` ⇒ `unbalanced`/`empty`
 *    (#804); text after `>` other than a trailing `?` ⇒ `fused-constraint-suffix`
 *    (#1150).
 * 5. a trailing `?` ⇒ optional; on a splat ⇒ `optional-splat` (#1149).
 *
 * @module parseSegment
 */

/* eslint-disable unicorn/prefer-code-point, sonarjs/cognitive-complexity -- charCodeAt code-unit scan + a single inlined branchy pass are this RFC's char-scan perf basis (§9); the same deliberate choices as registration.ts hasNonAsciiSegment (#1285) and SegmentMatcher's inlined #traverseFrom (:550). Markers compared are ASCII (`:` `*` `<` `?`, < 0x80). */

/** A successfully tokenized segment. */
export type SegmentTokens =
  | { readonly kind: "static"; readonly text: string }
  | {
      readonly kind: "param";
      readonly name: string;
      readonly constraint?: string;
      readonly optional: boolean;
    }
  | { readonly kind: "splat"; readonly name: string };

/** Grammar-shape rejections, each mirroring an existing registration guard. */
export type SegmentErrorCode =
  | "name-less" // #858 — a marker with no name
  | "trailing-marker" // #1324 — a param name ending in a bare `:`/`*`
  | "fused-marker" // #1050 — a marker glued after a static prefix
  | "fused-constraint-suffix" // #1150 — static text after a constraint's `>`
  | "constraint-in-static" // #1311 — a `<...>` in a marker-less segment
  | "optional-splat" // #1149 — `*name?`
  | "unbalanced-constraint" // #804 — `<` with no matching `>`
  | "empty-constraint"; // #804 — `<>` (compiles to a never-matching `^()$`)

export interface SegmentError {
  readonly error: SegmentErrorCode;
}

const COLON = 58; // :
const STAR = 42; // *
const LT = 60; // <
const QUESTION = 63; // ?

const isMarker = (code: number): boolean => code === COLON || code === STAR;

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

      // A `<...>` in a marker-less segment reshapes the route (#1311).
      if (code === LT) {
        return { error: "constraint-in-static" };
      }

      // A marker glued after a static prefix is extracted as a param by
      // build/meta but compiled as a static literal by the trie (#1050). A bare
      // marker (no following name char) is the name-less path, not fused.
      if (isMarker(code) && i + 1 < length) {
        const next = segment.charCodeAt(i + 1);

        if (next !== LT && next !== QUESTION) {
          return { error: "fused-marker" };
        }
      }
    }

    return { kind: "static", text: segment };
  }

  const splat = segment.charCodeAt(0) === STAR;

  // ---- name: up to the first `<` or `?` (a segment holds no `/`) ---------
  let cursor = 1;

  while (cursor < length) {
    const code = segment.charCodeAt(cursor);

    if (code === LT || code === QUESTION) {
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

  // ---- constraint + optional --------------------------------------------
  let constraint: string | undefined;
  let optional = false;

  if (cursor < length) {
    if (segment.charCodeAt(cursor) === LT) {
      const close = segment.indexOf(">", cursor + 1);

      if (close === -1) {
        return { error: "unbalanced-constraint" }; // #804
      }

      if (close === cursor + 1) {
        return { error: "empty-constraint" }; // #804 — `<>`
      }

      constraint = segment.slice(cursor, close + 1);

      const after = close + 1;

      if (after < length) {
        // Only a trailing `?` may follow a constraint (matches the current
        // `(\?)?` capture); any other text is fused (#1150).
        if (segment.charCodeAt(after) === QUESTION) {
          optional = true;
        } else {
          return { error: "fused-constraint-suffix" };
        }
      }
    } else {
      // segment.charCodeAt(cursor) === QUESTION
      optional = true;
    }
  }

  if (splat) {
    if (optional) {
      return { error: "optional-splat" }; // #1149
    }

    return { kind: "splat", name };
  }

  return constraint === undefined
    ? { kind: "param", name, optional }
    : { kind: "param", name, constraint, optional };
}

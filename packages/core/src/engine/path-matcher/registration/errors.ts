// Registration error factories: every `throw*` helper the pipeline raises, plus the
// `throwSegmentGrammarError` code→message dispatcher (Реш.2-A). Pure leaf — each
// builds a message and throws; none reads trie state.

import type { SegmentErrorCode } from "../parseSegment";

/**
 * Guards against param-name aliasing in the segment trie (issue #736).
 *
 * A parametric (`:name`) or splat (`*name`) position in the trie is keyed by
 * **position**, not by name — but the captured value is written under the name
 * recorded on that position. When two *different* routes share a position under
 * *different* names (e.g. `/user/:id` and `/user/:slug/profile`),
 * first-registration wins the name, so the second route silently captures its
 * value under the wrong key. Through `rewritePathOnMatch` that silent key-swap
 * becomes a hard `start()` crash on a legitimate config — so we reject the
 * ambiguity loudly at registration instead of corrupting matches.
 *
 * The conflict is strictly **cross-route**. Under the 3-token grammar (M1, #1516)
 * insertion is a strict linear walk — a route never revisits a slot it created
 * (the former optional-omit fork, which could land two differently-named params
 * on one position within a single route, is gone). So any name mismatch at a
 * position is unconditionally a prior route's slot: `ensureParamChild` throws on
 * `name !== paramName` with no `ownNodes` exception.
 */
export function throwParamNameConflict(
  existingName: string,
  newName: string,
  marker: ":" | "*",
): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Parameter name conflict at the same path ` +
      `position: '${marker}${existingName}' and '${marker}${newName}'. A ` +
      `parametric URL segment binds to a single name across every route that ` +
      `shares that position — the value cannot be captured under two names. ` +
      `Rename one so both routes agree (e.g. use '${marker}${existingName}' in both).`,
  );
}

/**
 * A bare marker (`:` or `*` with no name) compiles to a phantom empty-named
 * slot: match captures the value under `""`, buildPath emits the literal marker,
 * and buildParamMeta reports no param at all — a three-way match/build/meta
 * desync of the same class as #736/#738 (#858). Reject it at registration,
 * symmetrically for both markers, instead of corrupting the trie.
 */
export function throwEmptyParamName(): never {
  // Marker-agnostic: this fires for a bare ':'/'*' (`/x/:`, `/x/*`), a marker
  // carrying only a modifier char with no name (`/x/:?`, `/x/:<...>`), AND a
  // static segment with a trailing '?' (`/faq?`) — all routed here via
  // `extractParamName`. So the message must NOT claim a specific ':' marker
  // (there isn't one for `/faq?`, #1241).
  throw new Error(
    `[SegmentMatcher.registerTree] Empty parameter name: a parameter marker ` +
      `(':' or '*') must be followed by a name (e.g. ':id', '*rest'). A name-less ` +
      `marker, or a trailing '?' with no parameter name, would capture under an ` +
      `empty key at match but emit a literal at build — the two disagree, so it ` +
      `is rejected.`,
  );
}

/**
 * Rejects a `:`/`*` marker fused to a static prefix within a segment (`a:b`,
 * `x:id`, `a*b`): the build/meta param regexes are unanchored and extract it as
 * a param, but this trie honors a marker only at segment start and compiles the
 * segment as a static literal — so `buildPath` emits an unmatchable URL while
 * `match` rejects it (#1050). The sibling of {@link throwEmptyParamName} (#858):
 * an ambiguous marker placement the three parsers cannot agree on. route-tree's
 * validation gate catches this first with a route-contextual error; this is the
 * standalone registration backstop.
 */
function throwFusedMarker(segment: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Fused parameter marker in segment "${segment}": ` +
      `a ':'/'*' marker must begin a segment (e.g. 'a/:b', not 'a:b'). build extracts ` +
      `it as a param while the trie treats the segment as a literal — the two disagree.`,
  );
}

/**
 * Rejects a param name ending in a bare marker (`:y*`, `:y:`, #1324): the
 * build/meta name class (`[^/?<]+`) greedily swallows the trailing `:`/`*` into
 * the name (`y*`) while the route-tree gate reads it as a name-less marker and
 * rejects — a real gate↔backstop divergence (formerly excluded from the parity
 * property, gate-masked in production). `parseSegment` ends the name before a
 * trailing marker, so this backstop now agrees with the gate. The sibling of
 * {@link throwEmptyParamName} (#858) / {@link throwFusedMarker} (#1050) on the
 * trailing-marker axis.
 */
function throwTrailingMarker(segment: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Trailing parameter marker in segment "${segment}": ` +
      `a param name cannot end in a bare ':' or '*' (e.g. ':y*' — the name is 'y' plus a ` +
      `stray marker). build/meta would capture the marker into the name while the gate ` +
      `rejects it as name-less — the two disagree, so it is rejected.`,
  );
}

/**
 * `optional-removed` (M1): a `:x?`/`*x?` optional modifier. The backstop tier —
 * a short, path-free recipe (the route-tree gate's rich tier computes the two
 * concrete sibling paths). Optional params were dropped for zero corpus use +
 * the axis's largest bug cluster; the hierarchy already expresses optionality.
 */
function throwOptionalRemoved(segment: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Optional params are not supported: "${segment}" — ` +
      `declare two sibling routes instead (one with the segment, one without). ` +
      `The route hierarchy already expresses optionality.`,
  );
}

/**
 * `constraint-removed` (M1): a `<re>` constraint or a stray `<`/`>`. The backstop
 * tier — a short recipe (the gate's rich tier names the offending segment). Regex
 * constraints were dropped; validate the value in a guard instead.
 */
function throwConstraintRemoved(segment: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Regex constraints are not supported: "<"/">" are ` +
      `reserved in path segments ("${segment}"). Match the segment as a plain ` +
      `string and validate the value in a guard (canActivate) or app code.`,
  );
}

export function throwNonAsciiStatic(segment: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Non-ASCII static segment "${segment}": match ` +
      `rejects non-ASCII input and compares static keys raw, so this route would ` +
      `never match. Percent-encode it (e.g. "/caf%C3%A9") or use a param.`,
  );
}

/**
 * Dispatches a `parseSegment` grammar-error code (the per-segment backstop) to the
 * matching matcher-level throw — the single place mapping the tokenizer's verdict
 * onto the message, so the reject reason stays byte-identical per code. The two
 * removed-form codes (M1) route to their short recipe throws; the route-tree gate
 * catches the same forms first with its richer route-contextual recipe.
 */
export function throwSegmentGrammarError(
  code: SegmentErrorCode,
  segment: string,
): never {
  switch (code) {
    case "name-less": {
      return throwEmptyParamName();
    }
    case "trailing-marker": {
      return throwTrailingMarker(segment);
    }
    case "fused-marker": {
      return throwFusedMarker(segment);
    }
    case "optional-removed": {
      return throwOptionalRemoved(segment);
    }
    case "constraint-removed": {
      return throwConstraintRemoved(segment);
    }
  }
}

export function throwDuplicateParamName(
  routeName: string,
  names: readonly string[],
): never {
  const seen = new Set<string>();
  let duplicate = "";

  for (const name of names) {
    if (seen.has(name)) {
      duplicate = name;

      break;
    }

    seen.add(name);
  }

  throw new Error(
    `[SegmentMatcher.registerTree] Duplicate parameter name ':${duplicate}' in ` +
      `route "${routeName}": a param name must be unique within a route — two ` +
      `positions cannot both bind ':${duplicate}' (the second silently overwrites ` +
      `the first). Rename one.`,
  );
}

export function throwInvalidQueryParamName(
  routeName: string,
  name: string,
): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Invalid query-param declaration "${name}" in ` +
      `route "${routeName}": a query-param name cannot contain '<' or '>' — it would ` +
      `never round-trip. Rename the query param.`,
  );
}

export function throwDuplicateRoutePath(
  existingName: string,
  newName: string,
): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Duplicate route path: routes "${existingName}" ` +
      `and "${newName}" resolve to the same URL. The later registration would ` +
      `silently shadow the earlier (its deep link would resolve to the other ` +
      `route). Give them distinct paths.`,
  );
}

export function throwSlashChildUnderDynamicParent(
  routeName: string,
  parentPath: string,
): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Index route "${routeName}" (path "/") under the ` +
      `splat parent "${parentPath}" is not supported: the index sits on the splat ` +
      `node, which the wildcard match never reaches, so it is unreachable. Give the ` +
      `index a distinct path, or make the parent static.`,
  );
}

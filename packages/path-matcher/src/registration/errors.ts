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
 * The conflict is strictly **cross-route**. A single route may legitimately land
 * two differently-named params on the same trie position via the optional-omit
 * branch — e.g. `/a/:b?/:c?/d` or `/a/:b?/:c/d`, where omitting `:b?` lets the
 * next param occupy `:b?`'s slot. That intra-route aliasing is the established,
 * tested semantics (first optional wins the slot), not a bug. We tell the two
 * apart with `ownNodes`: the set of nodes whose param/splat child was *created
 * during the current route's insertion*. A differing name on a node in that set
 * is the same route revisiting its own slot (keep-first); on any other node it
 * is a prior route's slot (throw).
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
  // carrying only a modifier/constraint (`/x/:?`, `/x/:<\d+>`), AND a static
  // segment with a trailing '?' (`/faq?`) — which the optional fork routes here
  // via `extractParamName`. So the message must NOT claim a specific ':' marker
  // (there isn't one for `/faq?`, #1241).
  throw new Error(
    `[SegmentMatcher.registerTree] Empty parameter name: a parameter marker ` +
      `(':' or '*') or an optional '?' must be followed by a name (e.g. ':id', ` +
      `'*rest', ':id?'). A name-less marker or modifier would capture under an ` +
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

export function throwMultipleOptionalsBeforeSplat(path: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Two optional params directly before a splat in ` +
      `"${path}": a single trie slot carries only one optional→splat fork, so the ` +
      `outer optional would overwrite the inner and the omit-outer/take-inner form ` +
      `would silently reshape into the splat. Split into separate routes, or drop the ` +
      `'?' on one.`,
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
 * Rejects an optional splat (`*name?`): `buildParamMeta`/`compileBuildParts`
 * classify it as a splat (multi-segment, splat encoder preserves "/"), but the
 * optional fork would compile a plain param node that eats a single segment — a
 * three-way match/build/meta desync (`buildPath` emits multi-segment URLs `match`
 * rejects). The shape only "worked" for 0–1 segments, so rejecting loses nothing
 * real. The sibling of {@link throwEmptyParamName} (#858) / {@link throwFusedMarker}
 * (#1050). route-tree's validation gate catches this first with a route-contextual
 * error; this is the standalone registration backstop. (#1149)
 */
function throwOptionalSplat(segment: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Optional splat "${segment}" is not supported: ` +
      `a splat cannot be optional — build emits multi-segment URLs the matcher ` +
      `rejects. Use a required splat "*name".`,
  );
}

/**
 * Rejects an UNCONSTRAINED optional param directly before a splat (`/:v?/*rest`,
 * #1264, product decision). Without a constraint there is no validity signal to
 * disambiguate "take the optional" from "let the splat capture", so every
 * multi-segment value has two readings and `match` would silently reshape half the
 * input space — a wrong-name in new clothing, worse than the loud UNMATCH it had.
 * A CONSTRAINED optional→splat (`:v<c>?/*rest`) IS supported (A1). Sibling of the
 * optional-splat (#1149) / fused (#1050) rejections; route-tree's gate catches it
 * first with a route-contextual error.
 */
export function throwUnconstrainedOptionalSplat(paramName: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Optional param ":${paramName}?" before a splat ` +
      `must be constrained: an unconstrained optional before a splat is ambiguous ` +
      `(every multi-segment value has two readings). Add a constraint, e.g. ` +
      `":${paramName}<[a-z]+>?", or model it as two routes.`,
  );
}

/**
 * An unbalanced `<`/`>` desyncs match vs build: the name is truncated at the
 * stray `<`, the unclosed constraint survives as a literal in the trie path, and
 * `buildPath` emits a URL its own `match` rejects (#804 — the residual gap #749
 * only closed on the plugin path; this is the bare-core backstop). Sibling of
 * {@link throwEmptyParamName} (#858) / {@link throwFusedMarker} (#1050).
 */
export function throwUnbalancedConstraint(path: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Unbalanced constraint delimiter ('<' or '>') ` +
      `in path "${path}": every '<' must be closed by a '>'. A stray delimiter ` +
      `desyncs match vs build (buildPath would emit a URL match rejects).`,
  );
}

/**
 * An empty constraint `<>` compiles to `^()$`, which matches only the empty
 * string — a never-matching required param. Rejected loudly instead of silently
 * producing a dead route (#804 §3.3). Sibling of the name-less rejection (#858).
 */
function throwEmptyConstraint(path: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Empty constraint '<>' in path "${path}": ` +
      `a constraint body must be non-empty (e.g. '<[0-9]+>'). An empty '<>' ` +
      `compiles to a never-matching pattern.`,
  );
}

function throwFusedConstraintSuffix(path: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Text fused to a constraint '>' in path "${path}": ` +
      `a '<...>' constraint must end its segment or be followed by '/' or an ` +
      `optional '?' — use "/:id<...>/rest", not "/:id<...>rest".`,
  );
}

function throwConstraintInStaticSegment(path: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Constraint '<...>' in a static segment in path "${path}": ` +
      `a '<...>' constraint must follow a parameter marker (':' or '*') — a static ` +
      `segment carrying '<...>' is silently stripped. Attach it to a param ` +
      `(e.g. "/:id<...>") or drop it.`,
  );
}

/**
 * Dispatches a `parseSegment` grammar-error code (the per-segment backstop, Реш.2)
 * to the matching matcher-level throw — the single place mapping the tokenizer's
 * verdict onto the existing messages, so the reject reason stays byte-identical per
 * code. `unbalanced-constraint` is unreachable (`isConstraintBalanced` rejects a
 * stray delimiter first); kept for `SegmentErrorCode` exhaustiveness.
 */
export function throwSegmentGrammarError(
  code: SegmentErrorCode,
  segment: string,
  path: string,
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
    case "optional-splat": {
      return throwOptionalSplat(segment);
    }
    case "empty-constraint": {
      return throwEmptyConstraint(path);
    }
    case "fused-constraint-suffix": {
      return throwFusedConstraintSuffix(path);
    }
    case "constraint-in-static": {
      return throwConstraintInStaticSegment(path);
    }
    /* v8 ignore start -- unreachable: isConstraintBalanced rejects a stray '<'/'>' before this runs */
    case "unbalanced-constraint": {
      return throwUnbalancedConstraint(path);
    }
    /* v8 ignore stop */
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
      `route "${routeName}": a query-param name cannot contain '<' or '>'. This is a ` +
      `reverse-order modifier typo that leaked a constraint into the query — put the ` +
      `optional '?' AFTER the constraint (':id<...>?', not ':id?<...>'). It would ` +
      `never round-trip.`,
  );
}

export function throwPathQueryNameCollision(
  routeName: string,
  name: string,
): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Name collision in route "${routeName}": "${name}" ` +
      `is declared as BOTH a path param (':${name}') and a query param ('?${name}'). ` +
      `buildPath would emit its value twice (once in the path, once in the query). ` +
      `Rename one.`,
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
      `dynamic parent "${parentPath}" is not supported: the index cannot reliably ` +
      `replace the parent on every form of its path — under an optional param it ` +
      `binds only the present form, under a splat it is unreachable. Give the index ` +
      `a distinct path, or make the parent static.`,
  );
}

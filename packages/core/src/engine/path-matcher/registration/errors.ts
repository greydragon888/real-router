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
      `position: '${marker}${existingName}' and '${marker}${newName}'. One ` +
      `position binds one name across every route that shares it. Rename one — ` +
      `e.g. use '${marker}${existingName}' in both.`,
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
  // static segment with a trailing '?' (`/faq?`) — all routed here from
  // `processSegment`'s error backstop (#1998). So the message names both shapes
  // and pins neither to a specific marker — there is none for `/faq?` (#1241).
  throw new Error(
    `[SegmentMatcher.registerTree] Empty parameter name: a ':'/'*' marker must ` +
      `be followed by a name (e.g. ':id', '*rest'), and a segment cannot end in ` +
      `a bare '?'.`,
  );
}

/**
 * Rejects a `:`/`*` marker fused to a static prefix within a segment (`a:b`,
 * `x:id`, `a*b`, #1050). A marker is honoured only at segment start, so the
 * fused spelling has no reading `parseSegment` will give it.
 *
 * The route-tree gate catches this first with a route-contextual error; this is
 * the standalone registration backstop.
 */
function throwFusedMarker(segment: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Fused parameter marker in segment "${segment}": ` +
      `a ':'/'*' marker must begin a segment — write 'a/:b', not 'a:b'.`,
  );
}

/**
 * Rejects a param name ending in a bare marker (`:y*`, `:y:`, #1324). Gate and
 * backstop read the same `parseSegment`, which ends the name before a trailing
 * marker, so neither can admit a spelling the other refuses.
 *
 * The sibling of {@link throwEmptyParamName} (#858) / {@link throwFusedMarker}
 * (#1050) on the trailing-marker axis.
 */
function throwTrailingMarker(segment: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Trailing parameter marker in segment "${segment}": ` +
      `a param name cannot end in a bare ':' or '*'. Drop the stray marker.`,
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
      `declare two sibling routes instead, one with the segment and one without.`,
  );
}

/**
 * `constraint-removed` (M1): a `<re>` constraint or a stray `<`/`>`. The backstop
 * tier — a short recipe (the gate's rich tier names the offending segment). Regex
 * constraints were dropped; validate the value in a guard instead.
 */
function throwConstraintRemoved(segment: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Regex constraints are not supported: '<' and ` +
      `'>' are reserved in path segments ("${segment}"). Match it as a plain ` +
      `string and validate the value in a canActivate guard.`,
  );
}

export function throwNonAsciiStatic(segment: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Non-ASCII static segment "${segment}": match ` +
      `compares static keys raw and rejects non-ASCII input, so this route can ` +
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

  // ⚠ No ':' prefix: the caller counts params AND splats, so a `/:x/*x` clash
  // arrives here with one position spelled `*x` (#1151).
  throw new Error(
    `[SegmentMatcher.registerTree] Duplicate parameter name '${duplicate}' in ` +
      `route "${routeName}": a name must be unique within a route — the second ` +
      `position overwrites the first. Rename one.`,
  );
}

export function throwInvalidQueryParamName(
  routeName: string,
  name: string,
): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Invalid query-param declaration "${name}" in ` +
      `route "${routeName}": a query-param name cannot contain '<' or '>'. ` +
      `Rename it.`,
  );
}

/**
 * A `//` inside a declared path (#2010).
 *
 * ⚑ Same family as {@link throwNonAsciiStatic}: the route registers, `buildPath`
 * prints the path it was declared with, and the matcher then refuses to match
 * it — a dead route. Refused here rather than in the route-tree gate, which is
 * plugin-only and whose reject recipes deliberately stay out of the main chunk
 * (#1526).
 */
export function throwDoubleSlashInPath(path: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Double slashes are not allowed in path ` +
      `"${path}": the route would build a URL its own matcher refuses. ` +
      `Remove the empty segment.`,
  );
}

export function throwDuplicateRoutePath(
  existingName: string,
  newName: string,
): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Duplicate route path: routes "${existingName}" ` +
      `and "${newName}" resolve to the same URL — the later would shadow the ` +
      `earlier. Give them distinct paths.`,
  );
}

/**
 * ⚠ SPLAT parents only. An index under a `:param` parent is legal and registers
 * — the name says `Splat` because the rule does.
 */
export function throwIndexUnderSplatParent(
  routeName: string,
  parentPath: string,
): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Index route "${routeName}" (path "/") under the ` +
      `splat parent "${parentPath}" is unreachable: the wildcard match never ` +
      `reaches the index node. Give the index a distinct path, or make the ` +
      `parent static.`,
  );
}

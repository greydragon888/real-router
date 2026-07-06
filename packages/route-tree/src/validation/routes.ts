// packages/route-node/modules/validation/routes.ts

import {
  buildParamMeta,
  isConstraintBalanced,
  PARAM_NAME_PATTERN,
} from "path-matcher";

import type { RouteTree } from "../types";

/**
 * Creates a TypeError with consistent router error message format.
 *
 * @param methodName - Name of the method that triggered the error
 * @param message - Error message
 * @returns TypeError with formatted message
 * @internal
 */
function createRouterError(methodName: string, message: string): TypeError {
  return new TypeError(`[router.${methodName}] ${message}`);
}

/**
 * Validates constraint-delimiter `<...>` syntax: delimiters must be balanced
 * (#749) and the body non-empty (#804). An unbalanced `<`/`>` truncates the
 * param name and leaves the constraint as a trie literal (`buildPath` then
 * throws `Missing required param`); an empty `<>` compiles to a never-matching
 * `^()$`. `isConstraintBalanced` is path-matcher's single balance predicate,
 * which also backstops both at `registerTree` — this gate adds the
 * route-contextual message. Extracted so `validateRoutePath` stays within the
 * cognitive-complexity budget.
 */
function validateConstraintSyntax(
  path: string,
  routeName: string,
  methodName: string,
): void {
  if (!isConstraintBalanced(path)) {
    throw createRouterError(
      methodName,
      `Invalid path for route "${routeName}": unbalanced constraint delimiter ('<' or '>') in "${path}"`,
    );
  }

  if (path.includes("<>")) {
    throw createRouterError(
      methodName,
      `Invalid path for route "${routeName}": empty constraint '<>' in "${path}" (a constraint body must be non-empty, e.g. '<[0-9]+>')`,
    );
  }
}

/**
 * Rejects a param name repeated within one route's own path (`/:id/:id`, a
 * param+splat clash `/:x/*x`, #1151). `buildParamMeta.urlParams` lists every
 * path-binding name — params AND splats — in order, keeping duplicates (`/:x/*x`
 * → `["x", "x"]`), so a single pass over it catches both. The trie binds the
 * duplicates at different positions under one name, so match's later capture
 * silently overwrites the earlier and `rewritePathOnMatch` then rewrites the
 * user's URL from the single survivor. The #736 conflict guard only fires on
 * DIFFERENTLY-named params at one position, so this same-name case slips through.
 * path-matcher's `registerTree` backstop additionally catches CROSS-level dups (a
 * parent's param reused by a child), which this per-path gate cannot see.
 * Extracted so `validateRoutePath` stays within the cognitive-complexity budget.
 */
function validateUniqueParamNames(
  urlParams: readonly string[],
  routeName: string,
  methodName: string,
  path: string,
): void {
  const seen = new Set<string>();

  for (const name of urlParams) {
    if (seen.has(name)) {
      throw createRouterError(
        methodName,
        `Invalid path for route "${routeName}": duplicate parameter name ':${name}' in "${path}" (a param name must be unique within a route — the second binding would overwrite the first)`,
      );
    }

    seen.add(name);
  }
}

const INVALID_QUERY_NAME_RGX = /[<>]/u;

/**
 * #1242 §5.1/§5.3: rejects a malformed query-param declaration — a query name
 * carrying `<`/`>` (a constraint leaked in via a reverse-order modifier typo
 * `:id?<c>`), or one that collides with a path-param name (`/a/:tab?tab`, where
 * buildPath emits the value twice). Narrow to `<>`: a `=` in the declaration
 * (`?tab=1`, §5.2) is tolerated today and left as a separate call. path-matcher's
 * `registerTree` backstops both; this gate adds the route-contextual message.
 */
function validateQueryParamDeclarations(
  urlParams: readonly string[],
  queryParams: readonly string[],
  routeName: string,
  methodName: string,
  path: string,
): void {
  const urlParamSet = new Set(urlParams);

  for (const name of queryParams) {
    if (INVALID_QUERY_NAME_RGX.test(name)) {
      throw createRouterError(
        methodName,
        `Invalid path for route "${routeName}": invalid query-param name "${name}" in "${path}" (a query-param name cannot contain '<' or '>' — a reverse-order modifier typo that leaked a constraint into the query; put the optional '?' after the constraint, ':id<...>?')`,
      );
    }

    if (urlParamSet.has(name)) {
      throw createRouterError(
        methodName,
        `Invalid path for route "${routeName}": "${name}" is declared as both a path param and a query param in "${path}" — buildPath would emit its value twice (rename one)`,
      );
    }
  }
}

/**
 * Matches a `:`/`*` marker NOT followed by a valid param-name char — a name-less
 * marker (`:`, `*`, `:?`, `:<\d+>`). Derived from the single `PARAM_NAME_PATTERN`
 * grammar (#738) so this validation gate can never drift from the matcher's own
 * grammar: `[:*]` then a negative lookahead for the name class. path-matcher
 * rejects name-less markers at `registerTree` (#858); this catches them earlier,
 * at the validation layer, with a route-contextual error (#863).
 */
const EMPTY_PARAM_MARKER_RGX = new RegExp(`[:*](?!${PARAM_NAME_PATTERN})`);

/**
 * Reports whether a path fuses a `:`/`*` marker to a static prefix WITHIN a
 * segment (`/a:b`, `/users/x:id`, `/a*b`). build/meta's unanchored param regex
 * extracts such a marker as a param, but the trie honors a marker only at
 * segment start and compiles the whole segment as a static literal — so the
 * route's build and match shapes drift and `buildPath` emits a URL its own
 * `match` rejects (#1050). The sibling of the name-less rejection (#858/#863):
 * an ambiguous marker placement the three parsers cannot agree on.
 *
 * A single linear scan, NOT a regex on a `<...>`-stripped string (the strip is
 * the incomplete-tag-sanitizer pattern CodeQL flags — see `isConstraintBalanced`
 * for the same reasoning). A marker counts as fused only when its segment did
 * NOT start with a marker: a marker-led segment's name and `<...>` constraint may
 * themselves contain `:`/`*` (`/:a:b` is the param `a:b`; `/:id<\d*>` a valid
 * quantifier), whereas a `<...>` in a static-led segment is malformed and a
 * marker inside it still drifts build-vs-trie, so it is (correctly) flagged —
 * matching the path-matcher backstop, which tests the raw static segment. Runs
 * AFTER the name-less check, so any marker reaching here is name-bearing.
 */
function hasFusedMidSegmentMarker(path: string): boolean {
  let atSegmentStart = true;
  let segmentStartedWithMarker = false;

  for (const char of path) {
    if (char === "/") {
      atSegmentStart = true;
    } else if (atSegmentStart) {
      segmentStartedWithMarker = char === ":" || char === "*";
      atSegmentStart = false;
    } else if ((char === ":" || char === "*") && !segmentStartedWithMarker) {
      return true;
    }
  }

  return false;
}

/**
 * Reports whether a path fuses static text (or a second marker) to a constraint's
 * closing `>` within a segment (`/:year<\d+>-archive`, `/:id<\d+>.html`, #1150).
 * Meta terminates the param name at `<` (name `year`), but the build side strips
 * `<…>` then re-extracts the name greedily (name `year-archive`) — build name ≠
 * meta name, so the route compiles to a silent dead route (`buildPath` throws
 * `Missing required param`, `match` keys the constraint on a phantom name). The
 * mirror of #1050 on the OTHER side of the param: a static SUFFIX after the
 * constraint, not a static PREFIX before the marker.
 *
 * Runs AFTER `validateConstraintSyntax`, so `isConstraintBalanced` already
 * guarantees every `>` is a constraint closer: a `>` NOT followed by a segment
 * boundary (`/`), an optional/query `?`, or end-of-input is a fused suffix. A
 * linear scan (constraints may contain `/`), same convention as the siblings.
 */
function hasFusedConstraintSuffix(path: string): boolean {
  for (let i = 0; i < path.length; i++) {
    if (path[i] !== ">") {
      continue;
    }

    // `charAt` yields "" past the end — a constraint ending the path is not fused.
    const next = path.charAt(i + 1);

    if (next !== "" && next !== "/" && next !== "?") {
      return true;
    }
  }

  return false;
}

/**
 * Reports whether a path has a raw non-ASCII code point (≥ U+0080) in a STATIC
 * segment (`/café`, `/меню`, #1154). match rejects any non-ASCII input byte
 * (`#scanPath`) and compares static trie keys raw, so such a route registers but
 * is unmatchable — `buildPath` emits `/café`, which its own `match` rejects. Only
 * static text is flagged: a marker-led segment (`:café`, a non-ASCII param NAME)
 * and a constraint body (`:id<[а-я]+>`, matched against the DECODED value) are
 * skipped. A `for…of` code-point scan tracking segment start + constraint depth
 * (constraints may contain `/`, so no split).
 */
function hasNonAsciiStatic(path: string): boolean {
  let atSegmentStart = true;
  let segmentIsMarker = false;
  let inConstraint = false;

  for (const char of path) {
    if (inConstraint) {
      inConstraint = char !== ">";

      continue;
    }

    if (char === "<") {
      inConstraint = true;

      continue;
    }

    if (char === "/") {
      atSegmentStart = true;

      continue;
    }

    if (atSegmentStart) {
      segmentIsMarker = char === ":" || char === "*";
      atSegmentStart = false;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- non-empty code point from for-of
    if (!segmentIsMarker && char.codePointAt(0)! >= 0x80) {
      return true;
    }
  }

  return false;
}

/**
 * Reports whether a path contains an optional splat `*name?` — a segment that
 * both starts with `*` (splat) and carries the optional `?`. `buildParamMeta`/
 * build classify it as a splat (multi-segment, `/`-preserving encoder) but the
 * trie's optional fork compiles a single-segment plain param, so `buildPath`
 * emits multi-segment URLs its own `match` rejects. Rejected (product decision,
 * #1149); path-matcher backstops at `registerTree`.
 *
 * A linear scan, not a regex — matches the `hasFusedMidSegmentMarker` /
 * `isConstraintBalanced` convention (and dodges a `sonarjs/super-linear-regex`
 * false positive on the char-class-then-`?` form). Runs on the query-stripped
 * `pathPattern`, so a required splat followed by a query (`*path?download`) is
 * NOT flagged. A splat name cannot contain `?` (`PARAM_NAME_PATTERN` excludes
 * it), so a `?` anywhere in a `*`-led segment is unambiguously the optional
 * marker. Sibling of the fused (#1050) / name-less (#863) marker rejections.
 */
function hasOptionalSplat(path: string): boolean {
  let atSegmentStart = true;
  let splatSegment = false;

  for (const char of path) {
    if (char === "/") {
      atSegmentStart = true;
      splatSegment = false;
    } else if (atSegmentStart) {
      splatSegment = char === "*";
      atSegmentStart = false;
    } else if (char === "?" && splatSegment) {
      return true;
    }
  }

  return false;
}

/**
 * Reports whether a path has an UNCONSTRAINED optional param directly before a
 * splat (`/:v?/*rest`, #1264). Without a constraint there is no validity signal to
 * disambiguate "take the optional" from "let the splat capture" — every
 * multi-segment value has two readings, so support would silently reshape half the
 * input space. Rejected with a hint (product decision); a CONSTRAINED
 * optional→splat (`/:v<c>?/*rest`) IS supported. path-matcher backstops at
 * `registerTree`; this gate adds the route-contextual message.
 *
 * A linear scan (same convention as `hasOptionalSplat`; constraints may contain
 * `/`, so no split/regex): an optional marker `?` whose preceding char is NOT `>`
 * (a constrained optional ends `<…>?`) and which is immediately followed by `/*`.
 * A `?` inside a constraint (`<\d?>`) is followed by `>`, not `/*`, so it is not
 * flagged.
 */
function hasUnconstrainedOptionalBeforeSplat(path: string): boolean {
  for (let i = 1; i < path.length; i++) {
    if (
      path[i] === "?" &&
      path[i - 1] !== ">" &&
      path[i + 1] === "/" &&
      path[i + 2] === "*"
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Validates route path format.
 * Throws a descriptive error if validation fails.
 *
 * Allows:
 * - Empty string (for grouping/root routes)
 * - Absolute paths: /path, ~path
 * - Query strings: ?query
 * - Relative segments: segment
 *
 * Prevents:
 * - Non-string values
 * - Double slashes (//)
 * - Absolute paths (~) under parameterized parent nodes
 *
 * @param path - Route path to validate
 * @param routeName - Name of route (for error messages)
 * @param methodName - Name of calling method for error messages
 * @param parentNode - Optional parent node for context validation
 * @throws {TypeError} If path is invalid
 *
 * @example
 * // Valid paths
 * validateRoutePath("", "home", "add");              // ok (empty for grouping)
 * validateRoutePath("/users", "users", "add");       // ok (absolute)
 * validateRoutePath("~dashboard", "dash", "add");    // ok (absolute, if no parameterized parent)
 * validateRoutePath("?tab=1", "home", "add");        // ok (query)
 * validateRoutePath("profile", "users.profile", "add"); // ok (relative)
 *
 * @example
 * // Invalid paths (throws)
 * validateRoutePath("/users//list", "users.list", "add");           // throws (double slash)
 * validateRoutePath("~dash", "dash", "add", paramParent);           // throws (~ under parameterized parent)
 */
// A format-validation gate: a flat sequence of INDEPENDENT guard clauses (type,
// whitespace, format, double-slash, constraint syntax, name-less / fused /
// optional-splat / unconstrained-opt-before-splat markers, absolute-under-param).
// Each is a simple early throw; extracting them would only scatter one checklist.
// eslint-disable-next-line sonarjs/cognitive-complexity -- linear guard sequence (see above)
export function validateRoutePath(
  path: unknown,
  routeName: string,
  methodName: string,
  parentNode?: RouteTree,
): asserts path is string {
  // Type check
  if (typeof path !== "string") {
    // Get type description for error message
    let typeDesc: string;

    if (path === null) {
      typeDesc = "null";
    } else if (Array.isArray(path)) {
      typeDesc = "array";
    } else {
      typeDesc = typeof path;
    }

    throw createRouterError(
      methodName,
      `Route path must be a string, got ${typeDesc}`,
    );
  }

  // Empty path is valid (for grouping/root)
  if (path === "") {
    return;
  }

  // No whitespace characters (spaces, tabs, newlines)
  if (/\s/.test(path)) {
    throw createRouterError(
      methodName,
      `Invalid path for route "${routeName}": whitespace not allowed in "${path}"`,
    );
  }

  // Valid path pattern
  if (!/^([/?~]|[^/]+$)/.test(path)) {
    throw createRouterError(
      methodName,
      `Route "${routeName}" has invalid path format: "${path}". Path should start with '/', '~', '?' or be a relative segment.`,
    );
  }

  // No double slashes
  if (path.includes("//")) {
    throw createRouterError(
      methodName,
      `Invalid path for route "${routeName}": double slashes not allowed in "${path}"`,
    );
  }

  // Constraint delimiter syntax: balanced (#749) and non-empty (#804). Both
  // desync match vs build downstream; path-matcher backstops them at
  // `registerTree`. Extracted to a helper to keep this function within the
  // cognitive-complexity budget.
  validateConstraintSyntax(path, routeName, methodName);

  // Both marker checks below scan only the URL-path portion: `buildParamMeta`
  // strips the query the same way the trie does, so a `:`/`*` inside a query
  // declaration is not falsely flagged.
  const { pathPattern, urlParams, queryParams } = buildParamMeta(path);

  // Duplicate param name within this route's own path (`/:id/:id`, `/:x/*x`, #1151).
  validateUniqueParamNames(urlParams, routeName, methodName, path);

  // Malformed query-param declarations (#1242 §5.1/§5.2/§5.3): a query name with
  // `<>=&?#/`, or one that collides with a path-param name.
  validateQueryParamDeclarations(
    urlParams,
    queryParams,
    routeName,
    methodName,
    path,
  );

  // Name-less parameter marker. A `:`/`*` with no following name passes every
  // format check above, but path-matcher rejects it at `registerTree` (#858) with
  // a non-route-contextual error. Reject it here at the gate too (#863).
  if (EMPTY_PARAM_MARKER_RGX.test(pathPattern)) {
    throw createRouterError(
      methodName,
      `Invalid path for route "${routeName}": parameter marker (':' or '*') without a name in "${path}"`,
    );
  }

  // Fused mid-segment marker. A `:`/`*` after a static prefix WITHIN a segment
  // passes the name-less check above (it HAS a name), but build/meta extract it
  // as a param while the trie compiles the segment as a literal — so `buildPath`
  // emits a URL its own `match` rejects. Reject it here at the gate (path-matcher
  // backstops at `registerTree`), the sibling of #863 (#1050).
  if (hasFusedMidSegmentMarker(pathPattern)) {
    throw createRouterError(
      methodName,
      `Invalid path for route "${routeName}": parameter marker (':' or '*') must begin a segment, but "${path}" fuses one to a static prefix (use a boundary marker like "/a/:b")`,
    );
  }

  // Static text fused to a constraint's closing '>' (`/:year<\d+>-archive`, #1150).
  // Meta ends the name at '<' but build strips '<…>' and re-extracts the name
  // greedily, fusing the suffix — build name ≠ meta name ⇒ a silent dead route.
  // Reject at the gate (path-matcher backstops at `registerTree`), the mirror of
  // #1050 on the other side of the param.
  if (hasFusedConstraintSuffix(pathPattern)) {
    throw createRouterError(
      methodName,
      `Invalid path for route "${routeName}": text fused to a constraint '>' in "${path}" (a '<...>' must end its segment or be followed by '/' or an optional '?' — use "/:id<...>/rest", not "/:id<...>rest")`,
    );
  }

  // Optional splat `*name?`. build treats it as a multi-segment splat but the
  // trie's optional fork compiles a single-segment plain param — so `buildPath`
  // emits a URL its own `match` rejects. Reject at the gate (path-matcher
  // backstops at `registerTree`), the sibling of #1050/#863 (#1149).
  if (hasOptionalSplat(pathPattern)) {
    throw createRouterError(
      methodName,
      `Invalid path for route "${routeName}": optional splat ('*name?') is not supported in "${path}" — a splat cannot be optional (use a required splat '*name')`,
    );
  }

  // Unconstrained optional param before a splat (`/:v?/*rest`). No constraint =
  // no validity signal to disambiguate take vs skip → every multi-segment value
  // has two readings, so `match` would silently reshape half the input space.
  // Reject with a hint (path-matcher backstops at `registerTree`); a CONSTRAINED
  // optional→splat (`/:v<c>?/*rest`) IS supported (#1264, SUPPORT-NARROWER A1).
  if (hasUnconstrainedOptionalBeforeSplat(pathPattern)) {
    throw createRouterError(
      methodName,
      `Invalid path for route "${routeName}": an unconstrained optional param before a splat is not supported in "${path}" — it is ambiguous (every multi-segment value has two readings). Add a constraint (e.g. ':lang<[a-z]+>?') or model it as two routes`,
    );
  }

  // Raw non-ASCII in a STATIC segment (`/café`, `/меню`, #1154). match rejects
  // non-ASCII input and compares static keys raw, so the route registers but never
  // matches. Reject with the percent-encode workaround (path-matcher backstops at
  // `registerTree`); a non-ASCII param NAME or constraint body is unaffected.
  if (hasNonAsciiStatic(pathPattern)) {
    throw createRouterError(
      methodName,
      `Invalid path for route "${routeName}": non-ASCII static segment in "${path}" — match compares static segments raw and rejects non-ASCII input, so this route would never match. Percent-encode it (e.g. '/caf%C3%A9') or use a param`,
    );
  }

  // Absolute paths under parameterized parents
  // Check if parent has URL parameters via paramTypeMap
  const hasUrlParams = parentNode && parentNode.paramMeta.urlParams.length > 0;

  if (path.startsWith("~") && hasUrlParams) {
    throw createRouterError(
      methodName,
      `Absolute path "${path}" cannot be used under parent route with URL parameters`,
    );
  }
}

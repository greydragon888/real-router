import {
  buildParamMeta,
  findSegmentGrammarError,
  hasMultipleOptionalsBeforeSplat,
  INVALID_QUERY_NAME_RGX,
  isConstraintBalanced,
} from "../path-matcher";

import type { SegmentErrorCode } from "../path-matcher";
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
 * Reports whether a path has an UNCONSTRAINED optional param directly before a
 * splat (`/:v?/*rest`, #1264). Without a constraint there is no validity signal to
 * disambiguate "take the optional" from "let the splat capture" — every
 * multi-segment value has two readings, so support would silently reshape half the
 * input space. Rejected with a hint (product decision); a CONSTRAINED
 * optional→splat (`/:v<c>?/*rest`) IS supported. path-matcher backstops at
 * `registerTree`; this gate adds the route-contextual message.
 *
 * A linear scan (constraints may contain
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
 * Rejects an optional param placed directly before a splat, in both shapes: TWO
 * optionals (`/:a?/:b?/*rest`, #1287 — one trie slot carries a single fork) and a
 * single UNCONSTRAINED optional (`/:v?/*rest`, #1264 — no validity signal to
 * disambiguate take-vs-skip). Both silently reshape multi-segment input.
 *
 * #1287 is checked FIRST — matching the backstop, which runs
 * `hasMultipleOptionalsBeforeSplat` in `registerNode` BEFORE `markOptionalFork`'s
 * unconstrained-splat throw. A path that triggers BOTH (`/:a?/:b?/*rest`: two
 * optionals, the inner one unconstrained before the splat) therefore reports the
 * #1287 reason on the gate AND the backstop — not #1264 on the gate and #1287 on the
 * backstop (a reject-reason divergence the parity property, which checks only the
 * boolean, would miss). #1287's "split / drop the '?'" is the actionable fix; the
 * #1264 "add a constraint" hint is a dead end here — `/:a<c>?/:b<c>?/*rest` is still
 * rejected by #1287. Only `hasMultipleOptionalsBeforeSplat` is single-sourced from
 * `parseSegment.ts` (shared with the backstop, can't drift by construction);
 * `hasUnconstrainedOptionalBeforeSplat` is a gate-local char-scan backstopped
 * separately by `throwUnconstrainedOptionalSplat`. This adds the route-contextual message.
 */
function validateOptionalBeforeSplat(
  pathPattern: string,
  routeName: string,
  path: string,
  methodName: string,
): void {
  if (hasMultipleOptionalsBeforeSplat(pathPattern)) {
    throw createRouterError(
      methodName,
      `Invalid path for route "${routeName}": two optional params directly before a splat are not supported in "${path}" — a single trie slot carries one optional→splat fork, so the omit-outer/take-inner form would silently reshape into the splat. Split into two routes, or drop the '?' on one`,
    );
  }

  if (hasUnconstrainedOptionalBeforeSplat(pathPattern)) {
    throw createRouterError(
      methodName,
      `Invalid path for route "${routeName}": an unconstrained optional param before a splat is not supported in "${path}" — it is ambiguous (every multi-segment value has two readings). Add a constraint (e.g. ':lang<[a-z]+>?') or model it as two routes`,
    );
  }
}

/**
 * Maps a per-segment grammar error code (from `findSegmentGrammarError`) to the
 * gate's route-contextual message. The messages are the ones the removed per-check
 * scans threw, verbatim (#1324). `trailing-marker` reuses the name-less message —
 * the gate previously lumped `:y*` there via `EMPTY_PARAM_MARKER_RGX`.
 */
function gateGrammarMessage(
  code: SegmentErrorCode,
  routeName: string,
  path: string,
): string {
  switch (code) {
    case "name-less":
    case "trailing-marker": {
      return `Invalid path for route "${routeName}": parameter marker (':' or '*') without a name in "${path}"`;
    }
    case "fused-marker": {
      return `Invalid path for route "${routeName}": parameter marker (':' or '*') must begin a segment, but "${path}" fuses one to a static prefix (use a boundary marker like "/a/:b")`;
    }
    case "fused-constraint-suffix": {
      return `Invalid path for route "${routeName}": text fused to a constraint '>' in "${path}" (a '<...>' must end its segment or be followed by '/' or an optional '?' — use "/:id<...>/rest", not "/:id<...>rest")`;
    }
    case "constraint-in-static": {
      return `Invalid path for route "${routeName}": constraint '<...>' in a static segment in "${path}" (a '<...>' must follow a parameter marker ':' or '*' — attach it to a param like "/:id<...>", or drop it)`;
    }
    case "optional-splat": {
      return `Invalid path for route "${routeName}": optional splat ('*name?') is not supported in "${path}" — a splat cannot be optional (use a required splat '*name')`;
    }
    /* v8 ignore start -- unbalanced/empty `<>` are pre-rejected by validateConstraintSyntax above; unreachable here */
    case "unbalanced-constraint":
    case "empty-constraint": {
      return `Invalid path for route "${routeName}": invalid constraint in "${path}"`;
    }
    /* v8 ignore stop */
  }
}

/**
 * Calls `buildParamMeta`, re-throwing ITS own errors as the gate's
 * route-contextual `TypeError`. `buildParamMeta` compiles each constraint body to
 * a `RegExp`, so an invalid body — `<*x>`, `<(>`, `<[>` (balanced and non-empty, so
 * `validateConstraintSyntax` above lets it through, but not a valid regular
 * expression, path-matcher #1324) — throws a plain `Error` (`[buildParamMeta] …`)
 * there. Without this wrapper that single malformed class would escape the gate's
 * `[router.<method>]` contract with no route context — the one input the gate
 * rejected inconsistently with every other malformed path. path-matcher backstops
 * the same body at `registerTree`; this keeps the gate's message shape uniform.
 */
function safeBuildParamMeta(
  path: string,
  routeName: string,
  methodName: string,
): ReturnType<typeof buildParamMeta> {
  try {
    return buildParamMeta(path);
  } catch (error) {
    /* v8 ignore start -- `buildParamMeta` always throws an `Error`; the `String()` arm is an unreachable defensive narrow for the `unknown` catch binding */
    const raw = error instanceof Error ? error.message : String(error);
    /* v8 ignore stop */
    const detail = raw.replace(/^\[buildParamMeta] /, "");

    throw createRouterError(
      methodName,
      `Invalid path for route "${routeName}": ${detail} (in "${path}")`,
    );
  }
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
  // declaration is not falsely flagged. Wrapped so an invalid-regex constraint
  // body (`<*x>`) — which `buildParamMeta`'s RegExp compile throws on — surfaces as
  // this gate's route-contextual `TypeError`, not a bare `[buildParamMeta]` Error.
  const { pathPattern, urlParams, queryParams } = safeBuildParamMeta(
    path,
    routeName,
    methodName,
  );

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

  // Per-segment grammar rejections via the canonical `parseSegment` tokenizer
  // (#1324): `findSegmentGrammarError` runs the same split+parse the matcher uses,
  // so the gate cannot drift. Replaces the five per-check scans (name-less
  // #858/#863, fused-marker #1050, fused-constraint-suffix #1150,
  // constraint-in-static #1311, optional-splat #1149) and adds the trailing-marker
  // case (`:y*`, previously mis-diagnosed as name-less). Unbalanced/empty `<>` are
  // pre-rejected by validateConstraintSyntax above, so those codes never reach here.
  const grammarError = findSegmentGrammarError(pathPattern);

  if (grammarError !== undefined) {
    throw createRouterError(
      methodName,
      gateGrammarMessage(grammarError, routeName, path),
    );
  }

  // Reject an optional param placed directly before a splat — a single
  // UNCONSTRAINED optional (#1264) or TWO optionals (#1287). Both predicates are
  // shared verbatim with path-matcher's `registerTree` backstop.
  validateOptionalBeforeSplat(pathPattern, routeName, path, methodName);

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

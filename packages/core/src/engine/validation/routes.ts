import {
  buildParamMeta,
  describeRemovedForm,
  findSegmentGrammarError,
  INVALID_QUERY_NAME_RGX,
} from "../path-matcher";

import type { RemovedForm, SegmentErrorCode } from "../path-matcher";
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
 * carrying `<`/`>` (`/a?fil<ter` — a `<` in a plain query tail; never round-trips),
 * or one that collides with a path-param name (`/a/:tab?tab`, where buildPath emits
 * the value twice). Narrow to `<>`: a `=` in the declaration (`?tab=1`, §5.2) is
 * tolerated today and left as a separate call. (Under M1 a reverse-order typo
 * `/a/:b?<c>` is caught earlier as optional-removed — the `?<` keeps it in the
 * path, §3.3.) path-matcher's `registerTree` backstops both; this gate adds the
 * route-contextual message.
 */
function validateQueryParamDeclarations(
  queryParams: readonly string[],
  routeName: string,
  methodName: string,
  path: string,
): void {
  // A path/query name collision (`/a/:tab?tab`) is legal under M2: `tab` lives
  // in both `state.params` and `state.search` as separate channels (RFC-4 M2 /
  // #1548), so the former "declared as both" rejection is gone. Only a query
  // name that can never round-trip (contains `<`/`>`) is still rejected.
  for (const name of queryParams) {
    if (INVALID_QUERY_NAME_RGX.test(name)) {
      throw createRouterError(
        methodName,
        `Invalid path for route "${routeName}": invalid query-param name "${name}" in "${path}" (a query-param name cannot contain '<' or '>' — it would never round-trip; rename the query param)`,
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
 * is skipped. A `for…of` code-point scan tracking segment start. Runs AFTER the
 * removed-form / grammar rejections, so no `<`/`>` (a former constraint) can
 * reach it — the 3-token grammar has no constraint body to skip (M1, #1516).
 */
function hasNonAsciiStatic(path: string): boolean {
  let atSegmentStart = true;
  let segmentIsMarker = false;

  for (const char of path) {
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
 * Maps a SURVIVING per-segment grammar error code (from `findSegmentGrammarError`)
 * to the gate's route-contextual message. The removed-form codes (`optional-removed`
 * / `constraint-removed`) are NOT handled here — they carry a richer replacement
 * recipe built by `removedFormMessage` from `describeRemovedForm`.
 */
function gateGrammarMessage(
  code: Exclude<SegmentErrorCode, "optional-removed" | "constraint-removed">,
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
  }
}

/**
 * Builds the route-contextual replacement recipe for a removed form (M1) — the
 * RICH tier (the matcher backstop uses a shorter, path-free recipe). For an
 * optional it names the offending segment and the two concrete sibling paths that
 * replace it (computed from the actual path by `describeRemovedForm`); for a
 * constraint it names the offending segment and points to a guard.
 */
function removedFormMessage(removed: RemovedForm, routeName: string): string {
  if (removed.code === "optional-removed") {
    return `Invalid path for route "${routeName}": optional params are not supported — "${removed.segment}". Declare two sibling routes instead: "${removed.withoutSegment}" and "${removed.requiredForm}" (the route hierarchy already expresses optionality)`;
  }

  return `Invalid path for route "${routeName}": regex constraints are not supported — '<' and '>' are reserved in path segments ("${removed.segment}"). Match the segment as a plain string and validate the value in a guard (canActivate) or app code`;
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
// whitespace, format, double-slash, dup-param, query-decl, the M1 removed-form
// recipe, surviving grammar markers (name-less / fused / trailing), non-ASCII
// static, absolute-under-param). Each is a simple early throw; extracting them
// would only scatter one checklist.

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

  // The grammar checks below scan only the URL-path portion: `buildParamMeta`
  // strips the query the same way the trie does, so a `:`/`*` inside a query
  // declaration is not falsely flagged. (`buildParamMeta` is total — the 3-token
  // grammar has no constraint body to compile, so it never throws — M1, #1516.)
  const { pathPattern, urlParams, queryParams } = buildParamMeta(path);

  // Duplicate param name within this route's own path (`/:id/:id`, `/:x/*x`, #1151).
  validateUniqueParamNames(urlParams, routeName, methodName, path);

  // Malformed query-param declarations (#1242 §5.1): a query name with `<>`
  // (never round-trips). Name collisions with a path param are legal under M2
  // (separate params/search channels, #1548).
  validateQueryParamDeclarations(queryParams, routeName, methodName, path);

  // Removed-form (M1) rejection first — a `:x?` optional or a `<re>` constraint —
  // with the RICH route-contextual replacement recipe (the offending segment plus,
  // for an optional, the two computed sibling paths). Returns undefined when the
  // path's first grammar error is a SURVIVING code, so the fall-through below runs.
  const removed = describeRemovedForm(pathPattern);

  if (removed !== undefined) {
    throw createRouterError(methodName, removedFormMessage(removed, routeName));
  }

  // Surviving per-segment grammar rejections via the canonical `parseSegment`
  // tokenizer: name-less (#858/#863), fused-marker (#1050), trailing-marker
  // (#1324). `findSegmentGrammarError` runs the same split+parse the matcher uses,
  // so the gate cannot drift. (Only removed-form codes reach `removed` above; the
  // first error here is therefore always a surviving code.)
  const grammarError = findSegmentGrammarError(pathPattern);

  if (grammarError !== undefined) {
    throw createRouterError(
      methodName,
      gateGrammarMessage(
        grammarError as Exclude<
          SegmentErrorCode,
          "optional-removed" | "constraint-removed"
        >,
        routeName,
        path,
      ),
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

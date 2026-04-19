import { SegmentMatcher } from "../../src/SegmentMatcher";

import type { SegmentMatcherOptions } from "../../src/types";

/**
 * Minimal query-string parse/build used by path-matcher tests & benchmarks.
 *
 * **Why inlined:** mirrors the semantics of `search-params` (the engine wired by
 * `route-tree/createMatcher` in production) for the no-strategies path, but
 * avoids a devDependency on `search-params` from `path-matcher`. This keeps
 * `path-matcher` — including its dev graph — free of adjacent-package
 * references and the package self-contained.
 *
 * **Semantics (must stay aligned with `search-params` defaults, verified
 * explicitly by `tests/unit/createTestMatcher.test.ts`):**
 * - `parse("flag")`  → `{ flag: null }` (key-only → `null`)
 * - `parse("flag=")` → `{ flag: "" }` (explicit empty value, distinct from key-only)
 * - `parse("a=1&b=2")` → `{ a: "1", b: "2" }`
 * - `build({ x: undefined })` → `""` (undefined stripped)
 * - `build({ x: null })` → `"x"` (null as key-only, matches `nullFormat: "default"`)
 * - `build({ x: "" })` → `"x="` (explicit empty value, round-trip with `parse`)
 * - `build({ x: 1, y: true })` → `"x=1&y=true"` (String coercion)
 *
 * If `search-params` baseline changes (extremely unlikely — these are RFC 3986
 * rules), update this helper + the unit tests in lockstep.
 */
export function __inlineParse(queryString: string): Record<string, unknown> {
  return parse(queryString);
}

export function __inlineBuild(params: Record<string, unknown>): string {
  return build(params);
}

function parse(queryString: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  if (queryString.length === 0) {
    return params;
  }

  let start = 0;
  const length = queryString.length;

  while (start < length) {
    let end = queryString.indexOf("&", start);

    if (end === -1) {
      end = length;
    }

    const eqIdx = queryString.indexOf("=", start);
    const hasValue = eqIdx !== -1 && eqIdx < end;

    const key = decodeURIComponent(
      queryString.slice(start, hasValue ? eqIdx : end),
    );

    params[key] = hasValue
      ? decodeURIComponent(queryString.slice(eqIdx + 1, end))
      : null;

    start = end + 1;
  }

  return params;
}

function build(params: Record<string, unknown>): string {
  let result = "";

  for (const key in params) {
    const value = params[key];

    if (value === undefined) {
      continue;
    }

    if (result.length > 0) {
      result += "&";
    }

    const encodedKey = encodeURIComponent(key);

    if (value === null) {
      result += encodedKey;
      continue;
    }

    const encodedValue =
      typeof value === "string" ? value : String(value as number | boolean);

    result += `${encodedKey}=${encodeURIComponent(encodedValue)}`;
  }

  return result;
}

/**
 * Shared test helper that constructs a `SegmentMatcher` with the inline
 * parse/build wired as `parseQueryString`/`buildQueryString`.
 *
 * Mirrors the production wiring in `route-tree/createMatcher.ts` — tests stay
 * consistent with real consumer behavior without pulling `search-params` as a
 * devDependency of `path-matcher`.
 */
export const createTestMatcher = (
  options: Partial<SegmentMatcherOptions> = {},
): SegmentMatcher =>
  new SegmentMatcher({
    parseQueryString: parse,
    buildQueryString: build,
    ...options,
  });

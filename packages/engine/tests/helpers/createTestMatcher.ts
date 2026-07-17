import { SegmentMatcher } from "../../src/path-matcher/SegmentMatcher";
import { build, parseQuery } from "../../src/search-params";

import type { SegmentMatcherOptions } from "../../src/path-matcher/types";
import type { Options } from "../../src/search-params";

/**
 * Shared test helper that constructs a `SegmentMatcher` wired with the REAL
 * search-params `parseQuery`/`build` as `parseQueryString`/`buildQueryString` —
 * exactly as production `createMatcher` does.
 *
 * Before the engine merge (#1510) `path-matcher` was a separate zero-dependency
 * package, so its tests carried an INLINE mirror of the search-params no-strategy
 * defaults (with a drift-guard unit test). Now both are layers of `engine`, so the
 * matcher tests wire the real parser directly — there is no inline copy left to
 * drift, and the drift-guard test is gone (RFC §9.2).
 *
 * Explicit `{ booleanFormat: "none", numberFormat: "none" }` preserves the
 * no-strategy semantics the matcher's grammar/encoding tests assume (a query value
 * stays the raw string, not coerced to a boolean/number); `arrayFormat: "none"` and
 * `nullFormat: "default"` are already the defaults.
 */
const NO_STRATEGY_QP: Options = { booleanFormat: "none", numberFormat: "none" };

export const createTestMatcher = (
  options: Partial<SegmentMatcherOptions> = {},
): SegmentMatcher =>
  new SegmentMatcher({
    parseQueryString: (qs: string) => parseQuery(qs, NO_STRATEGY_QP),
    buildQueryString: (params: Record<string, unknown>) =>
      build(params, NO_STRATEGY_QP),
    ...options,
  });

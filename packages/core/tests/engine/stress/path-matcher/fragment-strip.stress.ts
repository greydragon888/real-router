import { describe, expect, it } from "vitest";

import { createMatcher } from "../../helpers/buildTree";

/**
 * Scale / throughput guards for the post-query fragment strip (#842).
 *
 * `#preparePath` strips a fragment (`#…`) that follows a query string before the
 * query is parsed, so `?ref=v#frag` recovers `ref="v"` rather than `ref="v#frag"`.
 * These assert what coverage cannot:
 *
 * 1. **Never-leak under a flood** — across tens of thousands of distinct
 *    `?query#fragment` URLs, the fragment never leaks into a captured param. The
 *    discriminating signal is "did any of N inputs leak", which one example can't
 *    establish; removing the `indexOf("#")` strip makes every one of them carry
 *    `…#frag` (mutationally verified).
 * 2. **The strip stays cheap on the hot query path** — the extra `indexOf` must
 *    not regress query matching. Generous per-op ceiling (CPU-load tolerant);
 *    correctness on every iteration is the real guard.
 */

describe("S1: fragment after a query never leaks into a param under a flood", () => {
  it("strips the fragment for 30,000 distinct ?query#fragment URLs", () => {
    const matcher = createMatcher([{ name: "users", path: "/users/:id?ref" }]);

    let leaked = 0;
    let mismatched = 0;

    for (let i = 0; i < 30_000; i++) {
      const ref = `v${i}`;
      const result = matcher.match(`/users/u${i}?ref=${ref}#frag${i}`);
      // Query values live in `MatchResult.search`, path params in `.params`
      // (RFC-4 M2 / #1548); `ref` is a declared query param.
      const got = result?.search.ref;

      if (got !== ref) {
        mismatched++;
      }

      if (typeof got === "string" && got.includes("#")) {
        leaked++;
      }
    }

    // No input may carry the fragment into the query value, and every one must
    // recover the exact declared value.
    expect(leaked).toBe(0);
    expect(mismatched).toBe(0);
  });
});

describe("S2: the fragment strip stays cheap on the hot query path", () => {
  it("matches 50,000 ?query#fragment URLs within budget", () => {
    const matcher = createMatcher([{ name: "users", path: "/users/:id?ref" }]);

    const ITER = 50_000;
    const start = performance.now();
    let leaked = 0;
    let mismatched = 0;

    for (let i = 0; i < ITER; i++) {
      const got = matcher.match(`/users/u${i % 500}?ref=v${i}#section${i}`)!
        .search.ref as string;

      // Result-parity guard on the hot path: each op must recover exactly the
      // declared value `v${i}` with no fragment folded in. A bare
      // `startsWith("v")` liveness check would pass even when `#section${i}`
      // leaks (`v123#section123` still starts with `v`); equality + a `#` scan
      // make this loop fail on the #842 regression, not just on a crash.
      // (Both counters increment only on failure, so they are ~free on the
      // healthy path and do not perturb the timing measurement below.)
      if (got !== `v${i}`) {
        mismatched++;
      }

      if (got.includes("#")) {
        leaked++;
      }
    }

    const totalMs = performance.now() - start;

    expect(mismatched).toBe(0);
    expect(leaked).toBe(0);
    // Generous per-op ceiling (~50× measured healthy of ~0.0009ms/op); the
    // native indexOf strip must stay ~free. Wide on purpose — CPU-load tolerant,
    // a throughput floor only, not a tight timing assertion.
    expect(totalMs / ITER).toBeLessThan(0.05);
  });
});

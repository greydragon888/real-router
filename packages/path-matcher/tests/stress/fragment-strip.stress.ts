import { describe, expect, it } from "vitest";

import { createMatcher } from "../benchmarks/helpers/buildTree";

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
      const got = result?.params.ref;

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
    let lastRef = "";

    for (let i = 0; i < ITER; i++) {
      lastRef = matcher.match(`/users/u${i % 500}?ref=v${i}#section${i}`)!
        .params.ref as string;
    }

    const totalMs = performance.now() - start;

    expect(lastRef.startsWith("v")).toBe(true);
    // Generous per-op ceiling; the native indexOf strip must stay ~free.
    expect(totalMs / ITER).toBeLessThan(0.05);
  });
});

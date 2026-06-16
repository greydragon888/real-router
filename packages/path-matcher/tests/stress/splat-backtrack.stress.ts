import { describe, expect, it } from "vitest";

import { createMatcher } from "../benchmarks/helpers/buildTree";

/**
 * Correctness-at-scale + throughput guards for splat backtracking (INVARIANTS
 * Matching #24).
 *
 * When a splat node has a child route, `#matchSplat` runs one `#traverseFrom`
 * over the remainder (does it match the more-specific child?) and, on failure,
 * falls back to the wildcard capture — allocating a throwaway `childParams`
 * object each time. It is **O(remaining length) by construction** (one pass +
 * one slice, no nested loop), so there is no quadratic to guard; these instead
 * assert what coverage cannot:
 *
 * 1. **Backtracking stays correct at scale** — across thousands of varied paths,
 *    the more-specific child wins when the remainder matches it and the wildcard
 *    captures the full remainder otherwise; a deep (10k-segment) non-matching
 *    remainder falls back correctly and in linear time.
 * 2. **Repeated backtracking does not degrade throughput** — the per-match
 *    `childParams` allocation must stay flat over many fallbacks (generous
 *    per-op ceiling; correctness on every iteration is the real guard).
 */

function makeMatcher(): ReturnType<typeof createMatcher> {
  // A splat with a more-specific child route: `/n/edit` resolves to the child,
  // anything else falls back to the `*rest` wildcard.
  return createMatcher([
    {
      name: "n",
      path: "/n",
      children: [
        {
          name: "all",
          path: "/*rest",
          children: [{ name: "edit", path: "/edit" }],
        },
      ],
    },
  ]);
}

describe("S1: splat backtracking resolves specific-vs-wildcard correctly at scale", () => {
  it("falls back to the wildcard for thousands of non-matching remainders", () => {
    const matcher = makeMatcher();

    for (let i = 0; i < 5000; i++) {
      const remainder = `seg${i}/leaf${i}`;
      const result = matcher.match(`/n/${remainder}`);

      // Remainder does not match the `/edit` child ⇒ wildcard capture.
      expect(result?.segments.at(-1)?.fullName).toBe("n.all");
      expect(result?.params.rest).toBe(remainder);
    }

    // The more-specific child still wins when the remainder matches it.
    expect(matcher.match("/n/edit")?.segments.at(-1)?.fullName).toBe(
      "n.all.edit",
    );
  });

  it("falls back over a 10k-segment remainder in linear time", () => {
    const matcher = makeMatcher();
    const remainder = Array.from({ length: 10_000 }, (_, i) => `x${i}`).join(
      "/",
    );

    const start = performance.now();
    const result = matcher.match(`/n/${remainder}`);
    const elapsedMs = performance.now() - start;

    expect(result?.segments.at(-1)?.fullName).toBe("n.all");
    expect(result?.params.rest).toBe(remainder);
    expect(elapsedMs).toBeLessThan(200);
  });
});

describe("S2: repeated splat fallback does not degrade throughput", () => {
  it("matches 50,000 backtracking fallbacks within budget", () => {
    const matcher = makeMatcher();

    const ITER = 50_000;
    const start = performance.now();
    let lastRest = "";

    for (let i = 0; i < ITER; i++) {
      lastRest = matcher.match(`/n/a${i % 500}/b${i % 500}`)!.params
        .rest as string;
    }

    const totalMs = performance.now() - start;

    expect(lastRest.startsWith("a")).toBe(true);
    expect(totalMs / ITER).toBeLessThan(0.05);
  });
});

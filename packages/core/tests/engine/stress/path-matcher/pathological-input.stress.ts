import { describe, expect, it } from "vitest";

import { createMatcher } from "../../helpers/buildTree";

/**
 * Anti-quadratic guards for `match()` on pathologically large inputs.
 *
 * `match()` scans the path once (`#scanPath`), traverses segment-by-segment
 * (`#traverseFrom`), and merges the parsed query (`#mergeQueryParams`) — all
 * linear in input size. These assert that a huge input stays linear: an
 * accidental O(n²) (a re-scan per segment, an array `includes` per query key
 * instead of `Set.has`, etc.) would blow the generous ceilings, which are
 * anchored to measured healthy timings with a large margin (so CPU load can't
 * flake them). Correctness of the capture is asserted alongside.
 */

describe("S1: a 10,000-segment splat path is captured in linear time", () => {
  it("captures a 10k-segment splat value without a quadratic scan", () => {
    const matcher = createMatcher([{ name: "files", path: "/files/*path" }]);
    const value = Array.from({ length: 10_000 }, (_, i) => `s${i}`).join("/");

    const start = performance.now();
    const result = matcher.match(`/files/${value}`);
    const elapsedMs = performance.now() - start;

    expect(result?.params.path).toBe(value);
    // Healthy ~0.5 ms; an O(n²) scan over 10k segments would be hundreds of ms+.
    expect(elapsedMs).toBeLessThan(200);
  });
});

describe("S2: a ~1MB splat value is captured in bounded time", () => {
  it("matches a 1MB single-segment splat value", () => {
    const matcher = createMatcher([{ name: "files", path: "/files/*path" }]);
    const big = "x".repeat(1_000_000);

    const start = performance.now();
    const result = matcher.match(`/files/${big}`);
    const elapsedMs = performance.now() - start;

    expect(result?.params.path).toBe(big);
    // Healthy ~3.5 ms; guards against O(n²) over the 1MB value.
    expect(elapsedMs).toBeLessThan(500);
  });
});

describe("S3: a large query string merges in linear time (10k loose, 50k strict)", () => {
  it("merges 10k query params (non-strict) without quadratic blowup", () => {
    const matcher = createMatcher([{ name: "s", path: "/s" }]);
    const query = Array.from({ length: 10_000 }, (_, i) => `k${i}=v${i}`).join(
      "&",
    );

    const start = performance.now();
    const result = matcher.match(`/s?${query}`);
    const elapsedMs = performance.now() - start;

    // Query params land in `MatchResult.search` (RFC-4 M2 / #1548); `/s` has no
    // path params, so `.params` is empty and all 10k keys are in `.search`.
    expect(Object.keys(result!.search)).toHaveLength(10_000);
    expect(result!.search.k9999).toBe("v9999");
    expect(elapsedMs).toBeLessThan(500); // healthy ~6 ms
  });

  it("strict mode with 50k declared keys stays O(1)-per-key (Set, not array scan)", () => {
    // The discriminating case: strict mode checks each query key against the
    // declared set. With 50k declared × 50k query, a `Set.has` lookup is linear
    // (~27 ms measured healthy); an array `includes` regression is O(n²)
    // (~1000 ms measured). N=50k anchors the ceiling between them: 300 ms is 11×
    // over healthy (flake-proof) and 3.3× under the mutant. At the old N=10k the
    // includes-regression measured ~440 ms and slipped under a 500 ms ceiling —
    // the test passed on the very bug it exists to catch.
    const declared = Array.from({ length: 50_000 }, (_, i) => `k${i}`).join(
      "&",
    );
    const matcher = createMatcher([{ name: "s", path: `/s?${declared}` }], {
      strictQueryParams: true,
    });
    const query = Array.from({ length: 50_000 }, (_, i) => `k${i}=v${i}`).join(
      "&",
    );

    const start = performance.now();
    const result = matcher.match(`/s?${query}`);
    const elapsedMs = performance.now() - start;

    expect(result).toBeDefined();
    // Declared query params land in `MatchResult.search` (RFC-4 M2 / #1548).
    expect(Object.keys(result!.search)).toHaveLength(50_000);
    expect(elapsedMs).toBeLessThan(300);
  });
});

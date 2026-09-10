import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Route } from "@real-router/core";

/**
 * Which route wins a CONTESTED url, as a contract (#2011 · INVARIANTS #27).
 *
 * ⚑ **The behaviour was stable long before this file; what was missing is that
 * anything asserted it.** Four rules describe fragments of it — INVARIANTS #8,
 * #24, #26 and #740 item 2 — each filed for its own reason, and none states the
 * composition. `tree-shape-roundtrip.properties.ts` skips every contested URL by
 * design, saying in its own docblock that the specificity question is not one it
 * owns. So any of the four could have been refactored away with only unrelated
 * cells noticing.
 *
 * ⚠ **Both declaration orders, always.** Order-independence is half of what
 * makes this a contract rather than an accident of registration; a table that
 * registered one way round would pass on a matcher that simply answered "first
 * declared".
 *
 * ⚠ **The commitment half needs CONTROLS, because `UNMATCHED` is what a broken
 * tree answers too.** A static hop does not merely outrank a param — it keeps
 * the segment, so a dead-end there is final. Asserting only `UNMATCHED` would
 * pass if the param route were misregistered, unreachable, or absent; each such
 * cell therefore carries a URL that DOES reach the param route on the same tree.
 */
type Fixture = readonly [
  label: string,
  a: Route,
  b: Route,
  url: string,
  winner: string,
];

/** Contests where both routes claim the URL outright. */
const CONTESTS: readonly Fixture[] = [
  [
    "static beats param",
    { name: "s", path: "/x" },
    { name: "p", path: "/:id" },
    "/x",
    "s",
  ],
  [
    "static beats splat",
    { name: "s", path: "/x" },
    { name: "w", path: "/*rest" },
    "/x",
    "s",
  ],
  [
    "param beats splat",
    { name: "p", path: "/:id" },
    { name: "w", path: "/*rest" },
    "/x",
    "p",
  ],
  [
    "an index child beats a sibling",
    { name: "par", path: "/x", children: [{ name: "idx", path: "/" }] },
    { name: "sib", path: "/x-other" },
    "/x",
    "par.idx",
  ],
];

function answer(routes: readonly Route[], url: string): string {
  return (
    getPluginApi(createRouter([...routes])).matchPath(url)?.name ?? "UNMATCHED"
  );
}

describe("matcher precedence for contested URLs (#2011)", () => {
  it("CONTROL — the table registers the cells it claims", () => {
    // `it.each([])` registers nothing in silence; the count lives outside.
    expect(CONTESTS).toHaveLength(4);
  });

  it.each(CONTESTS)(
    "%s, in both declaration orders",
    (_label, a, b, url, winner) => {
      expect(answer([a, b], url)).toBe(winner);
      expect(answer([b, a], url)).toBe(winner);
    },
  );

  it("a static hop COMMITS its segment — a dead-end there does not reach a param sibling", () => {
    // INVARIANTS #740 item 2. The control is the load-bearing half: `/y/b`
    // proves the param route is registered and reachable on this very tree, so
    // the UNMATCHED above is commitment and not a broken fixture.
    const routes: readonly Route[] = [
      { name: "st", path: "/x", children: [{ name: "a", path: "/a" }] },
      { name: "pm", path: "/:id", children: [{ name: "b", path: "/b" }] },
    ];

    expect(answer(routes, "/x/b")).toBe("UNMATCHED");
    expect(answer(routes.toReversed(), "/x/b")).toBe("UNMATCHED");
    expect(answer(routes, "/y/b")).toBe("pm.b");
  });

  it("a splat sibling DOES catch the same dead-end", () => {
    // INVARIANTS #26 — the one exception, and #26 gives the reason as
    // termination rather than greediness: a splat consumes the remainder and
    // ends the walk, so the retry is O(1).
    const routes: readonly Route[] = [
      { name: "st", path: "/x", children: [{ name: "a", path: "/a" }] },
      { name: "wc", path: "/*rest" },
    ];

    expect(answer(routes, "/x/b")).toBe("wc");
    expect(answer(routes.toReversed(), "/x/b")).toBe("wc");
    expect(answer(routes, "/y/b")).toBe("wc");
  });
});

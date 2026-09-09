import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

/**
 * #2206 — `SegmentMatcher.#traverse`'s root-`"/"` block carried
 * `/* v8 ignore start -- @preserve: root "/" is always in #staticCache *\/`.
 *
 * The premise is false, and not narrowly: instrumenting the block and running
 * the whole core suite reached it **284 times**, so it is ordinary traffic
 * rather than a corner. `"/"` enters `#staticCache` only from
 * `registerStandardRoute`, and only for a route that NORMALISES to `"/"`; a
 * table without one leaves the key absent, `match()` misses, and control
 * arrives here on every `matchPath("/")`.
 *
 * The three cells below are the three shapes that distinction produces. A and B
 * both execute the block and take a different arm of the `??`; C is the control
 * — the one shape the deleted comment described, where the cache answers and
 * the block is never entered.
 *
 * ⚠ The `?? this.#root.route` arm is NOT redundant, and the trap is that this
 * suite cannot say so: with the cache shipped as it is, that arm was never
 * VALUED once in those 284 hits (0/284), so deleting it leaves all 5227 tests
 * green and reads as dead-code removal. It is the cache-MISS fallback that the
 * `Stryker disable` reasons that argue "a miss falls through to #traverse"
 * rest on — two in `registration/index.ts` and two in this file, found by that
 * phrase rather than by a count carried here. The two beside them argue about
 * `cachedResult` instead and are not underwritten by this arm. Measured both
 * ways: with the cache write disabled, the arm present keeps the suite green
 * (5227 passed, their claim verbatim) and the arm removed fails 41 tests.
 */
describe("#2206 — matchPath('/') when no route normalises to '/'", () => {
  it("A · answers undefined when the root carries neither arm", () => {
    const router = createRouter([{ name: "x", path: "/x" }]);

    expect(getPluginApi(router).matchPath("/")).toBeUndefined();
  });

  it("B · answers the root's slash child, which is never cached", () => {
    const router = createRouter([
      { name: "home", path: "" },
      { name: "x", path: "/x" },
    ]);

    expect(getPluginApi(router).matchPath("/")?.name).toBe("home");
  });

  it("C · control — a route AT '/' is cached, so the block is not entered", () => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "x", path: "/x" },
    ]);

    expect(getPluginApi(router).matchPath("/")?.name).toBe("home");
  });

  it("B and C answer alike from opposite sides of the cache", () => {
    const viaTraverse = createRouter([{ name: "home", path: "" }]);
    const viaCache = createRouter([{ name: "home", path: "/" }]);

    expect(getPluginApi(viaTraverse).matchPath("/")?.name).toBe(
      getPluginApi(viaCache).matchPath("/")?.name,
    );
  });
});

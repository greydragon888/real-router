import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

/**
 * Regression test for issue #525, question Q2.
 *
 * In `trailingSlash: "preserve"` mode, `matchPath` re-attaches the source
 * URL's trailing slash via `matchSourceTrailingSlash` (`RoutesNamespace.ts:283`).
 * `buildNavigateState` (`RouterWiringBuilder.ts:135-156`) — invoked by
 * `router.navigate` — calls `ctx.buildPath(name, params)` without access to
 * the source URL, so the slash policy applied is the matcher's default
 * (canonical, no slash).
 *
 * If the divergence is observable, the State produced by
 * `router.navigate(matchedState.name, matchedState.params)` will have a
 * `path` that **differs from** `matchedState.path`. URL plugins that match a
 * URL and then forward `(name, params)` to `router.navigate` would silently
 * canonicalize the trailing slash on every back/forward / link click — i.e.
 * `trailingSlash: "preserve"` mode is broken end-to-end even though the
 * matcher honours it correctly.
 *
 * This test stays in the suite to detect any future regression *or* fix.
 */
describe("trailingSlash: preserve — matchPath ↔ navigate divergence (#525, Q2)", () => {
  it("matchPath preserves source trailing slash on its own result", async () => {
    const router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "users", path: "/users" },
      ],
      { trailingSlash: "preserve" },
    );

    await router.start("/");

    const matched = getPluginApi(router).matchPath("/users/");

    expect(matched?.name).toBe("users");
    expect(matched?.path).toBe("/users/");
  });

  // Confirmed `.skip` — this test ran failing on the baseline branch with
  // `AssertionError: expected '/users' to be '/users/'`. That answers #525 Q2:
  // the divergence IS real and observable. The test stays in the suite as a
  // ready-made regression fence — un-skip it inside the fix PR for #525.
  // eslint-disable-next-line vitest/no-disabled-tests -- intentional: pinned to #525 fix PR; flipping the inverse `[guard]` test below alerts us if the bug is fixed before this is unskipped.
  it.skip("router.navigate after matchPath preserves source trailing slash (#525, Q2 — confirmed bug, un-skip in fix PR)", async () => {
    const router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "users", path: "/users" },
      ],
      { trailingSlash: "preserve" },
    );

    await router.start("/");

    const matched = getPluginApi(router).matchPath("/users/");

    expect(matched?.path).toBe("/users/");

    // Plugin-equivalent flow: forward (name, params) to router.navigate.
    // Today, buildNavigateState rebuilds state.path without the source URL hint.
    const navigated = await router.navigate(matched!.name, matched!.params);

    // Expectation post-fix: end-to-end preservation. Currently fails on
    // master — `navigated.path === "/users"` (canonical) — exactly because
    // `buildNavigateState` (`RouterWiringBuilder.ts:135-156`) calls
    // `ctx.buildPath(name, params)` without access to the source URL, so
    // `matchSourceTrailingSlash` cannot run a second time.
    expect(navigated.path).toBe("/users/");
  });

  // Inverse assertion of the test above — green today, must flip once #525
  // lands. Keeps the suite green on master AND serves as a guard: a future
  // change that *accidentally* fixes path preservation here would turn this
  // assertion red and force re-evaluation of the skipped test above.
  it("[guard] router.navigate after matchPath currently CANONICALIZES the trailing slash (#525, Q2 — flip when fix lands)", async () => {
    const router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "users", path: "/users" },
      ],
      { trailingSlash: "preserve" },
    );

    await router.start("/");

    const matched = getPluginApi(router).matchPath("/users/");
    const navigated = await router.navigate(matched!.name, matched!.params);

    expect(navigated.path).toBe("/users");
  });

  it("router.navigate without prior matchPath produces canonical path (no source URL → no preservation)", async () => {
    const router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "users", path: "/users" },
      ],
      { trailingSlash: "preserve" },
    );

    await router.start("/");

    // No source URL was ever provided for this navigation — the canonical
    // form is the only correct output. This case is unaffected by #525 and
    // must keep returning "/users" (no trailing slash).
    const navigated = await router.navigate("users", {});

    expect(navigated.path).toBe("/users");
  });
});

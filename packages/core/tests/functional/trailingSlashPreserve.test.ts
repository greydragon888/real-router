import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

/**
 * #525 Q2 regression suite. Two pinned contracts:
 *
 * 1. `router.navigateToState(matchedState)` preserves source trailing slash
 *    end-to-end. matchPath re-attaches the source slash via
 *    `matchSourceTrailingSlash` (`RoutesNamespace.ts:283`); navigateToState
 *    uses the matched State as-is (no buildPath rebuild), so the slash is
 *    propagated to the committed `state.path`.
 *
 * 2. `router.navigate(name, params)` without source URL produces the
 *    canonical path. `buildNavigateState` (`RouterWiringBuilder.ts:135-156`)
 *    has no source-URL hint, so the matcher's default policy applies. This
 *    is the documented contract for programmatic-only callers.
 *
 * Plugins that handle browser-initiated navigation MUST use navigateToState
 * (see browser-plugin/hash-plugin/navigation-plugin migrations under #525).
 */
describe("trailingSlash: preserve — matchPath ↔ navigate (#525, Q2)", () => {
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

  // Closes #525 Q2: routing through the plugin-recommended `navigateToState`
  // primitive preserves the trailing slash end-to-end. Before the #525 fix
  // landed, the equivalent `router.navigate(name, params)` call canonicalized
  // the path because `buildNavigateState` had no source-URL hint — see the
  // `[doc]` test below for the still-valid programmatic-call contract.
  it("router.navigateToState after matchPath preserves source trailing slash", async () => {
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

    const navigated = await getPluginApi(router).navigateToState(matched!);

    expect(navigated.path).toBe("/users/");
  });

  // Programmatic `router.navigate(name, params)` carries no source URL hint,
  // so its result IS the canonical path — by design. Pinning this contract
  // documents the intentional asymmetry: navigate(name, params) for callers
  // that compute (name, params) themselves; navigateToState(matchedState)
  // for plugins that already have the State from matchPath.
  it("[doc] router.navigate(name, params) without prior matchPath produces canonical path (no source URL → no preservation)", async () => {
    const router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "users", path: "/users" },
      ],
      { trailingSlash: "preserve" },
    );

    await router.start("/");

    const navigated = await router.navigate("users", {});

    expect(navigated.path).toBe("/users");
  });
});

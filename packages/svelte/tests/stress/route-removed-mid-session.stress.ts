import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { tick } from "svelte";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import StressConsumer from "./components/StressConsumer.svelte";
import { renderWithRouter } from "./helpers";

import type { Router } from "@real-router/core";

// Audit follow-up #2.3 — `useRouteNode("name")` keeps a cached source for
// `name` (via WeakMap in @real-router/sources). When the route is removed
// from the router mid-session via `getRoutesApi(router).remove(...)`, the
// cached source must:
//
//   - not crash on subsequent navigations,
//   - report `route.current === undefined` after the removal (stale match
//     must not survive),
//   - allow further navigations to proceed normally.
//
// `remove()` is blocked when the target is the active route or an ancestor,
// so the scenario is: user is on `home`, mounts a consumer of `settings`,
// then removes `settings` while it is inactive.

describe("Stress: useRouteNode after mid-session route removal", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/" },
      { name: "dashboard", path: "/dashboard" },
      { name: "settings", path: "/settings" },
    ]);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("14.1 useRouteNode('settings') survives getRoutesApi.remove('settings') while inactive", async () => {
    const { container, unmount } = renderWithRouter(router, StressConsumer, {
      nodeName: "settings",
    });

    await tick();

    const probe = container.querySelector('[data-testid="settings"]');

    expect(probe).not.toBeNull();
    expect(probe!.textContent).toBe("none");

    // Activate the node so the cached source has a real reference, then
    // navigate away — `remove()` is only allowed for inactive routes.
    await router.navigate("settings");
    await tick();

    expect(probe!.textContent).toBe("settings");

    await router.navigate("home");
    await tick();

    expect(probe!.textContent).toBe("none");

    // Now remove the formerly-tracked route. The cached node source in
    // @real-router/sources must not flip back to "settings" on subsequent
    // navigations — the route is gone, the consumer should stay inactive.
    getRoutesApi(router).remove("settings");

    await router.navigate("dashboard");
    await tick();

    expect(probe!.textContent).toBe("none");

    // Attempting to navigate to the removed route must reject and must
    // not poison the consumer's snapshot.
    await router.navigate("settings").catch(() => {});
    await tick();

    expect(probe!.textContent).toBe("none");
    expect(router.getState()?.name).toBe("dashboard");

    unmount();
  });

  it("14.2 100 add/remove cycles of a non-active route — useRouteNode stays consistent", async () => {
    const { container, unmount } = renderWithRouter(router, StressConsumer, {
      nodeName: "ephemeral",
    });

    await tick();

    const probe = container.querySelector('[data-testid="ephemeral"]');

    expect(probe).not.toBeNull();
    expect(probe!.textContent).toBe("none");

    const routesApi = getRoutesApi(router);

    for (let i = 0; i < 100; i++) {
      routesApi.add({ name: "ephemeral", path: "/ephemeral" });

      await router.navigate("ephemeral");
      await tick();

      expect(probe!.textContent).toBe("ephemeral");

      await router.navigate("home");
      await tick();

      expect(probe!.textContent).toBe("none");

      routesApi.remove("ephemeral");

      await router.navigate("ephemeral").catch(() => {});
      await tick();

      expect(probe!.textContent).toBe("none");
    }

    unmount();
  });
});

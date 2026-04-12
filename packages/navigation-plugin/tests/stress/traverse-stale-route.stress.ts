import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

import { navigationPluginFactory } from "@real-router/navigation-plugin";

import { noop } from "./helpers";
import { MockNavigation } from "../helpers/mockNavigation";
import { createMockNavigationBrowser } from "../helpers/testUtils";

describe("N11: traverseToLast with stale/removed routes", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("N11.1: traverseToLast throws after route removed via replaceRoutes", async () => {
    const mockNav = new MockNavigation("http://localhost/");
    const browser = createMockNavigationBrowser(mockNav);

    const fullRoutes = [
      {
        name: "users",
        path: "/users",
        children: [
          { name: "view", path: "/view/:id" },
          { name: "list", path: "/list" },
        ],
      },
      { name: "home", path: "/home" },
      { name: "index", path: "/" },
    ];

    const router = createRouter(fullRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });

    router.usePlugin(
      navigationPluginFactory({ forceDeactivate: true, base: "" }, browser),
    );

    await router.start();
    await router.navigate("users.list");
    await router.navigate("home");

    // Remove users routes via replaceRoutes
    const routesApi = getRoutesApi(router);

    routesApi.replace([
      { name: "home", path: "/home" },
      { name: "index", path: "/" },
    ]);

    // traverseToLast should throw — entryToState can't match the removed route
    await expect(router.traverseToLast("users.list")).rejects.toThrow(
      "No history entry for route",
    );

    // Router state should remain unchanged
    expect(router.getState()!.name).toBe("home");

    router.stop();
  });

  it("N11.2: 20 cycles of navigate → replaceRoutes → traverseToLast — no crash", async () => {
    const mockNav = new MockNavigation("http://localhost/");
    const browser = createMockNavigationBrowser(mockNav);

    const baseRoutes = [
      { name: "home", path: "/home" },
      { name: "index", path: "/" },
    ];

    const extraRoute = { name: "extra", path: "/extra" };

    const router = createRouter([...baseRoutes, extraRoute], {
      defaultRoute: "home",
      allowNotFound: true,
    });

    router.usePlugin(
      navigationPluginFactory({ forceDeactivate: true, base: "" }, browser),
    );

    await router.start();

    const routesApi = getRoutesApi(router);
    let errors = 0;

    for (let i = 0; i < 20; i++) {
      // Add extra route, navigate to it, then remove it
      routesApi.replace([...baseRoutes, extraRoute]);
      await router.navigate("extra");
      await router.navigate("home");

      // Remove extra route
      routesApi.replace(baseRoutes);

      // traverseToLast should throw — entry URL exists but route is gone
      try {
        await router.traverseToLast("extra");
      } catch {
        errors++;
      }
    }

    expect(errors).toBe(20);
    expect(router.getState()!.name).toBe("home");

    router.stop();
  });
});

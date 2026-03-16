import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

import {
  createFixtureRouter,
  arbSegmentName,
  FIXTURE_ROUTE_NAMES,
  NUM_RUNS,
} from "./helpers";

describe("Route Management (getRoutesApi) Properties", () => {
  test.prop([arbSegmentName], { numRuns: NUM_RUNS.standard })(
    "add → has: after add(route), has(route.name) === true",
    (name) => {
      fc.pre(!FIXTURE_ROUTE_NAMES.includes(name as never));

      const router = createFixtureRouter();
      const routesApi = getRoutesApi(router);

      routesApi.add({ name, path: `/${name}` });

      expect(routesApi.has(name)).toBe(true);
    },
  );

  test.prop([arbSegmentName], { numRuns: NUM_RUNS.standard })(
    "add → get: after add(route), get(route.name).path matches",
    (name) => {
      fc.pre(!FIXTURE_ROUTE_NAMES.includes(name as never));

      const router = createFixtureRouter();
      const routesApi = getRoutesApi(router);
      const path = `/${name}`;

      routesApi.add({ name, path });

      const route = routesApi.get(name);

      expect(route).toBeDefined();
      expect(route!.path).toBe(path);
    },
  );

  test.prop(
    [
      fc.constantFrom(
        ...(FIXTURE_ROUTE_NAMES as unknown as [string, ...string[]]),
      ),
    ],
    { numRuns: NUM_RUNS.fast },
  )("remove → has: after remove(name), has(name) === false", (name) => {
    fc.pre(name !== "oldUsers");

    const router = createFixtureRouter();
    const routesApi = getRoutesApi(router);

    routesApi.remove(name);

    expect(routesApi.has(name)).toBe(false);
  });

  it("cyclic forwardTo throws", () => {
    const router = createFixtureRouter();
    const routesApi = getRoutesApi(router);

    expect(() => {
      routesApi.add([
        { name: "cycA", path: "/cyc-a", forwardTo: "cycB" },
        { name: "cycB", path: "/cyc-b", forwardTo: "cycA" },
      ]);
    }).toThrow();
  });

  it("replace atomicity: old routes gone, new routes present", () => {
    const router = createFixtureRouter();
    const routesApi = getRoutesApi(router);

    routesApi.replace([
      { name: "newA", path: "/new-a" },
      { name: "newB", path: "/new-b" },
    ]);

    expect(routesApi.has("home")).toBe(false);
    expect(routesApi.has("users")).toBe(false);
    expect(routesApi.has("newA")).toBe(true);
    expect(routesApi.has("newB")).toBe(true);
  });

  it("duplicate names in single add throws", () => {
    const router = createFixtureRouter();
    const routesApi = getRoutesApi(router);

    expect(() => {
      routesApi.add([
        { name: "dupX", path: "/dup-x" },
        { name: "dupX", path: "/dup-x2" },
      ]);
    }).toThrow();
  });

  test.prop([arbSegmentName], { numRuns: NUM_RUNS.fast })(
    "update → get: after update, get reflects changes",
    (newForward) => {
      fc.pre(!FIXTURE_ROUTE_NAMES.includes(newForward as never));

      const router = createFixtureRouter();
      const routesApi = getRoutesApi(router);

      routesApi.add({ name: newForward, path: `/${newForward}` });
      routesApi.update("home", { forwardTo: newForward });

      const route = routesApi.get("home");

      expect(route).toBeDefined();
      expect(route!.forwardTo).toBe(newForward);
    },
  );

  it("clear → has: after clear(), no routes exist", () => {
    const router = createFixtureRouter();
    const routesApi = getRoutesApi(router);

    routesApi.clear();

    for (const name of FIXTURE_ROUTE_NAMES) {
      expect(routesApi.has(name)).toBe(false);
    }
  });

  it("add with parent: child is accessible via dot notation", () => {
    const router = createFixtureRouter();
    const routesApi = getRoutesApi(router);

    routesApi.add({ name: "child", path: "/child" }, { parent: "users" });

    expect(routesApi.has("users.child")).toBe(true);
  });

  it("getConfig returns custom fields for a route", () => {
    const router = createFixtureRouter();
    const routesApi = getRoutesApi(router);

    routesApi.add({
      name: "custom",
      path: "/custom",
      myField: "value",
    } as never);

    const config = routesApi.getConfig("custom");

    expect(config).toBeDefined();
    expect(config!.myField).toBe("value");
  });

  it("getConfig returns undefined for unknown route", () => {
    const router = createFixtureRouter();
    const routesApi = getRoutesApi(router);

    expect(routesApi.getConfig("nonexistent")).toBeUndefined();
  });

  it("update with canActivate guard: guard blocks navigation", async () => {
    const router = createFixtureRouter();
    const routesApi = getRoutesApi(router);

    routesApi.update("admin.settings", {
      canActivate: () => () => false,
    });

    await router.start("/");

    expect(router.canNavigateTo("admin.settings")).toBe(false);

    router.stop();
  });

  it("update with canActivate null: removes guard", async () => {
    const router = createFixtureRouter();
    const lifecycle = getLifecycleApi(router);
    const routesApi = getRoutesApi(router);

    lifecycle.addActivateGuard("admin.settings", () => () => false);

    await router.start("/");

    expect(router.canNavigateTo("admin.settings")).toBe(false);

    routesApi.update("admin.settings", { canActivate: null });

    expect(router.canNavigateTo("admin.settings")).toBe(true);

    router.stop();
  });

  it("replace during active navigation is silent no-op", async () => {
    const router = createFixtureRouter();
    const lifecycle = getLifecycleApi(router);
    const routesApi = getRoutesApi(router);

    let resolveGuard!: (value: boolean) => void;
    let resolveReached!: () => void;
    const guardReached = new Promise<void>((resolve) => {
      resolveReached = resolve;
    });

    lifecycle.addActivateGuard(
      "admin.settings",
      () => () =>
        new Promise<boolean>((resolve) => {
          resolveGuard = resolve;
          resolveReached();
        }),
    );

    await router.start("/");

    const navPromise = router.navigate("admin.settings");

    await guardReached;

    routesApi.replace([{ name: "replaced", path: "/replaced" }]);

    expect(routesApi.has("home")).toBe(true);
    expect(routesApi.has("replaced")).toBe(false);

    resolveGuard(true);
    await navPromise;

    router.stop();
  });

  it("replace preserves external guards, clears definition guards", async () => {
    const router = createFixtureRouter();
    const routesApi = getRoutesApi(router);
    const lifecycle = getLifecycleApi(router);

    routesApi.update("admin.settings", {
      canActivate: () => () => false,
    });

    lifecycle.addActivateGuard("admin.dashboard", () => () => false);

    await router.start("/");

    expect(router.canNavigateTo("admin.settings")).toBe(false);
    expect(router.canNavigateTo("admin.dashboard")).toBe(false);

    routesApi.replace([
      { name: "home", path: "/" },
      {
        name: "admin",
        path: "/admin",
        children: [
          { name: "dashboard", path: "/" },
          { name: "settings", path: "/settings" },
        ],
      },
    ]);

    expect(router.canNavigateTo("admin.settings")).toBe(true);
    expect(router.canNavigateTo("admin.dashboard")).toBe(false);

    router.stop();
  });
});

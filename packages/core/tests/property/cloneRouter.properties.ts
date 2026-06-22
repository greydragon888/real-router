import { describe, expect, it } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getRoutesApi,
} from "@real-router/core/api";

import {
  createFixtureRouter,
  createStartedRouter,
  FIXTURE_ROUTE_NAMES,
} from "./helpers";

describe("cloneRouter Properties", () => {
  it("route preservation: clone contains every route from the source", () => {
    const router = createFixtureRouter();
    const cloned = cloneRouter(router);
    const clonedRoutes = getRoutesApi(cloned);

    // Independent oracle: every known fixture route must be present in the clone.
    // The old version compared clonedRoutes.has(name) to sourceRoutes.has(name)
    // (a symmetric self-check on the same impl) AND discarded its generated
    // `arbStartPath` input (`void path`) — a fake property that asserted nothing
    // an independent truth could.
    for (const name of FIXTURE_ROUTE_NAMES) {
      expect(clonedRoutes.has(name)).toBe(true);
    }
  });

  it("state independence: cloned router starts with no state", () => {
    const router = createFixtureRouter();
    const cloned = cloneRouter(router);

    expect(cloned.getState()).toBeUndefined();
  });

  it("dependency merge: clone keeps source deps, applies overrides (override wins), stays independent", () => {
    interface Deps extends Record<string, unknown> {
      apiUrl: string;
      sourceOnly: string;
      token: string;
    }

    const router = createFixtureRouter();
    const sourceDeps = getDependenciesApi<Deps>(router as never);

    sourceDeps.set("apiUrl", "https://source");
    sourceDeps.set("sourceOnly", "kept");

    const cloned = cloneRouter(
      router as never,
      {
        apiUrl: "https://override",
        token: "abc",
      } as never,
    );
    const clonedDeps = getDependenciesApi<Deps>(cloned);

    // The old test only asserted `expect(cloned).toBeDefined()` — a clone that
    // dropped deps entirely would have passed. Assert the actual merge contract:
    expect(clonedDeps.get("token")).toBe("abc"); // override-only dep applied
    expect(clonedDeps.get("sourceOnly")).toBe("kept"); // source-only dep preserved
    expect(clonedDeps.get("apiUrl")).toBe("https://override"); // override wins on conflict

    // clone deps are independent of the source (no shared store)
    clonedDeps.set("token", "changed");

    expect(sourceDeps.has("token")).toBe(false);
  });

  it("disposed source throws ROUTER_DISPOSED", async () => {
    const router = await createStartedRouter();

    router.dispose();

    expect(() => {
      cloneRouter(router);
    }).toThrow(RouterError);

    expect(() => {
      cloneRouter(router);
    }).toThrow(expect.objectContaining({ code: errorCodes.ROUTER_DISPOSED }));
  });

  it("cloned router can start and navigate independently", async () => {
    const source = createFixtureRouter();
    const cloned = cloneRouter(source);

    await cloned.start("/");

    expect(cloned.getState()!.name).toBe("home");
    expect(source.getState()).toBeUndefined();

    await cloned.navigate("admin.settings");

    expect(cloned.getState()!.name).toBe("admin.settings");

    cloned.stop();
  });

  it("cloned router preserves guards from source", async () => {
    const source = createFixtureRouter();
    const { getLifecycleApi } = await import("@real-router/core/api");
    const lifecycle = getLifecycleApi(source);

    lifecycle.addActivateGuard("admin.settings", () => () => false);

    const cloned = cloneRouter(source);

    await cloned.start("/");

    expect(cloned.canNavigateTo("admin.settings")).toBe(false);

    cloned.stop();
  });
});

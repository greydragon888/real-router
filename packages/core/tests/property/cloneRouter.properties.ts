import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getRoutesApi,
  getLifecycleApi,
} from "@real-router/core/api";

import {
  arbFixtureRoute,
  arbNavigableRoute,
  arbSegmentName,
  arbStartPath,
  createFixtureRouter,
  createStartedRouter,
  FIXTURE_ROUTE_NAMES,
  NUM_RUNS,
} from "./helpers";

function getParamsForRoute(name: string): Record<string, string> {
  if (name === "users.view" || name === "users.edit") {
    return { id: "abc" };
  }

  if (name === "search") {
    return { q: "test", page: "1" };
  }

  return {};
}

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
    const lifecycle = getLifecycleApi(source);

    lifecycle.addActivateGuard("admin.settings", () => () => false);

    const cloned = cloneRouter(source);

    await cloned.start("/");

    expect(cloned.canNavigateTo("admin.settings")).toBe(false);

    cloned.stop();
  });
});

describe("cloneRouter Properties (generative)", () => {
  // DETERMINISM: cloning is a pure structural copy — every clone resolves every
  // route identically to the source (and to sibling clones).
  test.prop([arbFixtureRoute], { numRuns: NUM_RUNS.standard })(
    "two clones resolve every route identically to the source",
    (routeName) => {
      const source = createFixtureRouter();
      const cloneA = cloneRouter(source);
      const cloneB = cloneRouter(source);
      const params = getParamsForRoute(routeName);

      expect(cloneA.buildPath(routeName, params)).toBe(
        source.buildPath(routeName, params),
      );
      expect(cloneB.buildPath(routeName, params)).toBe(
        cloneA.buildPath(routeName, params),
      );
    },
  );

  // INDEPENDENCE_DEPS_MUTATION (by-design #664): a mutable dep value is shared
  // by reference with the source — for ANY key/value, a mutation through the
  // clone is observable on the source (shallow-merge contract).
  test.prop([arbSegmentName, fc.string({ maxLength: 20 })], {
    numRuns: NUM_RUNS.standard,
  })(
    "a mutable dep value is shared by reference with the source (#664)",
    (mapKey, mapValue) => {
      interface Deps extends Record<string, unknown> {
        cache: Map<string, string>;
      }

      const source = createFixtureRouter();
      const shared = new Map<string, string>();

      getDependenciesApi<Deps>(source as never).set("cache", shared);

      const clone = cloneRouter(source);
      const cloneCache = getDependenciesApi<Deps>(clone as never).get("cache");

      expect(cloneCache).toBe(shared);

      cloneCache.set(mapKey, mapValue);

      expect(
        getDependenciesApi<Deps>(source as never)
          .get("cache")
          .get(mapKey),
      ).toBe(mapValue);
    },
  );

  // PROTOTYPE_POLLUTION_SAFE: dangerous keys in the dependency override never
  // reach Object.prototype (cloneRouter may reject them, but must not pollute).
  test.prop([fc.constantFrom("__proto__", "constructor", "prototype")], {
    numRuns: NUM_RUNS.fast,
  })("dangerous dependency keys never pollute Object.prototype", (evilKey) => {
    const source = createFixtureRouter();
    const evil = JSON.parse(`{"${evilKey}":{"polluted":true}}`) as Record<
      string,
      unknown
    >;

    try {
      cloneRouter(source as never, evil as never);
    } catch {
      // A core invariant-guard rejection is acceptable; prototype pollution is not.
    }

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  // FRESH_FSM: regardless of the source's lifecycle state, the clone starts with
  // no state and is not active.
  test.prop([arbStartPath], { numRuns: NUM_RUNS.standard })(
    "clone of a started source is a fresh, inactive router",
    async (startPath) => {
      const source = createFixtureRouter();

      await source.start(startPath);

      const clone = cloneRouter(source);

      expect(clone.getState()).toBeUndefined();
      expect(clone.isActive()).toBe(false);

      source.stop();
    },
  );

  // DISPOSE_ISOLATION: disposing the source never affects an already-created
  // clone — it starts and navigates independently.
  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "dispose(source) does not affect an already-created clone",
    async (routeName) => {
      // clone starts on "home" ("/"); navigating to it would be SAME_STATES.
      fc.pre(routeName !== "home");

      const source = createFixtureRouter();
      const clone = cloneRouter(source);

      source.dispose();

      await clone.start("/");

      const state = await clone.navigate(
        routeName,
        getParamsForRoute(routeName),
      );

      expect(state.name).toBe(routeName);

      clone.stop();
    },
  );
});

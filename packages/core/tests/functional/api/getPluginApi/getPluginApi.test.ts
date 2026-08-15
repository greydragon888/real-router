import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  createRouter,
  errorCodes,
  events,
  RouterError,
} from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

let router: Router;
let api: PluginApi;

describe("getPluginApi()", () => {
  beforeEach(() => {
    router = createTestRouter();
    api = getPluginApi(router);
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  it("should return an object with all expected methods", () => {
    expect(typeof api.makeState).toBe("function");
    expect(typeof api.forwardState).toBe("function");
    expect(typeof api.matchPath).toBe("function");
    expect(typeof api.setRootPath).toBe("function");
    expect(typeof api.getRootPath).toBe("function");
    expect(typeof api.addEventListener).toBe("function");
    expect(typeof api.buildNavigationState).toBe("function");
    expect(typeof api.getOptions).toBe("function");
    expect(typeof api.getTree).toBe("function");
    expect(typeof api.addInterceptor).toBe("function");
    expect(typeof api.extendRouter).toBe("function");
  });

  it("should return the cached instance on each call for the same router (#525)", () => {
    // Mirrors getNavigator()'s WeakMap-cached behaviour: avoids repeated
    // closure allocations and gives spy/stub helpers a stable identity to
    // attach to (browser-plugin/hash-plugin/navigation-plugin recovery
    // tests spy on `getPluginApi(router).navigateToState`).
    const api2 = getPluginApi(router);

    expect(api).toBe(api2);
  });

  it("should return a different instance per router", () => {
    const router2 = createTestRouter();

    expect(getPluginApi(router)).not.toBe(getPluginApi(router2));

    router2.stop();
  });

  it("makeState should delegate to router.makeState", () => {
    const state = api.makeState("home", {}, undefined, "/home");

    expect(state.name).toBe("home");
    expect(state.path).toBe("/home");
  });

  it("forwardState should delegate to router.forwardState", () => {
    const result = api.forwardState("home", {});

    expect(result.name).toBe("home");
  });

  it("addInterceptor('forwardState') should wrap forwardState", () => {
    const unsub = api.addInterceptor(
      "forwardState",
      (_next, _name, params) => ({
        name: "users",
        params,
        search: {},
      }),
    );

    expect(api.forwardState("home", {}).name).toBe("users");

    unsub();

    expect(api.forwardState("home", {}).name).toBe("home");
  });

  it("matchPath should delegate to router.matchPath", () => {
    const state = api.matchPath("/home");

    expect(state).toBeDefined();
    expect(state!.name).toBe("home");
  });

  it("setRootPath/getRootPath should delegate to router", () => {
    api.setRootPath("/app");

    expect(api.getRootPath()).toBe("/app");

    api.setRootPath("");
  });

  it("addEventListener should register event listeners", async () => {
    await router.start("/home");
    let called = false;
    const unsub = api.addEventListener(events.TRANSITION_SUCCESS, () => {
      called = true;
    });

    await router.navigate("users");

    expect(called).toBe(true);

    unsub();
  });

  it("getOptions should delegate to router.getOptions", () => {
    const opts = api.getOptions();

    expect(opts).toBeDefined();
    expect(opts.defaultRoute).toBe("home");
  });

  it("getTree should delegate to router.getTree", () => {
    const tree = api.getTree() as { children: ReadonlyMap<string, unknown> };

    expect(tree).toBeDefined();
    expect(tree.children.size).toBeGreaterThan(0);
  });

  it("matchPath should return undefined for non-matching path", () => {
    const result = api.matchPath("/no-such-route");

    expect(result).toBeUndefined();
  });

  it("should throw ROUTER_DISPOSED for addEventListener after dispose", () => {
    router.dispose();

    const disposedApi = getPluginApi(router);

    expect(() => {
      disposedApi.addEventListener(events.TRANSITION_SUCCESS, () => {});
    }).toThrow(RouterError);
  });

  it("should throw ROUTER_DISPOSED for setRootPath after dispose", () => {
    router.dispose();

    const disposedApi = getPluginApi(router);

    expect(() => {
      disposedApi.setRootPath("/app");
    }).toThrow(RouterError);
  });

  it("should throw TypeError for invalid router instance", () => {
    expect(() => getPluginApi({} as Router)).toThrow(TypeError);
  });
});

describe("setRootPath refuses while a navigation is in flight (#1755)", () => {
  /**
   * `applyRootPath` rebuilds tree AND matcher from the same definitions, so
   * every route name survives and every route PATH moves. That is the whole-tree
   * destruction `clear` and `replace` are refused for mid-navigation — and
   * `setRootPath` was the one member of the family that applied anyway.
   *
   * Measured before the gate: an activation guard calling it made its OWN
   * navigation resolve and commit `{ name: "users", path: "/users" }` while
   * `buildPath("users")` had become `/app/users` and nothing owned `/users`.
   * Every URL plugin writes that path to the address bar, so the next Back is a
   * 404 for the route the router believes it is on.
   *
   * ⚠ Deliberately NOT a commit-door fix. The committed state is identical
   * whether the call lands mid-navigation or one statement after it — measured
   * both ways — so widening `completeTransition` to ask ownership would pay the
   * #307 hot path to catch half a class. What is specific to the window is that
   * a destructive tree-wide mutator ran where its siblings refuse; the residual
   * "setRootPath does not revalidate" is #1752's Gap B.
   */
  const routes = [
    { name: "home", path: "/home" },
    { name: "users", path: "/users" },
  ];

  it("does not apply, and the in-flight navigation commits a consistent state", async () => {
    const r = createRouter(routes, { allowNotFound: true });

    await r.start("/home");

    getLifecycleApi(r).addActivateGuard("users", () => () => {
      getPluginApi(r).setRootPath("/app");

      return true;
    });

    await expect(r.navigate("users")).resolves.toBeDefined();

    // The discriminator is not the throw (there is none) but the STATE: before
    // the gate this committed `/users` while `buildPath` said `/app/users`.
    expect(getPluginApi(r).getRootPath()).toBe("");
    expect(r.getState()?.path).toBe("/users");
    expect(r.buildPath("users")).toBe("/users");

    r.dispose();
  });

  it("is a logged no-op, not a throw — the navigation is unaffected", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = createRouter(routes, { allowNotFound: true });

    await r.start("/home");

    let threw: unknown;

    getLifecycleApi(r).addActivateGuard("users", () => () => {
      try {
        getPluginApi(r).setRootPath("/app");
      } catch (error) {
        threw = error;
      }

      return true;
    });

    await r.navigate("users");

    // The family's own rule: a condition that clears by itself gets a log, one
    // that never does gets a throw. A navigation settles; a `TREE_CHANGED`
    // dispatch (the ban beside this one) cannot be waited out from inside it.
    expect(threw).toBeUndefined();
    expect(r.getState()?.name).toBe("users");
    // ⚠ The LOG half is asserted too. Without this the "logged no-op" claim was
    // half-unpinned: silence and a log are indistinguishable to every other
    // assertion here, and silence is the outcome the refusal exists to avoid.
    expect(
      errorSpy.mock.calls.some((call) =>
        String(call[0]).includes("[router.setRootPath]"),
      ),
    ).toBe(true);

    errorSpy.mockRestore();
    r.dispose();
  });

  it("refuses from a canDeactivate guard too — the TRANSITION_STARTED half", async () => {
    // ⚠ The cell that pins the PREDICATE rather than the policy. Every other
    // in-flight cell here runs from an activation guard or a `subscribeLeave`
    // listener, i.e. `LEAVE_APPROVED` — so substituting `isLeaveApproved()` for
    // `isTransitioning()` left the whole suite green while a `canDeactivate`
    // guard reproduced the full damage. `isTransitioning()` spans BOTH bands,
    // and this is the only test that says so.
    const r = createRouter(routes, { allowNotFound: true });

    await r.start("/home");

    getLifecycleApi(r).addDeactivateGuard("home", () => () => {
      getPluginApi(r).setRootPath("/app");

      return true;
    });

    await r.navigate("users");

    expect(getPluginApi(r).getRootPath()).toBe("");
    expect(r.buildPath("users")).toBe("/users");

    r.dispose();
  });

  it("reports the refusal — a teardown cannot wait for the navigation", async () => {
    // The one place this door departs from its `void` + log siblings. The
    // refusal's justification is "the condition clears by itself", which is
    // false for a `teardown()`: the plugin will never call again, so a refused
    // restore is permanent. Returning `void` made it undetectable — measured, a
    // plugin holding a path prefix leaked it forever when torn down in flight.
    const r = createRouter(routes, { allowNotFound: true });

    await r.start("/home");

    let applied: boolean | undefined;
    let appliedAfter: boolean | undefined;

    getLifecycleApi(r).addActivateGuard("users", () => () => {
      applied = getPluginApi(r).setRootPath("/app");

      return true;
    });

    await r.navigate("users");

    appliedAfter = getPluginApi(r).setRootPath("/app");

    expect(applied).toBe(false);
    expect(appliedAfter).toBe(true);
    expect(getPluginApi(r).getRootPath()).toBe("/app");

    r.dispose();
  });

  it("allows a QUERY-only change in the same window — it moves no paths", async () => {
    // The gate is scoped to the PATH half of the root, and that scoping is not
    // a nicety. `@real-router/persistent-params-plugin` declares its keys with
    // a query-only root and restores the original in `teardown()`; the
    // whole-string form silently refused that restore when `unsubscribe()` was
    // reached from a guard or a leave listener, leaving the keys declared on a
    // router the caller believed was clean — with no throw for the plugin's own
    // `catch` to see. Measured with the gate off: `"" → "/app"` commits a
    // `state.path` the tree cannot match, while `"" → "?lang"` and its inverse
    // both commit a state that still round-trips.
    const r = createRouter(routes, { allowNotFound: true });

    await r.start("/home");

    getLifecycleApi(r).addActivateGuard("users", () => () => {
      getPluginApi(r).setRootPath("?lang");

      return true;
    });

    await r.navigate("users");

    expect(getPluginApi(r).getRootPath()).toBe("?lang");
    // and the in-flight navigation still committed something coherent
    expect(r.getState()?.path).toBe("/users");
    expect(r.buildPath("users")).toBe("/users");

    r.dispose();
  });

  it("refuses when the PATH half moves even if the query half is untouched", async () => {
    const r = createRouter(routes, { allowNotFound: true });

    getPluginApi(r).setRootPath("/app?lang");

    await r.start("/app/home");

    getLifecycleApi(r).addActivateGuard("users", () => () => {
      // query half identical, path half moves — still the damaging half
      getPluginApi(r).setRootPath("/other?lang");

      return true;
    });

    await r.navigate("users");

    expect(getPluginApi(r).getRootPath()).toBe("/app?lang");

    r.dispose();
  });

  it("CONTROL — applies before start()", () => {
    // Split from the settled-router control below: as one test the first
    // `expect` aborts before the second half is built, so "always refuse" reds
    // one case and hides the other.
    const r = createRouter(routes, { allowNotFound: true });

    getPluginApi(r).setRootPath("/app");

    expect(getPluginApi(r).getRootPath()).toBe("/app");

    r.dispose();
  });

  it("CONTROL — applies after a navigation settles", async () => {
    const r = createRouter(routes, { allowNotFound: true });

    await r.start("/home");
    await r.navigate("users");
    getPluginApi(r).setRootPath("/app");

    expect(getPluginApi(r).getRootPath()).toBe("/app");

    r.dispose();
  });

  it("CONTROL — the disposed check and the reentrancy ban still win", async () => {
    const disposed = createRouter(routes, { allowNotFound: true });

    disposed.dispose();

    expect(() => {
      getPluginApi(disposed).setRootPath("/app");
    }).toThrow(RouterError);

    // The reentrancy ban throws where this one logs, and it is ordered ABOVE
    // the new gate: inside a TREE_CHANGED dispatch there is no navigation in
    // flight, so only the ban can speak.
    const emitting = createRouter(routes, { allowNotFound: true });
    let code: string | undefined;

    getRoutesApi(emitting).subscribeChanges(() => {
      try {
        getPluginApi(emitting).setRootPath("/x");
      } catch (error) {
        code = (error as RouterError).code;
      }
    });

    getRoutesApi(emitting).add({ name: "extra", path: "/extra" });

    expect(code).toBe(errorCodes.REENTRANT_TREE_MUTATION);
    expect(getPluginApi(emitting).getRootPath()).toBe("");

    emitting.dispose();
  });

  it("the ban still wins when BOTH conditions hold — order is observable", async () => {
    // The only cell where the two predicates are true together: a guard adds a
    // route mid-navigation, the resulting TREE_CHANGED dispatch reaches a
    // handler, and that handler calls `setRootPath`. `isTransitioning()` is
    // true AND a dispatch is on the stack.
    //
    // The ban has to win. It is the stronger statement — a structural violation
    // that no amount of waiting fixes — and it is LOUD, where the new gate is a
    // log the caller can miss. Putting the gate first turns this into a silent
    // no-op, and nothing else in the suite separates the two orderings.
    const r = createRouter(routes, { allowNotFound: true });

    await r.start("/home");

    let code: string | undefined;
    let sawDispatch = false;

    getRoutesApi(r).subscribeChanges(() => {
      sawDispatch = true;

      try {
        getPluginApi(r).setRootPath("/x");
      } catch (error) {
        code = (error as RouterError).code;
      }
    });

    getLifecycleApi(r).addActivateGuard("users", () => () => {
      getRoutesApi(r).add({ name: "extra", path: "/extra" });

      return true;
    });

    await r.navigate("users");

    expect(sawDispatch).toBe(true);
    expect(code).toBe(errorCodes.REENTRANT_TREE_MUTATION);

    r.dispose();
  });
});

import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  createRouter,
  errorCodes,
  RouterError,
  UNKNOWN_ROUTE,
} from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { NavigationOptions, Router } from "@real-router/core";
import type { LifecycleApi, RoutesApi } from "@real-router/core/api";

let router: Router;
let routesApi: RoutesApi;
let lifecycle: LifecycleApi;

describe("core/routes/replaceRoutes", () => {
  beforeEach(async () => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
    lifecycle = getLifecycleApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    try {
      router.stop();
    } catch {
      // router may have been disposed in the test
    }
  });

  // ============================================================================
  // Basic functionality
  // ============================================================================

  describe("basic functionality", () => {
    it("should replace all routes with new ones", () => {
      // Verify old route exists before replace
      expect(getPluginApi(router).matchPath("/home")).toBeDefined();

      routesApi.replace([
        { name: "new-home", path: "/new-home" },
        { name: "new-about", path: "/new-about" },
      ]);

      // Old routes are gone
      expect(getPluginApi(router).matchPath("/home")).toBeUndefined();
      // New routes are accessible
      expect(getPluginApi(router).matchPath("/new-home")?.name).toBe(
        "new-home",
      );
      expect(getPluginApi(router).matchPath("/new-about")?.name).toBe(
        "new-about",
      );
    });

    it("should accept a single route (not array)", () => {
      routesApi.replace({ name: "single", path: "/single" });

      expect(routesApi.has("single")).toBe(true);
      expect(routesApi.has("home")).toBe(false);
    });

    it("should clear all routes when replaced with empty array", () => {
      expect(getPluginApi(router).matchPath("/home")).toBeDefined();

      routesApi.replace([]);

      expect(getPluginApi(router).matchPath("/home")).toBeUndefined();
      expect(getPluginApi(router).matchPath("/")).toBeUndefined();
    });

    it("should make old routes inaccessible after replace (has returns false)", () => {
      // createTestRouter has home, users, admin etc.
      expect(routesApi.has("home")).toBe(true);
      expect(routesApi.has("users")).toBe(true);

      routesApi.replace([{ name: "fresh", path: "/fresh" }]);

      expect(routesApi.has("home")).toBe(false);
      expect(routesApi.has("users")).toBe(false);
    });

    it("should make new routes accessible via has() after replace", () => {
      expect(routesApi.has("brand-new")).toBe(false);

      routesApi.replace([
        { name: "brand-new", path: "/brand-new" },
        { name: "another-new", path: "/another-new" },
      ]);

      expect(routesApi.has("brand-new")).toBe(true);
      expect(routesApi.has("another-new")).toBe(true);
    });
  });

  // ============================================================================
  // Configuration cleanup and registration
  // ============================================================================

  describe("configuration cleanup and registration", () => {
    it("should clear decoders of old routes after replace", () => {
      const decodeParams = vi.fn((params) => ({
        ...params,
        decoded: true,
      }));

      routesApi.add({
        name: "with-decoder",
        path: "/with-decoder/:id",
        decodeParams,
      });

      // Decoder works before replace
      expect(
        getPluginApi(router).matchPath("/with-decoder/123")?.params.decoded,
      ).toBe(true);
      expect(decodeParams).toHaveBeenCalledTimes(1);

      // Replace removes old routes
      routesApi.replace([{ name: "fresh", path: "/fresh" }]);

      // Old route is gone
      expect(
        getPluginApi(router).matchPath("/with-decoder/123"),
      ).toBeUndefined();
      // Decoder was not called again
      expect(decodeParams).toHaveBeenCalledTimes(1);
    });

    it("should register decoders/encoders of new routes after replace", () => {
      const decode = vi.fn((params) => ({ ...params, id: Number(params.id) }));
      const encode = vi.fn((params) => ({
        ...params,
        id: String(params.id),
      }));

      routesApi.replace([
        {
          name: "new-with-codecs",
          path: "/new-with-codecs/:id",
          decodeParams: decode,
          encodeParams: encode,
        },
      ]);

      // Decoder is registered and works
      const state = getPluginApi(router).matchPath("/new-with-codecs/42");

      expect(decode).toHaveBeenCalled();
      expect(state?.params.id).toBe(42);

      // Encoder is registered and works
      router.buildPath("new-with-codecs", { id: 42 });

      expect(encode).toHaveBeenCalled();
    });

    it("should clear defaultParams of old routes after replace", () => {
      routesApi.add({
        name: "with-defaults",
        path: "/with-defaults",
        defaultParams: { page: 1, limit: 10 },
      });

      // Defaults work before replace
      expect(
        getPluginApi(router).makeState("with-defaults").params,
      ).toStrictEqual({ page: 1, limit: 10 });

      routesApi.replace([{ name: "new-route", path: "/new-route" }]);

      expect(routesApi.has("with-defaults")).toBe(false);
    });

    it("should register defaultParams of new routes after replace", () => {
      routesApi.replace([
        {
          name: "new-with-defaults",
          path: "/new-with-defaults",
          defaultParams: { tab: "overview" },
        },
      ]);

      const state = getPluginApi(router).makeState("new-with-defaults");

      expect(state.params).toStrictEqual({ tab: "overview" });
    });

    it("should recalculate forwardMap with no stale entries", () => {
      routesApi.add({ name: "target", path: "/target" });
      routesApi.add({
        name: "redirect",
        path: "/redirect",
        forwardTo: "target",
      });

      // Forward works before replace
      expect(getPluginApi(router).forwardState("redirect", {}).name).toBe(
        "target",
      );

      // Replace with fresh routes — old redirect is gone
      routesApi.replace([
        { name: "new-a", path: "/new-a" },
        { name: "new-b", path: "/new-b", forwardTo: "new-a" },
      ]);

      // Old redirect is gone
      expect(routesApi.has("redirect")).toBe(false);
      // New forward works
      expect(getPluginApi(router).forwardState("new-b", {}).name).toBe("new-a");
    });

    it("should clear custom fields of old routes after replace", () => {
      // Add a route with a custom field
      routesApi.add({
        name: "with-custom",
        path: "/with-custom",
        ...({ someCustomField: "custom-value" } as Record<string, unknown>),
      });

      // Verify custom field is registered
      const configBefore = getPluginApi(router).getRouteConfig("with-custom");

      expect(configBefore?.someCustomField).toBe("custom-value");

      routesApi.replace([{ name: "fresh", path: "/fresh" }]);

      // Old route with custom field is gone
      expect(routesApi.has("with-custom")).toBe(false);
      expect(
        getPluginApi(router).getRouteConfig("with-custom"),
      ).toBeUndefined();
    });
  });

  // ============================================================================
  // Lifecycle handlers
  // ============================================================================

  describe("lifecycle handlers", () => {
    it("should clear definition guards of old routes on replace", async () => {
      routesApi.add({
        name: "protected",
        path: "/protected",
        canActivate: () => () => false, // blocking definition guard
      });

      // Guard blocks navigation before replace
      await expect(router.navigate("protected")).rejects.toThrow();

      // Replace: re-add same route path but without guard
      routesApi.replace([
        { name: "home", path: "/home" },
        { name: "protected", path: "/protected" }, // no guard
      ]);

      // Definition guard is cleared — navigation works now
      await router.navigate("protected");

      expect(router.getState()?.name).toBe("protected");
    });

    it("should register definition guards of new routes on replace", async () => {
      routesApi.replace([
        {
          name: "new-protected",
          path: "/new-protected",
          canActivate: () => () => false, // blocking guard
        },
      ]);

      // Guard is registered for new route
      await expect(router.navigate("new-protected")).rejects.toThrow();
    });

    it("should preserve external guards (addActivateGuard) on replace", async () => {
      routesApi.add({ name: "ext-guarded", path: "/ext-guarded" });
      lifecycle.addActivateGuard("ext-guarded", () => () => false); // external guard

      // External guard blocks navigation
      await expect(router.navigate("ext-guarded")).rejects.toThrow();

      // Replace: re-add the route
      routesApi.replace([
        { name: "home", path: "/home" },
        { name: "ext-guarded", path: "/ext-guarded" },
      ]);

      // External guard is STILL preserved — navigation still blocked
      await expect(router.navigate("ext-guarded")).rejects.toThrow();
    });

    it("should preserve external guard for removed route (usable after re-add)", async () => {
      routesApi.add({ name: "removed-route", path: "/removed" });
      lifecycle.addActivateGuard("removed-route", () => () => false);

      // Replace removing the route
      routesApi.replace([{ name: "home", path: "/home" }]);

      // Route is gone
      expect(routesApi.has("removed-route")).toBe(false);

      // Add route back
      routesApi.add({ name: "removed-route", path: "/removed" });

      // External guard is still in place
      await expect(router.navigate("removed-route")).rejects.toThrow();
    });

    it("should treat routesApi.update({ canActivate }) as definition guard (cleared on replace)", async () => {
      routesApi.add({ name: "updated", path: "/updated" });
      routesApi.update("updated", { canActivate: () => () => false }); // definition guard via update

      // Update-registered guard blocks navigation
      await expect(router.navigate("updated")).rejects.toThrow();

      // Replace with same route but no guard
      routesApi.replace([
        { name: "home", path: "/home" },
        { name: "updated", path: "/updated" },
      ]);

      // Guard is cleared (definition guard from update is tracked and removed)
      await router.navigate("updated");

      expect(router.getState()?.name).toBe("updated");
    });

    it("should treat routesApi.update({ canDeactivate }) as definition guard (cleared on replace)", async () => {
      // Mirror of the canActivate-via-update test for the update() canDeactivate
      // branch: the guard must be registered as definition-sourced
      // (isFromDefinition=true), so replace() clears it. If it were tracked as
      // external, it would survive replace() and keep blocking.
      routesApi.add({ name: "updated", path: "/updated" });
      routesApi.update("updated", { canDeactivate: () => () => false });

      await router.navigate("updated");

      // Update-registered canDeactivate blocks leaving
      await expect(router.navigate("home")).rejects.toThrow();

      // Replace with same route but no guard
      routesApi.replace([
        { name: "home", path: "/home" },
        { name: "updated", path: "/updated" },
      ]);

      // Definition guard from update is tracked and removed — can leave now
      await router.navigate("home");

      expect(router.getState()?.name).toBe("home");
    });

    it("should clear definition canDeactivate guards on replace", async () => {
      routesApi.add({
        name: "sticky-def",
        path: "/sticky-def",
        canDeactivate: () => () => false, // definition deactivate guard
      });

      await router.navigate("sticky-def");

      // Definition deactivate guard blocks leaving
      await expect(router.navigate("home")).rejects.toThrow();

      // Replace without deactivate guard (state revalidation keeps us on sticky-def)
      routesApi.replace([
        { name: "home", path: "/home" },
        { name: "sticky-def", path: "/sticky-def" }, // no canDeactivate
      ]);

      // Definition guard is cleared — can leave now
      await router.navigate("home");

      expect(router.getState()?.name).toBe("home");
    });

    it("should handle definition canActivate + external canDeactivate on replace correctly", async () => {
      routesApi.add({
        name: "cross-type",
        path: "/cross-type",
        canActivate: () => () => false, // definition activate guard
      });
      lifecycle.addDeactivateGuard("cross-type", () => () => false); // external deactivate guard

      // Navigate to home first so we can test deactivate
      await router.navigate("index");

      // After replace with same route but no canActivate:
      routesApi.replace([
        { name: "home", path: "/home" },
        { name: "cross-type", path: "/cross-type" }, // no canActivate
      ]);

      // Definition canActivate is cleared — can navigate to the route
      await router.navigate("cross-type");

      expect(router.getState()?.name).toBe("cross-type");

      // External canDeactivate is preserved — cannot leave the route
      await expect(router.navigate("home")).rejects.toThrow();
    });

    it("should preserve external canDeactivate guards on replace", async () => {
      routesApi.add({ name: "sticky", path: "/sticky" });
      lifecycle.addDeactivateGuard("sticky", () => () => false);

      await router.navigate("sticky");

      // Replace: re-add sticky route
      routesApi.replace([
        { name: "home", path: "/home" },
        { name: "sticky", path: "/sticky" },
      ]);

      // External deactivate guard preserved — cannot leave sticky
      await expect(router.navigate("home")).rejects.toThrow();
    });

    it("keeps the external guard effective after replace() adds a definition guard (external wins, #1174)", async () => {
      routesApi.add({ name: "contested", path: "/contested" });
      // External guard that allows navigation
      lifecycle.addActivateGuard("contested", () => () => true);

      // Navigation works with permissive external guard
      await router.navigate("contested");

      expect(router.getState()?.name).toBe("contested");

      // Replace with a blocking definition guard. Under external-wins (#1174) the
      // external guard added above — preserved across replace() by #1192 — stays
      // effective; the definition does NOT override it (registration order is now
      // irrelevant, external always wins).
      routesApi.replace([
        { name: "home", path: "/home" },
        {
          name: "contested",
          path: "/contested",
          canActivate: () => () => false, // definition blocks — but external wins
        },
      ]);

      await router.navigate("home");

      // Surviving external guard (allow) still wins → navigation succeeds.
      await router.navigate("contested");

      expect(router.getState()?.name).toBe("contested");
    });

    it("replace() clears the definition slot but preserves a co-existing external guard's compiled function (cross-origin)", async () => {
      // "cross" carries BOTH a definition canActivate (blocks) AND an external
      // addActivateGuard (allows). External wins at compile time, so navigation
      // is allowed. On replace(), clearDefinitionGuards must drop the definition
      // factory WITHOUT deleting the compiled function (the external slot still
      // holds it) — so the external guard keeps working after the swap.
      routesApi.add({
        name: "cross",
        path: "/cross",
        canActivate: () => () => false, // definition: block
      });
      lifecycle.addActivateGuard("cross", () => () => true); // external: allow (wins)

      // External wins → navigation allowed.
      await router.navigate("cross");

      expect(router.getState()?.name).toBe("cross");

      await router.navigate("home");

      // Replace WITHOUT a definition guard for "cross" — definition is cleared,
      // the external guard's compiled function must survive.
      routesApi.replace([
        { name: "home", path: "/home" },
        { name: "cross", path: "/cross" }, // no canActivate
      ]);

      // Surviving external guard (allow) still applies.
      await router.navigate("cross");

      expect(router.getState()?.name).toBe("cross");
    });

    it("replace() preserves a co-existing external canDeactivate guard's compiled function (cross-origin, symmetric)", async () => {
      routesApi.add({
        name: "cd",
        path: "/cd",
        canDeactivate: () => () => true, // definition: allow leaving
      });
      lifecycle.addDeactivateGuard("cd", () => () => false); // external: block (wins)

      await router.navigate("cd");

      expect(router.getState()?.name).toBe("cd");

      // Replace WITHOUT a definition canDeactivate — definition slot cleared,
      // the external (blocking) compiled function must survive.
      routesApi.replace([
        { name: "home", path: "/home" },
        { name: "cd", path: "/cd" }, // no canDeactivate
      ]);

      // Surviving external guard still blocks leaving.
      await expect(router.navigate("home")).rejects.toMatchObject({
        code: errorCodes.CANNOT_DEACTIVATE,
      });
    });

    it("should have no stale entries after removeActivateGuard + replace", async () => {
      // Route with an EXTERNAL activate guard — `addActivateGuard` registers the
      // external slot, which is exactly what `removeActivateGuard` clears
      // (external-only, #1171).
      routesApi.add({ name: "removable", path: "/removable" });
      lifecycle.addActivateGuard("removable", () => () => false);

      // Remove the external guard — clears the entry from #externalActivateFactories.
      lifecycle.removeActivateGuard("removable");

      // Navigation works now (external guard removed)
      await router.navigate("removable");

      expect(router.getState()?.name).toBe("removable");

      // Replace without guard — should not throw or leave stale tracking
      routesApi.replace([
        { name: "home", path: "/home" },
        { name: "removable", path: "/removable" }, // no guard
      ]);

      // Navigation still works — no stale guard entry
      await router.navigate("home");
      await router.navigate("removable");

      expect(router.getState()?.name).toBe("removable");
    });
  });

  // ============================================================================
  // State preservation
  // ============================================================================

  describe("state preservation", () => {
    it("should preserve state if current route exists in new tree", async () => {
      await router.navigate("index");

      expect(router.getState()?.name).toBe("index");

      routesApi.replace([
        { name: "index", path: "/" },
        { name: "about", path: "/about" },
      ]);

      // State is preserved — index still exists in new tree
      expect(router.getState()?.name).toBe("index");
    });

    it("notifies router.subscribe listeners when replace() revalidates the active state (#950)", async () => {
      await router.navigate("index");

      const seen: (string | undefined)[] = [];

      router.subscribe(({ route }) => seen.push(route?.name));

      routesApi.replace([
        { name: "index", path: "/" },
        { name: "about", path: "/about" },
      ]);

      // Before #950 the revalidation wrote state without emitting, so the
      // listener stayed silent and adapters rendered the pre-replace state.
      expect(seen).toContain("index");
    });

    it("surfaces UNKNOWN_ROUTE and notifies subscribers if the active route is removed from the new tree (#950)", async () => {
      await router.navigate("index");

      expect(router.getState()?.name).toBe("index");

      const seen: (string | undefined)[] = [];

      router.subscribe(({ route }) => seen.push(route?.name));

      // Replace without index — the active route no longer matches.
      routesApi.replace([{ name: "completely-new", path: "/completely-new" }]);

      // Dropped route surfaces as not-found (was a silent clear before #950),
      // and the subscriber is notified.
      expect(router.getState()?.name).toBe(UNKNOWN_ROUTE);
      expect(seen).toContain(UNKNOWN_ROUTE);
    });

    it("should not throw when state is undefined (router not started)", () => {
      const unstartedRouter = createTestRouter();
      const api = getRoutesApi(unstartedRouter);

      // No state exists — should not throw
      expect(() => {
        api.replace([{ name: "new", path: "/new" }]);
      }).not.toThrow();

      expect(getPluginApi(unstartedRouter).matchPath("/new")?.name).toBe("new");
    });

    it("surfaces UNKNOWN_ROUTE after replace([]) when router was navigated (#950)", async () => {
      await router.navigate("index");

      expect(router.getState()?.name).toBe("index");

      routesApi.replace([]);

      // The active route is gone with no replacement — not-found, not a silent
      // clear (#950).
      expect(router.getState()?.name).toBe(UNKNOWN_ROUTE);
    });
  });

  // ============================================================================
  // Atomicity
  // ============================================================================

  describe("atomicity", () => {
    it("should preserve external guards after replace([]) — unlike clear()", async () => {
      routesApi.add({ name: "ext-guarded", path: "/ext-guarded" });
      lifecycle.addActivateGuard("ext-guarded", () => () => false);

      // Replace with empty array
      routesApi.replace([]);

      // Re-add the route
      routesApi.add({ name: "ext-guarded", path: "/ext-guarded" });

      // External guard is still in place (replace preserves external guards, clear does not)
      await expect(router.navigate("ext-guarded")).rejects.toThrow();
    });
  });

  // ============================================================================
  // Router lifecycle states
  // ============================================================================

  describe("router lifecycle states", () => {
    it("should work on unstarted router (no state)", () => {
      const unstartedRouter = createTestRouter();
      const api = getRoutesApi(unstartedRouter);

      expect(() => {
        api.replace([{ name: "fresh-route", path: "/fresh-route" }]);
      }).not.toThrow();

      expect(api.has("fresh-route")).toBe(true);
    });

    it("should work on stopped router", async () => {
      await router.navigate("index");
      router.stop();

      expect(() => {
        routesApi.replace([{ name: "after-stop", path: "/after-stop" }]);
      }).not.toThrow();

      expect(routesApi.has("after-stop")).toBe(true);
    });

    it("should throw RouterError(ROUTER_DISPOSED) after dispose", () => {
      router.dispose();

      let caught: unknown;

      try {
        routesApi.replace([{ name: "after-dispose", path: "/after-dispose" }]);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(RouterError);
      expect((caught as RouterError).code).toBe(errorCodes.ROUTER_DISPOSED);
    });

    // #1204: replace() during the STARTING window — inside an async start
    // interceptor, before next(). validateClearRoutes gates only on
    // isTransitioning(), which covers TRANSITION_STARTED/LEAVE_APPROVED but NOT
    // STARTING, so replace() PROCEEDS here (unlike mid-navigation, where it is a
    // logged no-op — see "blocking during navigation"). No committed state exists
    // yet, so no revalidation runs; the in-flight start(path) resolves into the
    // freshly-swapped tree. Pins browser-plugin-style lazy tree-swap.
    it("proceeds mid-STARTING (async start interceptor) — start() lands in the swapped tree", async () => {
      const lazyRouter = createRouter([{ name: "home", path: "/" }], {
        allowNotFound: false, // a miss REJECTS, so resolving to 'lazy' is load-bearing
      });
      const lazyApi = getRoutesApi(lazyRouter);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      getPluginApi(lazyRouter).addInterceptor("start", async (next, path) => {
        lazyApi.replace([
          { name: "home", path: "/" },
          { name: "lazy", path: "/lazy" },
        ]); // FSM is STARTING → validateClearRoutes does not block

        return next(path);
      });

      const state = await lazyRouter.start("/lazy");

      expect(state.name).toBe("lazy"); // start resolved into the swapped tree
      expect(lazyApi.has("lazy")).toBe(true);
      // replace mid-STARTING is NOT a logged no-op (contrast: mid-navigation IS)
      expect(errorSpy).not.toHaveBeenCalled();

      errorSpy.mockRestore();
      lazyRouter.dispose();
    });
  });

  // ============================================================================
  // Blocking during navigation
  // ============================================================================

  describe("blocking during navigation", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    it("is a logged no-op during active navigation (logger.error, no exception)", async () => {
      let resolveCanActivate!: () => void;

      routesApi.add({
        name: "async-route",
        path: "/async-route",
        canActivate: () => () =>
          new Promise<boolean>((resolve) => {
            resolveCanActivate = () => {
              resolve(true);
            };
          }),
      });

      // Start navigation (will be held by the guard)
      const navigationPromise = router
        .navigate("async-route")
        .then(() => true)
        .catch(() => false);

      // Give time for navigation to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Replace during navigation — should be blocked (logged no-op)
      routesApi.replace([{ name: "replacement", path: "/replacement" }]);

      // Logger should have been called
      expect(errorSpy).toHaveBeenCalled();

      // Routes should be UNCHANGED (replace was blocked)
      expect(routesApi.has("home")).toBe(true);
      expect(routesApi.has("async-route")).toBe(true);
      expect(routesApi.has("replacement")).toBe(false);

      // Resolve guard to let navigation complete
      resolveCanActivate();
      await navigationPromise;
    });
  });

  describe("reentrancy", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    it("is a logged no-op when called from a subscribeLeave listener (LEAVE_APPROVED phase)", async () => {
      let replaceRan = false;

      const unsub = router.subscribeLeave(() => {
        // isTransitioning() is true in LEAVE_APPROVED → replace must no-op.
        routesApi.replace([
          { name: "leave-replaced", path: "/leave-replaced" },
        ]);
        replaceRan = true;
      });

      await router.navigate("admin.dashboard");

      expect(replaceRan).toBe(true); // listener fired in the LEAVE_APPROVED phase
      expect(errorSpy).toHaveBeenCalled(); // blocked via logger.error
      // Tree UNCHANGED — the mid-transition replace was a no-op.
      expect(routesApi.has("home")).toBe(true);
      expect(routesApi.has("admin.dashboard")).toBe(true);
      expect(routesApi.has("leave-replaced")).toBe(false);

      unsub();
    });

    it("is allowed when called from a subscribe listener (post-commit, READY)", async () => {
      let replaced = false;

      const unsub = router.subscribe(() => {
        if (replaced) {
          return;
        }

        replaced = true;
        // FSM is READY at TRANSITION_SUCCESS (isTransitioning() false) → allowed.
        routesApi.replace([{ name: "post-commit", path: "/post-commit" }]);
      });

      await router.navigate("admin.dashboard");

      expect(replaced).toBe(true);
      expect(errorSpy).not.toHaveBeenCalled(); // not blocked
      // The reentrant replace took effect — old tree swapped out.
      expect(routesApi.has("post-commit")).toBe(true);
      expect(routesApi.has("home")).toBe(false);
      expect(routesApi.has("admin.dashboard")).toBe(false);

      unsub();
    });

    it("coalesces a runaway replace-from-subscribe loop — no recursion, no throw", () => {
      // A subscribe (TRANSITION_SUCCESS) listener that replaces UNCONDITIONALLY:
      // each replace revalidates the active state and would re-emit
      // TRANSITION_SUCCESS (#950), re-entering the listener. The emitter coalesces
      // that re-entrant SUCCESS emit (#1033) — the listener runs exactly once, no
      // recursion, no error. (Before #1033 this path was severed by the emitter's
      // `maxEventDepth` depth bound throwing RecursionDepthError; that machinery
      // is gone.) The reentrant replace's mutation still commits; only its
      // redundant nested re-notification is coalesced.
      let depth = 0;
      const unsub = router.subscribe(() => {
        depth += 1;
        routesApi.replace([{ name: "home", path: "/home" }]);
      });

      expect(() => {
        routesApi.replace([{ name: "home", path: "/home" }]);
      }).not.toThrow();

      expect(depth).toBe(1); // re-entrant SUCCESS coalesced — listener ran once

      unsub();
    });
  });

  // ============================================================================
  // noValidate mode
  // ============================================================================

  describe("noValidate mode", () => {
    it("should preserve external guards in noValidate mode", async () => {
      const nvRouter = createRouter([{ name: "home", path: "/home" }]);

      await nvRouter.start("/home");

      const nvRoutesApi = getRoutesApi(nvRouter);
      const nvLifecycle = getLifecycleApi(nvRouter);

      nvRoutesApi.add({ name: "guarded", path: "/guarded" });
      nvLifecycle.addActivateGuard("guarded", () => () => false);

      // Replace in noValidate mode — external guards should be preserved
      nvRoutesApi.replace([
        { name: "home", path: "/home" },
        { name: "guarded", path: "/guarded" },
      ]);

      // External guard is preserved even with noValidate
      await expect(nvRouter.navigate("guarded")).rejects.toThrow();

      nvRouter.stop();
    });
  });

  // ============================================================================
  // Navigation after replace
  // ============================================================================

  describe("navigation after replace", () => {
    it("should allow navigation to new routes after replace", async () => {
      routesApi.replace([
        { name: "new-page", path: "/new-page" },
        { name: "another-page", path: "/another-page" },
      ]);

      await router.navigate("new-page");

      expect(router.getState()?.name).toBe("new-page");

      await router.navigate("another-page");

      expect(router.getState()?.name).toBe("another-page");
    });

    it("should reject navigation to removed routes with ROUTE_NOT_FOUND after replace", async () => {
      await router.navigate("index");

      // Replace removes all previous routes (index, home, etc.)
      routesApi.replace([{ name: "new-home", path: "/new-home" }]);

      // Navigation to removed route fails
      await expect(router.navigate("home")).rejects.toThrow();
    });

    it("should build paths correctly for new routes after replace", () => {
      routesApi.replace([
        { name: "new-item", path: "/new-items/:id" },
        { name: "new-list", path: "/new-list" },
      ]);

      expect(router.buildPath("new-item", { id: "42" })).toBe("/new-items/42");
      expect(router.buildPath("new-list")).toBe("/new-list");
    });

    it("should support navigation with nested routes after replace", async () => {
      routesApi.replace([
        {
          name: "parent",
          path: "/parent",
          children: [{ name: "child", path: "/child" }],
        },
      ]);

      await router.navigate("parent.child");

      expect(router.getState()?.name).toBe("parent.child");
    });
  });

  // ============================================================================
  // Additional edge cases
  // ============================================================================

  describe("additional edge cases", () => {
    it("should support replace with nested route structures", () => {
      routesApi.replace([
        {
          name: "app",
          path: "/app",
          children: [
            { name: "dashboard", path: "/dashboard" },
            { name: "settings", path: "/settings" },
          ],
        },
      ]);

      expect(routesApi.has("app.dashboard")).toBe(true);
      expect(routesApi.has("app.settings")).toBe(true);
      expect(getPluginApi(router).matchPath("/app/dashboard")?.name).toBe(
        "app.dashboard",
      );
    });

    it("should support multiple replace calls (idempotent pattern)", () => {
      routesApi.replace([{ name: "v1-home", path: "/v1-home" }]);

      expect(routesApi.has("v1-home")).toBe(true);
      expect(routesApi.has("home")).toBe(false);

      routesApi.replace([{ name: "v2-home", path: "/v2-home" }]);

      expect(routesApi.has("v2-home")).toBe(true);
      expect(routesApi.has("v1-home")).toBe(false);
    });

    it("should allow add() after replace", () => {
      routesApi.replace([{ name: "base", path: "/base" }]);

      routesApi.add({ name: "extra", path: "/extra" });

      expect(routesApi.has("base")).toBe(true);
      expect(routesApi.has("extra")).toBe(true);
    });
  });

  // Prepare-then-commit atomicity (issue #698): a failing replace must throw
  // BEFORE the destructive clearRouteData — the old tree must survive intact.
  describe("atomicity (issue #698)", () => {
    it("circular forwardTo in new set → throws, old tree intact", () => {
      expect(() => {
        routesApi.replace([
          { name: "a", path: "/a", forwardTo: "b" },
          { name: "b", path: "/b", forwardTo: "a" },
        ]);
      }).toThrow(/Circular forwardTo/);

      // Old routes survive the failed replace.
      expect(routesApi.has("home")).toBe(true);
      expect(routesApi.has("users")).toBe(true);
      expect(getPluginApi(router).matchPath("/home")?.name).toBe("home");
      expect(routesApi.has("a")).toBe(false);
    });

    it("async forwardTo in new set → throws, old tree intact", () => {
      expect(() => {
        routesApi.replace([
          {
            name: "x",
            path: "/x",
            forwardTo: (async () => "y") as unknown as string,
          },
          { name: "y", path: "/y" },
        ]);
      }).toThrow(/cannot be async/);

      expect(routesApi.has("home")).toBe(true);
      expect(getPluginApi(router).matchPath("/home")?.name).toBe("home");
      expect(routesApi.has("x")).toBe(false);
    });
  });
});

describe("core/routes/replaceRoutes — revalidation consults guards (#1201)", () => {
  it("URL-ownership reshuffle to a blocked route → not-found, not silently active", async () => {
    const r = createRouter(
      [
        { name: "home", path: "/" },
        { name: "open", path: "/x" },
      ],
      { allowNotFound: false },
    );

    await r.start("/x");

    expect(r.getState()?.name).toBe("open");

    // The new set maps the current URL /x to a DIFFERENT, guarded route.
    getRoutesApi(r).replace([
      { name: "home", path: "/" },
      { name: "locked", path: "/x", canActivate: () => () => false },
    ]);

    // Hybrid (#1201): a route-identity change runs the new route's activation
    // guards; a block routes to not-found instead of silently committing
    // `locked` with its canActivate skipped.
    expect(r.getState()?.name).toBe(UNKNOWN_ROUTE);

    r.dispose();
  });

  it("URL-ownership reshuffle to an allowed route → commits the new route", async () => {
    const r = createRouter(
      [
        { name: "home", path: "/" },
        { name: "open", path: "/x" },
      ],
      { allowNotFound: false },
    );

    await r.start("/x");

    // The URL /x is now owned by a different, UNGUARDED route — guards pass, so
    // the reshuffle is committed (not dropped).
    getRoutesApi(r).replace([
      { name: "home", path: "/" },
      { name: "allowed", path: "/x" },
    ]);

    expect(r.getState()?.name).toBe("allowed");

    r.dispose();
  });

  it("new forwardTo on the active route consults the target's guards (blocked → not-found)", async () => {
    const r = createRouter(
      [
        { name: "cur", path: "/c" },
        { name: "tgt", path: "/t" },
      ],
      { allowNotFound: false },
    );

    await r.start("/c");

    // Adding forwardTo teleports /c → tgt (identity change); tgt's guard blocks.
    getRoutesApi(r).replace([
      { name: "cur", path: "/c", forwardTo: "tgt" },
      { name: "tgt", path: "/t", canActivate: () => () => false },
    ]);

    expect(r.getState()?.name).toBe(UNKNOWN_ROUTE);

    r.dispose();
  });

  it("survivor (same route name) is kept without re-running guards", async () => {
    const r = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
    ]);

    await r.start("/a");

    // Same URL still owned by the same route name, but the new set guards it to
    // block. The survivor is kept — the user was already legitimately here, so
    // guards are NOT re-run (they would wrongly evict).
    getRoutesApi(r).replace([
      { name: "home", path: "/" },
      { name: "a", path: "/a", canActivate: () => () => false },
    ]);

    expect(r.getState()?.name).toBe("a");

    r.dispose();
  });

  it("revalidation emit carries the distinguishable `revalidate` marker (#1201 hook-dispatch)", async () => {
    const r = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
    ]);

    await r.start("/a");

    let seenOpts: NavigationOptions | undefined;

    r.usePlugin(() => ({
      onTransitionSuccess: (_toState, _fromState, opts) => {
        seenOpts = opts;
      },
    }));

    getRoutesApi(r).replace([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
    ]);

    // A plugin can special-case a replace()-revalidation vs a real navigation:
    // both carry `replace: true`, only revalidation carries `revalidate: true`.
    expect(seenOpts?.revalidate).toBe(true);

    r.dispose();
  });
});

describe("core/routes/replaceRoutes — surviving route keeps plugin context (#1236)", () => {
  it("a route that survives replace() keeps its state.context", async () => {
    const r = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
    ]);

    await r.start("/a");

    // A plugin writes per-route data into state.context (the write channel
    // behind claimContextNamespace / the direct escape hatch).
    (
      r.getState() as unknown as { context: Record<string, unknown> }
    ).context.data = { id: 1 };

    getRoutesApi(r).replace([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
    ]);

    // The route survived (same name + path) — its plugin context must survive
    // too (#1236), not be wiped by the matchPath-rebuilt empty context.
    expect(r.getState()?.name).toBe("a");
    expect(
      (r.getState() as unknown as { context: Record<string, unknown> }).context
        .data,
    ).toStrictEqual({ id: 1 });

    r.dispose();
  });
});

describe("core/routes/replaceRoutes — no zombie guard for both-slot names (#1192)", () => {
  it("replace() recompiles the surviving external guard (def-after-ext order)", async () => {
    const routes = [
      { name: "home", path: "/" },
      { name: "admin", path: "/admin" },
    ];
    const r = createRouter(routes);

    await r.start("/");

    // external guard BLOCKS; then a definition guard ALLOWS the same slot —
    // registration is last-add-wins, so the compiled function is now the
    // definition (allowing) guard.
    getLifecycleApi(r).addActivateGuard("admin", () => () => false);
    getRoutesApi(r).update("admin", { canActivate: () => () => true });

    // replace() strips definition guards. The surviving external guard must win
    // again — the compiled slot is recompiled from it, not left as the erased
    // definition guard (#1192 zombie).
    getRoutesApi(r).replace(routes);

    await expect(r.navigate("admin")).rejects.toMatchObject({
      code: errorCodes.CANNOT_ACTIVATE,
    });
    expect(r.getState()?.name).toBe("home");
    expect(r.canNavigateTo("admin")).toBe(false);

    r.dispose();
  });
});

describe("core/routes/replaceRoutes — failed replace() preserves old definition guards (#1193)", () => {
  it("a compile-throwing factory in the new batch aborts before erasing old definition guards", async () => {
    const r = createRouter([
      { name: "home", path: "/" },
      { name: "admin", path: "/admin", canActivate: () => () => false }, // config guard BLOCKS
    ]);

    await r.start("/");
    await r.navigate("admin").catch(() => {}); // rejects CANNOT_ACTIVATE

    // The new batch carries a guard factory that throws on compile — replace()
    // must abort with BOTH the tree AND the old definition guards intact (#1193,
    // mirror of #1046).
    expect(() => {
      getRoutesApi(r).replace([
        { name: "home", path: "/" },
        { name: "admin", path: "/admin" },
        {
          name: "x",
          path: "/x",
          canActivate: () => {
            throw new Error("boom");
          },
        },
      ]);
    }).toThrow(/boom/);

    // The tree is unchanged (old routes still resolve) AND admin's config guard
    // still blocks — it was NOT silently erased by a pre-compile clear.
    expect(getRoutesApi(r).has("admin")).toBe(true);
    await expect(r.navigate("admin")).rejects.toMatchObject({
      code: errorCodes.CANNOT_ACTIVATE,
    });
    expect(r.getState()?.name).toBe("home");

    r.dispose();
  });
});

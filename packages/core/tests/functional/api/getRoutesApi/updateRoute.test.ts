import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes } from "@real-router/core";
import {
  cloneRouter,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type {
  Router,
  GuardFnFactory,
  Params,
  RouteConfigUpdate,
  RouterError,
  RoutesApi,
} from "@real-router/core";

let router: Router;
let routesApi: RoutesApi;

describe("core/routes/routeTree/updateRoute", () => {
  beforeEach(async () => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("forwardTo", () => {
    it("should add forwardTo", () => {
      routesApi.add({ name: "ur-source", path: "/ur-source" });
      routesApi.add({ name: "ur-target", path: "/ur-target" });

      routesApi.update("ur-source", { forwardTo: "ur-target" });

      // Verify forward works via behavior
      expect(getPluginApi(router).forwardState("ur-source", {}).name).toBe(
        "ur-target",
      );
    });

    it("should update existing forwardTo", () => {
      routesApi.add({ name: "ur-src", path: "/ur-src" });
      routesApi.add({ name: "ur-target1", path: "/ur-target1" });
      routesApi.add({ name: "ur-target2", path: "/ur-target2" });
      routesApi.update("ur-src", { forwardTo: "ur-target1" });

      routesApi.update("ur-src", { forwardTo: "ur-target2" });

      // Verify updated forward works
      expect(getPluginApi(router).forwardState("ur-src", {}).name).toBe(
        "ur-target2",
      );
    });

    it("should remove forwardTo when null", () => {
      routesApi.add({ name: "ur-dest", path: "/ur-dest" });
      routesApi.add({
        name: "ur-origin",
        path: "/ur-origin",
        forwardTo: "ur-dest",
      });

      routesApi.update("ur-origin", { forwardTo: null });

      // Forward should no longer redirect
      expect(getPluginApi(router).forwardState("ur-origin", {}).name).toBe(
        "ur-origin",
      );
    });

    it("should throw if creates direct cycle", () => {
      routesApi.add({ name: "ur-self", path: "/ur-self" });

      expect(() => {
        routesApi.update("ur-self", { forwardTo: "ur-self" });
      }).toThrow(/Circular forwardTo/);
    });

    it("rejects an async forwardTo at update time, like add/replace (#967)", () => {
      routesApi.add({ name: "ur-async-src", path: "/ur-async-src" });
      routesApi.add({ name: "ur-async-dst", path: "/ur-async-dst" });

      // add() already rejects an async forwardTo (assertForwardToNotAsync).
      // update() must reject the SAME input at registration with the SAME
      // actionable error — not silently accept it and defer a generic
      // "must return a string, got object" TypeError to navigation.
      expect(() => {
        routesApi.update("ur-async-src", {
          forwardTo: (async () => "ur-async-dst") as any,
        });
      }).toThrow(/forwardTo callback cannot be async/);
    });

    it("should allow forwardTo when params match", () => {
      routesApi.add({ name: "ur-old", path: "/ur-old/:id" });
      routesApi.add({ name: "ur-new", path: "/ur-new/:id" });

      expect(() => {
        routesApi.update("ur-old", { forwardTo: "ur-new" });
      }).not.toThrow();

      // Verify forward works via behavior
      expect(
        getPluginApi(router).forwardState("ur-old", { id: "1" }).name,
      ).toBe("ur-new");
    });

    it("should work with matchPath after update", () => {
      routesApi.add({ name: "ur-alias", path: "/ur-alias/:id" });
      routesApi.add({ name: "ur-real", path: "/ur-real/:id" });
      routesApi.update("ur-alias", { forwardTo: "ur-real" });

      const state = getPluginApi(router).matchPath("/ur-alias/123");

      expect(state?.name).toBe("ur-real");
      expect(state?.params.id).toBe("123");
    });

    describe("indirect cycle detection", () => {
      it("should not corrupt forwardMap on indirect cycle (A → B → C → A)", () => {
        routesApi.add({ name: "ur-a", path: "/ur-a" });
        routesApi.add({ name: "ur-b", path: "/ur-b" });
        routesApi.add({ name: "ur-c", path: "/ur-c" });

        routesApi.update("ur-a", { forwardTo: "ur-b" });
        routesApi.update("ur-b", { forwardTo: "ur-c" });

        // The rejected update must throw AND leave config.forwardMap clean.
        expect(() => {
          routesApi.update("ur-c", { forwardTo: "ur-a" });
        }).toThrow(/Circular forwardTo/);

        // resolvedForwardMap stays consistent (rejected edge never applied).
        expect(getPluginApi(router).forwardState("ur-a", {}).name).toBe("ur-c"); // ur-a → ur-b → ur-c
        expect(getPluginApi(router).forwardState("ur-b", {}).name).toBe("ur-c"); // ur-b → ur-c
        expect(getPluginApi(router).forwardState("ur-c", {}).name).toBe("ur-c"); // ur-c stays (no forward)

        // Discriminating check (issue #698): forwardState reads resolvedForwardMap,
        // which stayed clean even WITH the old bug — so it alone cannot prove the
        // raw config.forwardMap is clean. A subsequent add() re-runs
        // refreshForwardMap over config.forwardMap; if the cycle edge
        // (ur-c → ur-a) had leaked, this would throw "Circular forwardTo".
        expect(() => {
          routesApi.add({ name: "ur-after-cycle", path: "/ur-after-cycle" });
        }).not.toThrow();
      });

      it("should not corrupt forwardMap on longer indirect cycle (A → B → C → D → A)", () => {
        routesApi.add({ name: "ur-x", path: "/ur-x" });
        routesApi.add({ name: "ur-y", path: "/ur-y" });
        routesApi.add({ name: "ur-z", path: "/ur-z" });
        routesApi.add({ name: "ur-w", path: "/ur-w" });

        routesApi.update("ur-x", { forwardTo: "ur-y" });
        routesApi.update("ur-y", { forwardTo: "ur-z" });
        routesApi.update("ur-z", { forwardTo: "ur-w" });

        expect(() => {
          routesApi.update("ur-w", { forwardTo: "ur-x" });
        }).toThrow(/Circular forwardTo/);

        // resolvedForwardMap stays consistent (rejected edge never applied).
        expect(getPluginApi(router).forwardState("ur-w", {}).name).toBe("ur-w"); // ur-w stays (no forward)

        // Discriminating check (issue #698): forwardState reads resolvedForwardMap,
        // which is clean even WITH the old bug. A subsequent add() re-runs
        // refreshForwardMap over config.forwardMap; a leaked ur-w → ur-x edge
        // would throw "Circular forwardTo" here.
        expect(() => {
          routesApi.add({
            name: "ur-after-long-cycle",
            path: "/ur-after-long-cycle",
          });
        }).not.toThrow();
      });

      it("should preserve resolvedForwardMap consistency after cycle rejection", () => {
        routesApi.add({ name: "ur-p", path: "/ur-p" });
        routesApi.add({ name: "ur-q", path: "/ur-q" });
        routesApi.add({ name: "ur-r", path: "/ur-r" });

        routesApi.update("ur-p", { forwardTo: "ur-q" });
        routesApi.update("ur-q", { forwardTo: "ur-r" });

        // Attempt to create cycle
        expect(() => {
          routesApi.update("ur-r", { forwardTo: "ur-p" });
        }).toThrow();

        // matchPath should work correctly with existing redirects
        const state = getPluginApi(router).matchPath("/ur-p");

        expect(state?.name).toBe("ur-r"); // ur-p → ur-q → ur-r
      });

      it("should throw if forward chain exceeds maximum depth (100)", () => {
        // Create 102 routes to form a chain that exceeds max depth
        const routes = [];

        for (let i = 0; i <= 101; i++) {
          routes.push({ name: `ur-chain-${i}`, path: `/ur-chain-${i}` });
        }

        routesApi.add(routes);

        // Create forward chain: chain-0 → chain-1 → ... → chain-99 (100 items, depth 100)
        // This creates 99 links (i=0..98)
        for (let i = 0; i < 99; i++) {
          routesApi.update(`ur-chain-${i}`, {
            forwardTo: `ur-chain-${i + 1}`,
          });
        }

        // Adding the 100th link (chain-99 → chain-100) would make chain of 101 items
        // This should exceed max depth of 100
        expect(() => {
          routesApi.update("ur-chain-99", {
            forwardTo: "ur-chain-100",
          });
        }).toThrow(/exceeds maximum depth/);
      });
    });
  });

  describe("defaultParams", () => {
    it("should add defaultParams", () => {
      routesApi.add({ name: "ur-members", path: "/ur-members" });

      routesApi.update("ur-members", {
        defaultParams: { page: 1, limit: 10 },
      });

      // Verify via makeState
      expect(getPluginApi(router).makeState("ur-members").params).toStrictEqual(
        {
          page: 1,
          limit: 10,
        },
      );
    });

    it("should update existing defaultParams", () => {
      routesApi.add({
        name: "ur-accounts",
        path: "/ur-accounts",
        defaultParams: { page: 1 },
      });

      routesApi.update("ur-accounts", {
        defaultParams: { page: 2, limit: 20 },
      });

      // Verify via makeState
      expect(
        getPluginApi(router).makeState("ur-accounts").params,
      ).toStrictEqual({
        page: 2,
        limit: 20,
      });
    });

    it("should remove defaultParams when null", () => {
      routesApi.add({
        name: "ur-teams",
        path: "/ur-teams",
        defaultParams: { page: 1 },
      });

      routesApi.update("ur-teams", { defaultParams: null });

      // Verify via makeState - no defaults
      expect(getPluginApi(router).makeState("ur-teams").params).toStrictEqual(
        {},
      );
    });
  });

  describe("decodeParams", () => {
    it("should add decodeParams", () => {
      const decoder = vi.fn((params: Params): Params => ({
        ...params,
        id: Number(params.id),
      }));

      routesApi.add({ name: "ur-items", path: "/ur-items/:id" });
      routesApi.update("ur-items", { decodeParams: decoder });

      // Verify via matchPath
      const state = getPluginApi(router).matchPath("/ur-items/123");

      expect(decoder).toHaveBeenCalled();
      expect(state?.params.id).toBe(123);
    });

    it("should update existing decodeParams", () => {
      const decoder1 = vi.fn((params: Params): Params => params);
      const decoder2 = vi.fn((params: Params): Params => ({
        ...params,
        id: Number(params.id),
      }));

      routesApi.add({
        name: "ur-products",
        path: "/ur-products/:id",
        decodeParams: decoder1,
      });
      routesApi.update("ur-products", { decodeParams: decoder2 });

      // Verify new decoder is used
      const state = getPluginApi(router).matchPath("/ur-products/456");

      expect(decoder2).toHaveBeenCalled();
      expect(state?.params.id).toBe(456);
    });

    it("should remove decodeParams when null", () => {
      const decoder = vi.fn((params: Params): Params => ({
        ...params,
        decoded: true,
      }));

      routesApi.add({
        name: "ur-assets",
        path: "/ur-assets/:id",
        decodeParams: decoder,
      });

      // Verify decoder works before removal
      getPluginApi(router).matchPath("/ur-assets/1");

      expect(decoder).toHaveBeenCalled();

      decoder.mockClear();

      routesApi.update("ur-assets", { decodeParams: null });

      // Verify decoder is no longer called
      const state = getPluginApi(router).matchPath("/ur-assets/2");

      expect(decoder).not.toHaveBeenCalled();
      expect(state?.params.id).toBe("2"); // String, not decoded
    });

    it("should use updated decoder in matchPath", () => {
      routesApi.add({
        name: "ur-decode-test",
        path: "/ur-decode-test/:id",
      });
      routesApi.update("ur-decode-test", {
        decodeParams: (params) => ({ ...params, id: Number(params.id) }),
      });

      const state = getPluginApi(router).matchPath("/ur-decode-test/123");

      expect(state?.params.id).toBe(123);
      expect(typeof state?.params.id).toBe("number");
    });

    it("should fallback to original params when decoder returns undefined", () => {
      routesApi.add({
        name: "ur-decode-undef",
        path: "/ur-decode-undef/:id",
      });
      routesApi.update("ur-decode-undef", {
        // Decoder that returns undefined (bad user code)
        decodeParams: () => undefined as unknown as Params,
      });

      // Should fallback to original params
      const state = getPluginApi(router).matchPath("/ur-decode-undef/123");

      expect(state?.params.id).toBe("123");
    });
  });

  describe("encodeParams", () => {
    it("should add encodeParams", () => {
      const encoder = vi.fn((params: Params): Params => ({
        ...params,
        id: String(params.id as string | number),
      }));

      routesApi.add({ name: "ur-goods", path: "/ur-goods/:id" });
      routesApi.update("ur-goods", { encodeParams: encoder });

      // Verify via buildPath
      router.buildPath("ur-goods", { id: 123 });

      expect(encoder).toHaveBeenCalledWith({ id: 123 });
    });

    it("should update existing encodeParams", () => {
      const encoder1 = vi.fn((params: Params): Params => params);
      const encoder2 = vi.fn((params: Params): Params => ({
        ...params,
        id: String(params.id as string | number),
      }));

      routesApi.add({
        name: "ur-things",
        path: "/ur-things/:id",
        encodeParams: encoder1,
      });
      routesApi.update("ur-things", { encodeParams: encoder2 });

      // Verify new encoder is used
      router.buildPath("ur-things", { id: 456 });

      expect(encoder2).toHaveBeenCalled();
    });

    it("should remove encodeParams when null", () => {
      const encoder = vi.fn((params: Params): Params => params);

      routesApi.add({
        name: "ur-stuff",
        path: "/ur-stuff/:id",
        encodeParams: encoder,
      });

      // Verify encoder works before removal
      router.buildPath("ur-stuff", { id: 1 });

      expect(encoder).toHaveBeenCalled();

      encoder.mockClear();

      routesApi.update("ur-stuff", { encodeParams: null });

      // Verify encoder is no longer called
      router.buildPath("ur-stuff", { id: 2 });

      expect(encoder).not.toHaveBeenCalled();
    });

    it("should use updated encoder in buildPath", () => {
      routesApi.add({
        name: "ur-encode-test",
        path: "/ur-encode-test/:id",
      });
      routesApi.update("ur-encode-test", {
        encodeParams: (params) => {
          const idValue = params.id as string;

          return { ...params, id: `user-${idValue}` };
        },
      });

      const path = router.buildPath("ur-encode-test", { id: "123" });

      expect(path).toBe("/ur-encode-test/user-123");
    });

    it("should fallback to original params when encoder returns undefined", () => {
      routesApi.add({
        name: "ur-encode-undef",
        path: "/ur-encode-undef/:id",
      });
      routesApi.update("ur-encode-undef", {
        // Encoder that returns undefined (bad user code)
        encodeParams: () => undefined as unknown as Params,
      });

      // Should fallback to original params
      const path = router.buildPath("ur-encode-undef", { id: "123" });

      expect(path).toBe("/ur-encode-undef/123");
    });
  });

  describe("canActivate", () => {
    it("should add canActivate", async () => {
      const guard = vi.fn().mockReturnValue(true);
      const guardFactory: GuardFnFactory = () => guard;

      routesApi.add({ name: "ur-secure", path: "/ur-secure" });
      routesApi.update("ur-secure", { canActivate: guardFactory });

      // Verify canActivate works by navigating
      await router.navigate("ur-secure");

      expect(guard).toHaveBeenCalled();
    });

    it("should update existing canActivate", async () => {
      const guard1 = vi.fn().mockReturnValue(true);
      const guard2 = vi.fn().mockReturnValue(false);

      routesApi.add({
        name: "ur-guarded",
        path: "/ur-guarded",
        canActivate: () => guard1,
      });
      routesApi.update("ur-guarded", { canActivate: () => guard2 });

      // Verify new guard is used - navigation should be blocked
      try {
        await router.navigate("ur-guarded");

        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as RouterError).code).toBe(errorCodes.CANNOT_ACTIVATE);
        expect(guard2).toHaveBeenCalled();
        expect(guard1).not.toHaveBeenCalled();
      }
    });

    it("should remove canActivate when null", async () => {
      const guard = vi.fn().mockReturnValue(false);

      routesApi.add({
        name: "ur-locked",
        path: "/ur-locked",
        canActivate: () => guard,
      });

      // Verify guard is active - navigation blocked
      try {
        await router.navigate("ur-locked");

        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as RouterError).code).toBe(errorCodes.CANNOT_ACTIVATE);
      }

      guard.mockClear();

      // Remove canActivate
      routesApi.update("ur-locked", { canActivate: null });

      // Now navigation should succeed
      await router.navigate("ur-locked");

      expect(guard).not.toHaveBeenCalled();
    });

    it("preserves an external canActivate guard when clearing via update (origin-selective, #952)", async () => {
      routesApi.add({ name: "ur-ext", path: "/ur-ext" });

      // EXTERNAL guard (added via the lifecycle API, not route config) — blocks.
      getLifecycleApi(router).addActivateGuard("ur-ext", () => () => false);

      expect(router.canNavigateTo("ur-ext")).toBe(false);

      // Clearing the route-config (definition) guard must NOT wipe the external
      // one. Before #952 `clearCanActivate` was origin-blind and removed both.
      routesApi.update("ur-ext", { canActivate: null });

      // External guard survives — navigation still blocked.
      expect(router.canNavigateTo("ur-ext")).toBe(false);
    });
  });

  describe("canDeactivate", () => {
    it("should add canDeactivate", async () => {
      const guard = vi.fn().mockReturnValue(false);
      const guardFactory: GuardFnFactory = () => guard;

      routesApi.add({ name: "ur-editor", path: "/ur-editor" });
      routesApi.update("ur-editor", { canDeactivate: guardFactory });

      // Navigate to route
      await router.navigate("ur-editor");

      guard.mockClear();

      // Navigate away - should be blocked
      try {
        await router.navigate("home");

        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as RouterError).code).toBe(errorCodes.CANNOT_DEACTIVATE);
        expect(guard).toHaveBeenCalled();
      }
    });

    it("should remove canDeactivate when null", async () => {
      const guard = vi.fn().mockReturnValue(false);

      routesApi.add({
        name: "ur-form",
        path: "/ur-form",
        canDeactivate: () => guard,
      });

      // Navigate to route
      await router.navigate("ur-form");

      // Verify guard is active - navigation blocked
      try {
        await router.navigate("home");

        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as RouterError).code).toBe(errorCodes.CANNOT_DEACTIVATE);
      }

      guard.mockClear();

      // Remove canDeactivate
      routesApi.update("ur-form", { canDeactivate: null });

      // Now navigation should succeed
      await router.navigate("home");

      expect(guard).not.toHaveBeenCalled();
    });

    it("should update existing canDeactivate", async () => {
      const guard1 = vi.fn().mockReturnValue(false);
      const guard2 = vi.fn().mockReturnValue(true);

      routesApi.add({
        name: "ur-page",
        path: "/ur-page",
        canDeactivate: () => guard1,
      });
      routesApi.update("ur-page", { canDeactivate: () => guard2 });

      // Navigate to route
      await router.navigate("ur-page");

      guard1.mockClear();
      guard2.mockClear();

      // Navigate away - new guard should fire, old guard should NOT
      await router.navigate("home");

      expect(guard2).toHaveBeenCalled();
      expect(guard1).not.toHaveBeenCalled();
    });

    it("preserves an external canDeactivate guard when clearing via update (origin-selective, #952)", async () => {
      routesApi.add({ name: "ur-ext-d", path: "/ur-ext-d" });
      await router.navigate("ur-ext-d");

      // EXTERNAL deactivate guard (lifecycle API, not route config) — blocks leaving.
      getLifecycleApi(router).addDeactivateGuard("ur-ext-d", () => () => false);

      expect(router.canNavigateTo("home")).toBe(false);

      // Clearing the route-config (definition) guard must NOT wipe the external
      // one — origin-blind `clearCanDeactivate` removed both before #952.
      routesApi.update("ur-ext-d", { canDeactivate: null });

      // External guard survives — still blocked from leaving.
      expect(router.canNavigateTo("home")).toBe(false);
    });
  });

  describe("atomicity across fields (#951)", () => {
    it("rolls back a forwardTo set in the same update() when a guard factory throws", () => {
      routesApi.add({ name: "ur-atom", path: "/ur-atom" });
      routesApi.add({ name: "ur-atom-tgt", path: "/ur-atom-tgt" });

      const boom: GuardFnFactory = () => {
        throw new Error("guard boom");
      };

      // One update() carries BOTH a valid forwardTo and a throwing guard
      // factory. Before #951 the forwardTo committed first, then the guard
      // compile threw — leaving a partial update (forwardTo applied, guard not).
      expect(() => {
        routesApi.update("ur-atom", {
          forwardTo: "ur-atom-tgt",
          canActivate: boom,
        });
      }).toThrow("guard boom");

      // Atomic: the forwardTo from the failed call did NOT apply.
      expect(getPluginApi(router).forwardState("ur-atom", {}).name).toBe(
        "ur-atom",
      );
    });

    it("rolls back a custom field set in the same update() when async forwardTo is rejected", () => {
      type Patch = RouteConfigUpdate & { label?: string };

      routesApi.add({ name: "ur-atom2", path: "/ur-atom2" });
      routesApi.update("ur-atom2", { label: "before" } as Patch);

      // A throwing field (async forwardTo, #967) anywhere in the patch must roll
      // back the whole update — the custom field set in the SAME call must not
      // commit.
      expect(() => {
        routesApi.update("ur-atom2", {
          label: "after",
          forwardTo: (async () => "x") as any,
        } as Patch);
      }).toThrow(/forwardTo callback cannot be async/);

      // Atomic: the custom field stays "before" — "after" never committed.
      expect(getPluginApi(router).getRouteConfig("ur-atom2")).toStrictEqual({
        label: "before",
      });
    });
  });

  describe("custom fields", () => {
    // RouteConfigUpdate is a closed interface; plugins augment it with their
    // own custom fields (symmetric with how they augment Route). Core itself
    // has no augmentation, so tests pass custom fields via a typed-local patch.
    // `| undefined` is included so the fixture can express an explicit
    // `undefined` value (a dynamic/untyped patch shape) and exercise core's
    // defensive "undefined = no-op" branch under exactOptionalPropertyTypes.
    type CustomPatch = RouteConfigUpdate & {
      onView?: (() => () => void) | null | undefined;
      label?: string | null | undefined;
    };

    const hook1 = (): (() => void) => (): void => {};
    const hook2 = (): (() => void) => (): void => {};

    it("should patch a custom field, swapping the stored value", () => {
      routesApi.add({ name: "ur-cf-swap", path: "/ur-cf-swap", onView: hook1 });

      const patch: CustomPatch = { onView: hook2 };

      routesApi.update("ur-cf-swap", patch);

      expect(getPluginApi(router).getRouteConfig("ur-cf-swap")).toStrictEqual({
        onView: hook2,
      });
    });

    it("should add a custom field to a route that had none", () => {
      routesApi.add({ name: "ur-cf-new", path: "/ur-cf-new" });

      expect(getPluginApi(router).getRouteConfig("ur-cf-new")).toBeUndefined();

      const patch: CustomPatch = { onView: hook1 };

      routesApi.update("ur-cf-new", patch);

      expect(getPluginApi(router).getRouteConfig("ur-cf-new")).toStrictEqual({
        onView: hook1,
      });
    });

    it("should shallow-merge by patch key, preserving sibling custom fields", () => {
      routesApi.add({
        name: "ur-cf-merge",
        path: "/ur-cf-merge",
        onView: hook1,
        label: "keep",
      });

      const patch: CustomPatch = { onView: hook2 };

      routesApi.update("ur-cf-merge", patch);

      // onView swapped; label untouched.
      expect(getPluginApi(router).getRouteConfig("ur-cf-merge")).toStrictEqual({
        onView: hook2,
        label: "keep",
      });
    });

    it("should remove a single custom field when set to null, keeping siblings", () => {
      routesApi.add({
        name: "ur-cf-rm-one",
        path: "/ur-cf-rm-one",
        onView: hook1,
        label: "keep",
      });

      const patch: CustomPatch = { onView: null };

      routesApi.update("ur-cf-rm-one", patch);

      expect(getPluginApi(router).getRouteConfig("ur-cf-rm-one")).toStrictEqual(
        {
          label: "keep",
        },
      );
    });

    it("should drop the record entirely when the last custom field is removed", () => {
      routesApi.add({
        name: "ur-cf-rm-all",
        path: "/ur-cf-rm-all",
        onView: hook1,
      });

      const patch: CustomPatch = { onView: null };

      routesApi.update("ur-cf-rm-all", patch);

      // Empty record → no entry → getRouteConfig undefined (symmetric with add).
      expect(
        getPluginApi(router).getRouteConfig("ur-cf-rm-all"),
      ).toBeUndefined();
    });

    it("should treat undefined as a no-op, leaving the custom field untouched", () => {
      routesApi.add({
        name: "ur-cf-undef",
        path: "/ur-cf-undef",
        onView: hook1,
      });

      const patch: CustomPatch = { onView: undefined };

      routesApi.update("ur-cf-undef", patch);

      expect(getPluginApi(router).getRouteConfig("ur-cf-undef")).toStrictEqual({
        onView: hook1,
      });
    });

    it("should patch structural and custom fields in the same update", () => {
      routesApi.add({
        name: "ur-cf-mixed",
        path: "/ur-cf-mixed",
        onView: hook1,
      });

      const patch: CustomPatch = {
        defaultParams: { tab: "info" },
        onView: hook2,
      };

      routesApi.update("ur-cf-mixed", patch);

      // structural applied...
      expect(routesApi.get("ur-cf-mixed")?.defaultParams).toStrictEqual({
        tab: "info",
      });
      // ...custom applied, structural field not leaked into the custom record.
      expect(getPluginApi(router).getRouteConfig("ur-cf-mixed")).toStrictEqual({
        onView: hook2,
      });
    });

    it("should not leak a custom-field update into a previously cloned router", () => {
      routesApi.add({
        name: "ur-cf-clone",
        path: "/ur-cf-clone",
        onView: hook1,
      });

      const clone = cloneRouter(router);

      const patch: CustomPatch = { onView: hook2 };

      routesApi.update("ur-cf-clone", patch);

      // Source sees the new value; the clone (which aliases the pre-update
      // record) keeps the original — fresh-object write preserves isolation.
      expect(getPluginApi(router).getRouteConfig("ur-cf-clone")).toStrictEqual({
        onView: hook2,
      });
      expect(getPluginApi(clone).getRouteConfig("ur-cf-clone")).toStrictEqual({
        onView: hook1,
      });

      clone.dispose();
    });

    it("should leave config unchanged when a custom-field getter throws", () => {
      routesApi.add({
        name: "ur-cf-throw",
        path: "/ur-cf-throw",
        onView: hook1,
        defaultParams: { page: 1 },
      });

      const throwingPatch: CustomPatch = {
        defaultParams: { page: 2 },
        get onView(): () => () => void {
          throw new Error("custom getter explosion");
        },
      };

      expect(() => {
        routesApi.update("ur-cf-throw", throwingPatch);
      }).toThrow(/custom getter explosion/);

      // Atomic: neither the custom field nor the structural field was written —
      // custom fields are applied before the structural config, so the throw
      // aborts the update before any store write.
      expect(getPluginApi(router).getRouteConfig("ur-cf-throw")).toStrictEqual({
        onView: hook1,
      });
      expect(routesApi.get("ur-cf-throw")?.defaultParams).toStrictEqual({
        page: 1,
      });
    });
  });

  describe("validation", () => {
    it("should accept valid defaultParams, decodeParams, encodeParams", () => {
      routesApi.add({ name: "ur-valid-test", path: "/ur-valid-test" });

      // Valid object for defaultParams
      expect(() => {
        routesApi.update("ur-valid-test", {
          defaultParams: { page: 1, sort: "name" },
        });
      }).not.toThrow();

      // null is valid for defaultParams (remove)
      expect(() => {
        routesApi.update("ur-valid-test", { defaultParams: null });
      }).not.toThrow();

      // Valid function for decodeParams
      expect(() => {
        routesApi.update("ur-valid-test", {
          decodeParams: (params) => params,
        });
      }).not.toThrow();

      // null is valid for decodeParams (remove)
      expect(() => {
        routesApi.update("ur-valid-test", { decodeParams: null });
      }).not.toThrow();

      // Valid function for encodeParams
      expect(() => {
        routesApi.update("ur-valid-test", {
          encodeParams: (params) => params,
        });
      }).not.toThrow();

      // null is valid for encodeParams (remove)
      expect(() => {
        routesApi.update("ur-valid-test", { encodeParams: null });
      }).not.toThrow();
    });

    it("should update route and return void", () => {
      routesApi.add({ name: "ur-chainable", path: "/ur-chainable" });

      routesApi.update("ur-chainable", {
        defaultParams: { page: 1 },
      });

      const route = routesApi.get("ur-chainable");

      expect(route?.defaultParams).toStrictEqual({ page: 1 });
    });
  });

  describe("multiple updates", () => {
    it("should update multiple properties at once", async () => {
      const decoder = (params: Params): Params => params;
      const guard = vi.fn().mockReturnValue(true);
      const guardFactory: GuardFnFactory = () => guard;

      routesApi.add({ name: "ur-multi", path: "/ur-multi" });
      routesApi.update("ur-multi", {
        defaultParams: { page: 1 },
        decodeParams: decoder,
        canActivate: guardFactory,
      });

      // Verify defaultParams via behavior
      expect(getPluginApi(router).makeState("ur-multi").params).toStrictEqual({
        page: 1,
      });

      // Verify canActivate via navigation
      await router.navigate("ur-multi");

      expect(guard).toHaveBeenCalled();
    });

    it("should chain multiple updateRoute calls", () => {
      routesApi.add({ name: "ur-chain", path: "/ur-chain" });

      routesApi.update("ur-chain", { defaultParams: { page: 1 } });
      routesApi.update("ur-chain", { defaultParams: { page: 2, limit: 10 } });

      // Verify via behavior
      expect(getPluginApi(router).makeState("ur-chain").params).toStrictEqual({
        page: 2,
        limit: 10,
      });
    });
  });

  describe("nested routes", () => {
    it("should update nested route configuration", () => {
      routesApi.add({
        name: "ur-parent",
        path: "/ur-parent",
        children: [{ name: "child", path: "/child" }],
      });

      routesApi.update("ur-parent.child", {
        defaultParams: { tab: "info" },
      });

      // Verify via behavior
      expect(
        getPluginApi(router).makeState("ur-parent.child").params,
      ).toStrictEqual({
        tab: "info",
      });
    });
  });

  describe("navigation warnings", () => {
    it("should error when updating route during active navigation", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      let resolveCanActivate: () => void;
      const canActivatePromise = new Promise<void>((resolve) => {
        resolveCanActivate = resolve;
      });

      routesApi.add({
        name: "ur-async",
        path: "/ur-async",
        canActivate: () => async () => {
          await canActivatePromise;

          return true;
        },
      });

      // Start async navigation
      router.navigate("ur-async").catch(() => {});

      // Give time for navigation to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Try to update during navigation - should log error but proceed
      routesApi.update("ur-async", { defaultParams: { page: 1 } });

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("navigation is in progress"),
      );

      // Config should be updated (we only log error, don't block)
      expect(getPluginApi(router).makeState("ur-async").params).toStrictEqual({
        page: 1,
      });

      // Cleanup
      resolveCanActivate!();
      await new Promise((resolve) => setTimeout(resolve, 10));

      errorSpy.mockRestore();
    });

    it("should not log error when updating route without active navigation", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      routesApi.add({ name: "ur-no-warn", path: "/ur-no-warn" });

      // Update should not log error (no navigation in progress)
      routesApi.update("ur-no-warn", { defaultParams: { page: 1 } });

      expect(errorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("[router.updateRoute]"),
      );

      errorSpy.mockRestore();
    });
  });

  describe("getRoute integration", () => {
    it("should reflect updates in getRoute", () => {
      routesApi.add({ name: "ur-reflect", path: "/ur-reflect" });
      routesApi.update("ur-reflect", { defaultParams: { page: 1 } });

      const route = routesApi.get("ur-reflect");

      expect(route?.defaultParams).toStrictEqual({ page: 1 });
    });

    it("should reflect removed properties in getRoute", () => {
      routesApi.add({
        name: "ur-remove",
        path: "/ur-remove",
        defaultParams: { page: 1 },
      });
      routesApi.update("ur-remove", { defaultParams: null });

      const route = routesApi.get("ur-remove");

      expect(route?.defaultParams).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    describe("empty and no-op updates", () => {
      it("should accept empty object as no-op", () => {
        routesApi.add({ name: "ur-empty", path: "/ur-empty" });

        // Should not throw
        expect(() => {
          routesApi.update("ur-empty", {});
        }).not.toThrow();

        // No defaults should be applied
        expect(getPluginApi(router).makeState("ur-empty").params).toStrictEqual(
          {},
        );
      });

      it("should treat missing properties as no-op", () => {
        routesApi.add({
          name: "ur-undef",
          path: "/ur-undef",
          defaultParams: { existing: 1 },
        });

        // Empty object - no properties means no changes
        routesApi.update("ur-undef", {});

        // Existing config should be preserved
        expect(getPluginApi(router).makeState("ur-undef").params).toStrictEqual(
          {
            existing: 1,
          },
        );
      });
    });

    describe("exotic objects", () => {
      it("should accept Object.freeze updates", () => {
        routesApi.add({ name: "ur-frozen", path: "/ur-frozen" });

        const frozenUpdates = Object.freeze({
          defaultParams: Object.freeze({ page: 1 }),
        });

        expect(() => {
          routesApi.update("ur-frozen", frozenUpdates);
        }).not.toThrow();
        expect(
          getPluginApi(router).makeState("ur-frozen").params,
        ).toStrictEqual({
          page: 1,
        });
      });

      it("should accept null prototype defaultParams", () => {
        routesApi.add({ name: "ur-nullproto", path: "/ur-nullproto" });

        const nullProtoParams = Object.create(null) as Params;

        nullProtoParams.page = 1;

        routesApi.update("ur-nullproto", {
          defaultParams: nullProtoParams,
        });

        // Verify behavior - params should work
        const state = getPluginApi(router).makeState("ur-nullproto");

        expect(state.params).toMatchObject({ page: 1 });
      });

      it("should accept class instance as defaultParams", () => {
        routesApi.add({ name: "ur-class", path: "/ur-class" });

        class PageParams {
          page = 1;
          limit = 10;
        }

        // Cast needed because class doesn't have index signature
        routesApi.update("ur-class", {
          defaultParams: new PageParams() as unknown as Params,
        });

        // Verify behavior
        const state = getPluginApi(router).makeState("ur-class");

        expect(state.params).toMatchObject({ page: 1, limit: 10 });
      });

      it("should accept defaultParams with circular reference", () => {
        routesApi.add({ name: "ur-circular", path: "/ur-circular" });

        const circular: Params = { page: 1 };

        (circular as Record<string, unknown>).self = circular;

        // Should not throw on assignment
        expect(() => {
          routesApi.update("ur-circular", { defaultParams: circular });
        }).not.toThrow();

        // Verify behavior - page should be accessible
        const state = getPluginApi(router).makeState("ur-circular");

        expect(state.params.page).toBe(1);
      });

      it("should preserve Symbol keys in defaultParams (but may lose on copy)", () => {
        routesApi.add({ name: "ur-symbol", path: "/ur-symbol" });

        const sym = Symbol("hidden");
        const params = { page: 1, [sym]: "secret" };

        routesApi.update("ur-symbol", { defaultParams: params });

        // Verify behavior - page should be accessible
        const state = getPluginApi(router).makeState("ur-symbol");

        expect(state.params.page).toBe(1);
      });
    });

    describe("function edge cases", () => {
      it("should accept bound function as decodeParams", () => {
        routesApi.add({ name: "ur-bound", path: "/ur-bound/:id" });

        const decoder = {
          prefix: "decoded_",
          decode(params: Params): Params {
            // eslint-disable-next-line unicorn/no-this-outside-of-class -- intentional: this test verifies an object method using `this` works as decodeParams
            return { ...params, tag: this.prefix + (params.id as string) };
          },
        };

        routesApi.update("ur-bound", {
          decodeParams: decoder.decode.bind(decoder),
        });

        const state = getPluginApi(router).matchPath("/ur-bound/123");

        expect(state?.params).toStrictEqual({ id: "123", tag: "decoded_123" });
      });

      it("should accept arrow function as encodeParams", () => {
        routesApi.add({ name: "ur-arrow", path: "/ur-arrow/:id" });

        routesApi.update("ur-arrow", {
          encodeParams: (params) => ({
            ...params,
            id: (params.id as string).toUpperCase(),
          }),
        });

        const path = router.buildPath("ur-arrow", { id: "abc" });

        expect(path).toBe("/ur-arrow/ABC");
      });

      it("should accept arrow function as canActivate factory", async () => {
        const guard = vi.fn().mockReturnValue(true);

        routesApi.add({
          name: "ur-arrow-guard",
          path: "/ur-arrow-guard",
        });

        routesApi.update("ur-arrow-guard", {
          canActivate: () => guard,
        });

        // Verify canActivate works via navigation
        await router.navigate("ur-arrow-guard");

        expect(guard).toHaveBeenCalled();
      });
    });

    describe("forwardTo edge cases", () => {
      it("should reject forwardTo to self (direct cycle)", () => {
        routesApi.add({ name: "ur-self", path: "/ur-self" });

        expect(() => {
          routesApi.update("ur-self", { forwardTo: "ur-self" });
        }).toThrow(/Circular forwardTo/);
      });

      // Prepare-then-commit atomicity (issue #698): a cycle-creating update must
      // not poison config.forwardMap, so a later unrelated add must not throw.
      it("cycle-creating update does not poison forwardMap (subsequent add is clean)", () => {
        routesApi.add({ name: "ur-poison-a", path: "/ur-poison-a" });
        routesApi.add({ name: "ur-poison-b", path: "/ur-poison-b" });
        routesApi.update("ur-poison-a", { forwardTo: "ur-poison-b" });

        expect(() => {
          routesApi.update("ur-poison-b", { forwardTo: "ur-poison-a" });
        }).toThrow(/Circular forwardTo/);

        // forwardMap was not corrupted — an unrelated add does not re-throw the cycle.
        expect(() => {
          routesApi.add({ name: "ur-poison-c", path: "/ur-poison-c" });
        }).not.toThrow();
        expect(routesApi.has("ur-poison-c")).toBe(true);
      });
    });

    describe("sequential updates", () => {
      it("should replace (not merge) defaultParams on multiple updates", () => {
        routesApi.add({ name: "ur-seq", path: "/ur-seq" });

        routesApi.update("ur-seq", { defaultParams: { a: 1, b: 2 } });
        routesApi.update("ur-seq", { defaultParams: { c: 3 } });

        const state = getPluginApi(router).makeState("ur-seq");

        // Should be replaced, not merged
        expect(state.params).toStrictEqual({ c: 3 });
        expect(state.params).not.toHaveProperty("a");
        expect(state.params).not.toHaveProperty("b");
      });

      it("should allow updating different properties independently", () => {
        routesApi.add({ name: "ur-indep", path: "/ur-indep" });

        routesApi.update("ur-indep", { defaultParams: { page: 1 } });
        routesApi.update("ur-indep", {
          decodeParams: (p) => ({ ...p, decoded: true }),
        });

        // defaultParams should still be set
        expect(getPluginApi(router).makeState("ur-indep").params).toStrictEqual(
          {
            page: 1,
          },
        );

        // Decoder should be active - verify via matchPath
        const state = getPluginApi(router).matchPath("/ur-indep");

        expect(state?.params).toHaveProperty("decoded", true);
      });
    });

    describe("mutating getters (edge case)", () => {
      it("should cache getter value to ensure consistent behavior", () => {
        routesApi.add({ name: "ur-getter", path: "/ur-getter" });

        let callCount = 0;
        const mutatingUpdates = {
          get defaultParams() {
            callCount++;

            return { page: callCount };
          },
        };

        routesApi.update("ur-getter", mutatingUpdates);

        // Getter is called exactly once during destructuring
        // This protects against mutating getters returning different values
        const state = getPluginApi(router).makeState("ur-getter");

        expect(state.params).toStrictEqual({ page: 1 });
        expect(callCount).toBe(1); // Called only once during caching
      });

      it("should propagate exception from throwing getter without modifying config", () => {
        routesApi.add({
          name: "ur-throwing",
          path: "/ur-throwing",
          defaultParams: { original: true },
        });

        const throwingUpdates = {
          get defaultParams(): Params {
            throw new Error("Getter explosion!");
          },
        };

        // Exception propagates to caller
        expect(() => {
          routesApi.update("ur-throwing", throwingUpdates);
        }).toThrow("Getter explosion!");

        // Config remains unchanged - exception happens during destructuring,
        // before any mutations
        expect(
          getPluginApi(router).makeState("ur-throwing").params,
        ).toStrictEqual({
          original: true,
        });
      });
    });

    describe("Proxy objects", () => {
      it("should work with Proxy that passes through values", () => {
        routesApi.add({ name: "ur-proxy", path: "/ur-proxy" });

        const updates = new Proxy(
          { defaultParams: { page: 1 } },
          {
            get(target, prop) {
              return Reflect.get(target, prop);
            },
          },
        );

        expect(() => {
          routesApi.update("ur-proxy", updates);
        }).not.toThrow();
        expect(getPluginApi(router).makeState("ur-proxy").params).toStrictEqual(
          {
            page: 1,
          },
        );
      });
    });
  });

  describe("forwardTo function transitions", () => {
    it("should update string forwardTo to function", () => {
      routesApi.add({ name: "source", path: "/source" });
      routesApi.add({ name: "target-a", path: "/target-a" });
      routesApi.add({ name: "target-b", path: "/target-b" });

      routesApi.update("source", { forwardTo: "target-a" });

      expect(getPluginApi(router).forwardState("source", {}).name).toBe(
        "target-a",
      );

      routesApi.update("source", {
        forwardTo: () => "target-b",
      });

      const result = getPluginApi(router).forwardState("source", {});

      expect(result.name).toBe("target-b");
    });

    it("should update function forwardTo to string", () => {
      routesApi.add({ name: "dynamic-source", path: "/dynamic-source" });
      routesApi.add({ name: "dest-1", path: "/dest-1" });
      routesApi.add({ name: "dest-2", path: "/dest-2" });

      routesApi.update("dynamic-source", {
        forwardTo: () => "dest-1",
      });

      expect(getPluginApi(router).forwardState("dynamic-source", {}).name).toBe(
        "dest-1",
      );

      routesApi.update("dynamic-source", { forwardTo: "dest-2" });

      expect(getPluginApi(router).forwardState("dynamic-source", {}).name).toBe(
        "dest-2",
      );
    });

    it("should clear both maps when updating function to null", () => {
      routesApi.add({ name: "clear-test", path: "/clear-test" });
      routesApi.add({ name: "some-target", path: "/some-target" });

      routesApi.update("clear-test", {
        forwardTo: () => "some-target",
      });

      expect(getPluginApi(router).forwardState("clear-test", {}).name).toBe(
        "some-target",
      );

      routesApi.update("clear-test", { forwardTo: null });

      expect(getPluginApi(router).forwardState("clear-test", {}).name).toBe(
        "clear-test",
      );
    });

    it("should handle function → null → string sequence", () => {
      routesApi.add({ name: "seq-test", path: "/seq-test" });
      routesApi.add({ name: "final-dest", path: "/final-dest" });

      routesApi.update("seq-test", {
        forwardTo: () => "final-dest",
      });

      expect(getPluginApi(router).forwardState("seq-test", {}).name).toBe(
        "final-dest",
      );

      routesApi.update("seq-test", { forwardTo: null });

      expect(getPluginApi(router).forwardState("seq-test", {}).name).toBe(
        "seq-test",
      );

      routesApi.update("seq-test", { forwardTo: "final-dest" });

      expect(getPluginApi(router).forwardState("seq-test", {}).name).toBe(
        "final-dest",
      );
    });
  });

  describe("core contract without validation-plugin", () => {
    it("update(nonexistent) is a TRUE no-op — no phantom config/guard, no lying event, no inheritance by a later add() (#1205)", () => {
      // Without @real-router/validation-plugin core trusts its input and does not
      // throw (validation is opt-in). But it must NOT silently seed config or a
      // guard for a route that does not exist: update() previously wrote
      // config.defaultParams + compiled/registered the guard + emitted a lying
      // TREE_CHANGED "update" event, and a later add() of that name inherited the
      // phantom (defaultParams + a blocking guard). It is now a genuine no-op.
      // (With the validation-plugin, update() throws a ReferenceError instead.)
      const events: string[] = [];
      const unsub = routesApi.subscribeChanges((event) =>
        events.push(event.op),
      );

      expect(() => {
        routesApi.update("nonexistent", {
          defaultParams: { seeded: "yes" },
          canActivate: () => () => false,
        });
      }).not.toThrow();

      expect(routesApi.has("nonexistent")).toBe(false);
      expect(routesApi.get("nonexistent")).toBeUndefined();
      expect(events).toStrictEqual([]); // no lying "update" event

      // A later add() of that name must arrive clean — no inherited phantom.
      routesApi.add({ name: "nonexistent", path: "/nonexistent" });
      unsub();

      expect(routesApi.get("nonexistent")?.defaultParams).toBeUndefined();
      expect(router.canNavigateTo("nonexistent")).toBe(true);
    });

    it("update(encodeParams) on the active route leaves state.path stale (NO_TREE_REBUILD)", async () => {
      await router.navigate("items", { id: "abc" });

      expect(router.getState()?.path).toBe("/items/abc");

      routesApi.update("items", {
        encodeParams: (params) => ({ id: `X-${params.id as string}` }),
      });

      // update() does not revalidate the active state (by-design: no tree
      // rebuild). The committed path stays as-built; only FUTURE buildPath calls
      // pick up the new encoder. Navigate(reload) to refresh if needed.
      expect(router.getState()?.path).toBe("/items/abc");
      expect(router.buildPath("items", { id: "abc" })).toBe("/items/X-abc");
    });
  });
});

import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  createRouter,
  errorCodes,
  events,
  RouterError,
} from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import { captureUnhandledRejections, createTestRouter } from "../../helpers";

import type { Router, State } from "@real-router/core";
import type { LifecycleApi } from "@real-router/core/api";

/**
 * Functional tests for `getPluginApi(router).navigateToState(state, opts)` — the new
 * navigation primitive added by issue #525. Mirrors the navigate.test.ts
 * shape but exercises the bypass-buildNavigateState code path.
 */
describe("navigateToState", () => {
  let router: Router;
  let lifecycle: LifecycleApi;

  beforeEach(async () => {
    router = createTestRouter();
    await router.start("/home");
    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();
    vi.restoreAllMocks();
  });

  describe("happy path", () => {
    it("commits a matched state to the router and resolves with it", async () => {
      const matched = getPluginApi(router).matchPath("/users");

      expect(matched).toBeDefined();

      const next = await getPluginApi(router).navigateToState(matched!);

      expect(next.name).toBe("users");
      expect(next.path).toBe("/users");
      expect(router.getState()?.name).toBe("users");
    });

    it("accepts NavigationOptions (replace, signal, etc.)", async () => {
      const matched = getPluginApi(router).matchPath("/users");
      const controller = new AbortController();

      const next = await getPluginApi(router).navigateToState(matched!, {
        replace: true,
        signal: controller.signal,
      });

      expect(next.name).toBe("users");
    });

    it("preserves the path produced by matchPath verbatim (Q2 fix #525)", async () => {
      router.stop();
      router = createRouter(
        [
          { name: "home", path: "/" },
          { name: "users", path: "/users" },
        ],
        { trailingSlash: "preserve" },
      );
      await router.start("/");

      const matched = getPluginApi(router).matchPath("/users/");

      expect(matched?.path).toBe("/users/");

      const next = await getPluginApi(router).navigateToState(matched!);

      expect(next.path).toBe("/users/");
    });

    it("emits TRANSITION_SUCCESS with the provided state", async () => {
      const matched = getPluginApi(router).matchPath("/users");
      const successSpy = vi.fn();
      const unsubscribe = router.subscribe((evt) => {
        successSpy(evt.route.name);
      });

      try {
        await getPluginApi(router).navigateToState(matched!);
      } finally {
        unsubscribe();
      }

      expect(successSpy).toHaveBeenCalledWith("users");
    });
  });

  describe("rejections", () => {
    it("rejects with ROUTER_NOT_STARTED when router is stopped", async () => {
      const matched = getPluginApi(router).matchPath("/users");

      router.stop();

      await expect(
        getPluginApi(router).navigateToState(matched!),
      ).rejects.toMatchObject({
        code: errorCodes.ROUTER_NOT_STARTED,
      });
    });

    it("rejects with ROUTE_NOT_FOUND when state.name is unknown to the router", async () => {
      const fake: State = {
        name: "ghost.route",
        params: {},
        search: {},
        path: "/ghost",
        transition: {
          phase: "activating",
          reason: "success",
          segments: { deactivated: [], activated: [], intersection: "" },
        },
        context: {},
      };
      const errorSpy = vi.fn();
      const unsubscribe = getPluginApi(router).addEventListener(
        events.TRANSITION_ERROR,
        errorSpy,
      );

      try {
        await expect(
          getPluginApi(router).navigateToState(fake),
        ).rejects.toMatchObject({
          code: errorCodes.ROUTE_NOT_FOUND,
        });
        expect(errorSpy).toHaveBeenCalled();
      } finally {
        unsubscribe();
      }
    });

    it("rejects with SAME_STATES when target equals current state", async () => {
      const current = router.getState()!;

      await expect(
        getPluginApi(router).navigateToState(current),
      ).rejects.toMatchObject({
        code: errorCodes.SAME_STATES,
      });
    });

    it("rejects when a deactivation guard blocks the transition", async () => {
      lifecycle.addDeactivateGuard("home", () => () => false);

      const matched = getPluginApi(router).matchPath("/users");

      await expect(
        getPluginApi(router).navigateToState(matched!),
      ).rejects.toBeInstanceOf(RouterError);
      expect(router.getState()?.name).toBe("home");
    });
  });

  describe("validation (with @real-router/validation-plugin absent)", () => {
    it("does not throw on plain-object state with required fields", async () => {
      const synthetic: State = {
        name: "users",
        params: {},
        search: {},
        path: "/users",
        transition: {
          phase: "activating",
          reason: "success",
          segments: { deactivated: [], activated: [], intersection: "" },
        },
        context: {},
      };

      const next = await getPluginApi(router).navigateToState(synthetic);

      expect(next.name).toBe("users");
    });
  });

  describe("respects guards", () => {
    it("runs canActivate guard for the target route", async () => {
      const guard = vi.fn(() => true);

      lifecycle.addActivateGuard("users", () => guard);

      const matched = getPluginApi(router).matchPath("/users");

      await getPluginApi(router).navigateToState(matched!);

      expect(guard).toHaveBeenCalled();
    });

    it("guard rejection prevents state commit", async () => {
      lifecycle.addActivateGuard("users", () => () => false);

      const matched = getPluginApi(router).matchPath("/users");

      await expect(
        getPluginApi(router).navigateToState(matched!),
      ).rejects.toBeInstanceOf(RouterError);
      expect(router.getState()?.name).toBe("home");
    });
  });

  describe("fire-and-forget safety (#721)", () => {
    it("does not leak an unhandledRejection when a removed-route state is not awaited", async () => {
      const ghost: State = {
        name: "ghost.route",
        params: {},
        search: {},
        path: "/ghost",
        transition: {
          phase: "activating",
          reason: "success",
          segments: { deactivated: [], activated: [], intersection: "" },
        },
        context: {},
      };

      const leaks = await captureUnhandledRejections(() => {
        // Fire-and-forget: `void` only silences the lint rule; it attaches no
        // handler, so the unhandled-rejection behaviour under test is intact.
        void getPluginApi(router).navigateToState(ghost);
      });

      expect(leaks).toHaveLength(0);
    });
  });

  describe("UNKNOWN_ROUTE state shape", () => {
    it("accepts UNKNOWN_ROUTE as a structurally legal state.name", async () => {
      // navigateToNotFound produces UNKNOWN_ROUTE; navigateToState must
      // tolerate it for cases where a plugin re-uses such a state.
      const unknownState: State = {
        name: "@@router/UNKNOWN_ROUTE",
        params: {},
        search: {},
        path: "/anything",
        transition: {
          phase: "activating",
          reason: "success",
          segments: { deactivated: [], activated: [], intersection: "" },
        },
        context: {},
      };

      // Either resolves (transition completes) or rejects with SAME_STATES /
      // a guard error, but never with the ROUTE_NOT_FOUND that hasRoute()
      // would produce for any non-UNKNOWN unknown name.
      try {
        await getPluginApi(router).navigateToState(unknownState);
      } catch (error) {
        expect(error).toBeInstanceOf(RouterError);
        expect((error as RouterError).code).not.toBe(
          errorCodes.ROUTE_NOT_FOUND,
        );
      }
    });
  });
});

describe("navigateToState preserves route-meta (#1170)", () => {
  it("consecutive popstate navigations do not re-run ancestor guards", async () => {
    let calls = 0;
    const r = createRouter([
      {
        name: "users",
        path: "/users",
        canActivate: () => () => {
          calls++;

          return true;
        },
        children: [
          { name: "list", path: "/list" },
          { name: "profile", path: "/profile" },
        ],
      },
    ]);
    const api = getPluginApi(r);

    await r.start("/users/list"); // calls=1 (initial full activation)
    await r.navigate("users.profile"); // calls=1 (STANDARD PATH trims ancestor)

    // Two consecutive popstate-style navigations (browser back/forward drives
    // navigateToState under every URL plugin).
    const s1 = api.matchPath("/users/list");
    const s2 = api.matchPath("/users/profile");

    await api.navigateToState(s1!); // popstate #1
    await api.navigateToState(s2!); // popstate #2

    // Parity with navigate(): the shared ancestor `users` stays mounted, so its
    // canActivate is NOT re-run on popstate #2 (#1170). Before the fix,
    // navigateToState dropped the route-meta binding, so getTransitionPath fell
    // into FAST PATH 3 (full chains) and re-activated the ancestor.
    expect(calls).toBe(1);

    r.dispose();
  });
});

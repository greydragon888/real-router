import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  cloneRouter,
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

import { createTestRouter } from "../../helpers";
import {
  consultationsOn,
  installSpyValidator,
} from "../../helpers/spyValidator";

import type { RouterValidator, Router } from "@real-router/core";
import type { DependenciesApi } from "@real-router/core/api";

/**
 * Validator CALL-SITE contract tests.
 *
 * Every door below refuses through check positions (#2388), and on the inputs
 * below none consults a spy validator installed on the router (see
 * helpers/spyValidator); `consultationsOn` reads what it recorded.
 * `buildNavigationState` raises the route resolver's `state` reports through
 * the slot — for a key its route does not declare, and for a state it builds
 * on a route with a codec; the `OWNER` table of
 * `validator-boundary-authority-2322` names the plugin suite that owns each.
 * Judging the inputs is the validation-plugin's own job, tested in that
 * package.
 *
 * NOTE: not run under Stryker via property/stress files — Stryker only includes
 * `*.test.ts` (vitest.stryker.config.mts), hence these live here.
 */

type AnyDepsApi = DependenciesApi<Record<string, unknown>>;

describe("core/validator call-site contract", () => {
  let router: Router;
  let validator: RouterValidator;

  beforeEach(() => {
    router = createTestRouter();
    validator = installSpyValidator(router);
  });

  afterEach(() => {
    router.stop();
  });

  // ===========================================================================
  // getDependenciesApi and cloneRouter
  // ===========================================================================
  describe("getDependenciesApi", () => {
    it("the dependency doors and cloneRouter consult the base router's validator for nothing (#2388)", () => {
      // Their refusals are checks and their reports are diagnostic kinds;
      // `dependencies/dependency-channels-2388.test.ts` owns what each position
      // and kind receives, and when.
      const deps = getDependenciesApi(router) as unknown as AnyDepsApi;

      vi.clearAllMocks();

      deps.set("k", 1);
      // eslint-disable-next-line sonarjs/no-element-overwrite -- deliberate overwrite: the overwrite arm is one of the sites under test
      deps.set("k", 2);
      deps.setAll({ k: 3, other: 4 });
      deps.get("k");
      deps.has("k");
      deps.remove("ghost");
      deps.remove("k");
      cloneRouter(router, { cloned: 1 }).dispose();

      expect(consultationsOn(validator)).toStrictEqual([]);
    });
  });

  // ===========================================================================
  // getLifecycleApi
  // ===========================================================================
  describe("getLifecycleApi", () => {
    it("the guard doors consult the validator for nothing (#2388)", () => {
      // Name and handler are checks at the doors, the limit is a check at the
      // namespace's count position, and the count and the overwrite are kinds;
      // `lifecycle-channels-2388.test.ts` owns what each receives, and when.
      const lifecycle = getLifecycleApi(router);
      const handler = (): (() => boolean) => () => true;

      vi.clearAllMocks();

      lifecycle.addActivateGuard("home", handler);
      lifecycle.addActivateGuard("home", handler);
      lifecycle.addDeactivateGuard("home", handler);
      lifecycle.addDeactivateGuard("home", handler);
      lifecycle.removeActivateGuard("home");
      lifecycle.removeDeactivateGuard("home");

      expect(consultationsOn(validator)).toStrictEqual([]);
    });
  });

  // ===========================================================================
  // getPluginApi
  // ===========================================================================
  describe("getPluginApi", () => {
    let plugin: ReturnType<typeof getPluginApi>;

    beforeEach(() => {
      plugin = getPluginApi(router);
    });

    it("the two state builders consult the validator for nothing on these inputs (#2388)", () => {
      // Both doors' refusals are checks now, and each check keeps its own
      // door's ORDER — the two consult the same pair in opposite sequences.
      vi.clearAllMocks();

      plugin.forwardState("home", {});
      plugin.buildNavigationState("home", {});

      expect(consultationsOn(validator)).toStrictEqual([]);
    });

    it("navigateToState consults the validator for nothing (#2388)", () => {
      // Its refusals are a check at `navigateToState:entry`, and what that
      // position receives is `navigation-channels-2388.test.ts`'s.
      const state = plugin.makeState("home", {}, undefined, "/home");

      vi.clearAllMocks();

      plugin.navigateToState(state).catch(() => {});
      plugin.navigateToState(state, { replace: true }).catch(() => {});

      expect(consultationsOn(validator)).toStrictEqual([]);
    });
  });

  // ===========================================================================
  // getRoutesApi
  // ===========================================================================
  describe("getRoutesApi", () => {
    let routes: ReturnType<typeof getRoutesApi>;

    beforeEach(() => {
      routes = getRoutesApi(router);
    });

    it("route CRUD consults the validator for nothing (#2388)", () => {
      // Its consultations are checks. So is the guard limit the lifecycle
      // namespace asks while a route registers, and its reports are kinds.
      vi.clearAllMocks();

      routes.add({
        name: "loose",
        path: "/loose",
        canActivate: () => () => true,
      });
      routes.update("loose", {
        forwardTo: "admin",
        canDeactivate: () => () => true,
      });
      routes.has("loose");
      routes.get("loose");
      routes.remove("loose");
      routes.replace([{ name: "fresh", path: "/fresh" }]);

      expect(consultationsOn(validator)).toStrictEqual([]);
    });
  });
});

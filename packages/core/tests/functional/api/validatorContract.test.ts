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
 * Core runs with `ctx.validator === null` by default, so every
 * `ctx.validator?.ns.method(arg, "caller")` short-circuits and the mutation
 * tester reports the `"caller"` strings + the surrounding decision logic as
 * survived. These tests install a spy validator (see helpers/spyValidator) and
 * assert that core calls the RIGHT validator method, with the RIGHT caller
 * string, under the RIGHT condition — core's responsibility, distinct from the
 * validation-plugin's own job of validating inputs (tested in that package).
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
    it("the dependency doors and cloneRouter consult the validator for nothing (#2388)", () => {
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
  // getLifecycleApi  (kills "addActivateGuard"/"addDeactivateGuard"/
  // "removeActivateGuard"/"removeDeactivateGuard"/"canActivate"/"canDeactivate")
  // ===========================================================================
  describe("getLifecycleApi", () => {
    let lifecycle: ReturnType<typeof getLifecycleApi>;

    beforeEach(() => {
      lifecycle = getLifecycleApi(router);
    });

    it("the guard doors consult only the namespace LIMIT now (#2388)", () => {
      // Name and handler are checks; the hard limit stays on the validator
      // because it is enforced at the namespace registration choke point
      // (#961), which is a different layer from the door. The derived set is
      // what says so.
      const handler = (): (() => boolean) => () => true;

      vi.clearAllMocks();

      lifecycle.addActivateGuard("home", handler);
      lifecycle.addDeactivateGuard("home", handler);
      lifecycle.removeActivateGuard("home");
      lifecycle.removeDeactivateGuard("home");

      // ⚠ `validateCountThresholds` sits beside the limit and NEVER throws — it
      // is one of the diagnostics the emitter half of #2388 will take, so it
      // cannot follow the refusals onto this channel.
      expect(consultationsOn(validator)).toStrictEqual([
        "lifecycle.validateCountThresholds",
        "lifecycle.validateHandlerLimit",
      ]);
    });

    it("counts unique routes across definition + external guard maps (#961)", () => {
      // The limit check at the namespace choke point reads getHandlerCount, which
      // dedups across the definition map (route-config guards, isFromDefinition)
      // and the external map (getLifecycleApi). With both populated, registering
      // a further guard exercises the union/dedup branch.
      const lifecycle = getLifecycleApi(router);
      const routes = getRoutesApi(router);

      lifecycle.addActivateGuard("ext", () => () => true); // external map
      routes.add([
        { name: "def", path: "/def", canActivate: () => () => true },
      ]); // definition map

      expect(() => {
        lifecycle.addActivateGuard("ext2", () => () => true);
      }).not.toThrow();

      expect(validator.lifecycle.validateHandlerLimit).toHaveBeenCalledWith(
        expect.any(Number),
        "canActivate",
      );
    });
  });

  // ===========================================================================
  // getPluginApi  (kills "buildState"/"forwardState"/"buildNavigationState"
  // caller strings + the `options !== undefined` guard on navigateToState)
  // ===========================================================================
  describe("getPluginApi", () => {
    let plugin: ReturnType<typeof getPluginApi>;

    beforeEach(() => {
      plugin = getPluginApi(router);
    });

    it("the two state builders consult the validator for NOTHING (#2388)", () => {
      // Both doors' consultations are checks now, and each check keeps its own
      // door's ORDER — the two consult the same pair in opposite sequences.
      vi.clearAllMocks();

      plugin.forwardState("home", {});
      plugin.buildNavigationState("home", {});

      expect(consultationsOn(validator)).toStrictEqual([]);
    });

    it("navigateToState: validates options ('navigateToState') ONLY when options provided", () => {
      const state = plugin.makeState("home", {}, undefined, "/home");

      plugin.navigateToState(state).catch(() => {});

      expect(
        validator.navigation.validateNavigationOptions,
      ).not.toHaveBeenCalled();

      plugin.navigateToState(state, { replace: true }).catch(() => {});

      expect(
        validator.navigation.validateNavigationOptions,
      ).toHaveBeenCalledWith({ replace: true }, "navigateToState");
    });
  });

  // ===========================================================================
  // getRoutesApi  (kills "addRoute"/"removeRoute"/"updateRoute"/"hasRoute"/
  // "getRoute"/"replaceRoutes" caller strings + the parentName guard)
  // ===========================================================================
  describe("getRoutesApi", () => {
    let routes: ReturnType<typeof getRoutesApi>;

    beforeEach(() => {
      routes = getRoutesApi(router);
    });

    it("route CRUD consults the validator only BELOW itself now (#2388)", () => {
      // The fifteen consultations this surface made are checks. What the
      // derived set still reports is what the LIFECYCLE namespace asks while a
      // route registers, which the #1046 cells below own.
      vi.clearAllMocks();

      routes.add({ name: "loose", path: "/loose" });
      routes.update("loose", { forwardTo: "admin" });
      routes.has("loose");
      routes.get("loose");
      routes.remove("loose");
      routes.replace([{ name: "fresh", path: "/fresh" }]);

      expect(consultationsOn(validator)).toStrictEqual([]);
    });

    it("add (#1046): pre-flights the limit for a new canDeactivate ('canDeactivate')", () => {
      routes.add([
        { name: "pf-d", path: "/pf-d", canDeactivate: () => () => true },
      ]);

      expect(validator.lifecycle.validateHandlerLimit).toHaveBeenCalledWith(
        expect.any(Number),
        "canDeactivate",
      );
    });

    it("update (#1046): pre-flights the limit for a NEW canActivate slot ('canActivate')", () => {
      routes.add({ name: "pf-u", path: "/pf-u" });
      routes.update("pf-u", { canActivate: () => () => true });

      expect(validator.lifecycle.validateHandlerLimit).toHaveBeenCalledWith(
        expect.any(Number),
        "canActivate",
      );
    });

    it("replace (#1046): projects the new batch onto surviving external guards", () => {
      // An external guard survives replace's clearDefinitionGuards; the pre-flight
      // base counts external survivors (clearsDefinition). A batch name that
      // matches the external guard is an overwrite (not a new slot); a fresh name
      // is a new slot — exercising both branches of the existing-name check.
      getLifecycleApi(router).addActivateGuard("ext", () => () => true);

      routes.replace([
        { name: "ext", path: "/ext", canActivate: () => () => true },
        { name: "pf-r", path: "/pf-r", canActivate: () => () => true },
      ]);

      expect(validator.lifecycle.validateHandlerLimit).toHaveBeenCalledWith(
        expect.any(Number),
        "canActivate",
      );
    });

    it("update (#1046): overwriting an existing guard is not a new slot", () => {
      // pf-o has a definition canActivate; updating its canActivate is an
      // overwrite (existing slot), so the pre-flight finds no new slot and does
      // not falsely reject — exercising the existing-name branch.
      routes.add({
        name: "pf-o",
        path: "/pf-o",
        canActivate: () => () => true,
      });

      expect(() => {
        routes.update("pf-o", { canActivate: () => () => true });
      }).not.toThrow();
    });
  });
});

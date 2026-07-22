import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

import { createTestRouter } from "../../helpers";
import { installSpyValidator } from "../../helpers/spyValidator";

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
  // getDependenciesApi  (kills isNewKey / isChanging / bothAreNaN /
  // overwrittenKeys logic + "setDependency"/"setDependencies"/"getDependency"/
  // "removeDependency"/"hasDependency" caller strings)
  // ===========================================================================
  describe("getDependenciesApi", () => {
    let deps: AnyDepsApi;

    beforeEach(() => {
      deps = getDependenciesApi(router) as unknown as AnyDepsApi;
    });

    it("set: validates args with caller 'setDependency'", () => {
      deps.set("a", 1);

      expect(
        validator.dependencies.validateSetDependencyArgs,
      ).toHaveBeenCalledWith("a", 1, "setDependency");
    });

    it("set: new key checks count ('setDependency'), does NOT warn overwrite", () => {
      deps.set("fresh", 1);

      expect(
        validator.dependencies.validateDependencyCount,
      ).toHaveBeenCalledWith(expect.anything(), "setDependency");
      expect(validator.dependencies.warnOverwrite).not.toHaveBeenCalled();
    });

    it("set: overwrite with a CHANGED value warns once ('setDependency'), no recount", () => {
      deps.set("k", 1); // new key → validateDependencyCount
      // eslint-disable-next-line sonarjs/no-element-overwrite -- deliberate overwrite: re-setting the same key is the behavior under test
      deps.set("k", 2); // overwrite, changed → warnOverwrite

      expect(validator.dependencies.warnOverwrite).toHaveBeenCalledWith(
        "k",
        "setDependency",
      );
      // exactly once: the new-key write must NOT warn (kills isNewKey inversion)
      expect(validator.dependencies.warnOverwrite).toHaveBeenCalledTimes(1);
      // count checked only for the new key, not the overwrite
      expect(
        validator.dependencies.validateDependencyCount,
      ).toHaveBeenCalledTimes(1);
    });

    it("set: overwrite with the SAME value does NOT warn (isChanging === false)", () => {
      deps.set("s", 5);
      // eslint-disable-next-line sonarjs/no-element-overwrite -- deliberate same-value overwrite is the behavior under test
      deps.set("s", 5);

      expect(validator.dependencies.warnOverwrite).not.toHaveBeenCalled();
    });

    it("set: NaN-over-NaN does NOT warn (bothAreNaN), but a real change DOES", () => {
      deps.set("n", Number.NaN);
      // eslint-disable-next-line sonarjs/no-element-overwrite -- deliberate NaN-over-NaN overwrite is the behavior under test
      deps.set("n", Number.NaN);

      expect(validator.dependencies.warnOverwrite).not.toHaveBeenCalled();

      // proves the suppression is NaN-specific, not a blanket "never warn"
      deps.set("n", 1);

      expect(validator.dependencies.warnOverwrite).toHaveBeenCalledWith(
        "n",
        "setDependency",
      );
    });

    it("set: undefined value is a no-op write but still validates args", () => {
      deps.set("u", undefined);

      expect(
        validator.dependencies.validateSetDependencyArgs,
      ).toHaveBeenCalledWith("u", undefined, "setDependency");
      expect(deps.has("u")).toBe(false);
    });

    it("setAll: validates object, counts each new key ('setDependencies')", () => {
      deps.setAll({ a: 1, b: 2 });

      expect(
        validator.dependencies.validateDependenciesObject,
      ).toHaveBeenCalledWith({ a: 1, b: 2 }, "setDependencies");
      expect(
        validator.dependencies.validateDependencyCount,
      ).toHaveBeenCalledWith(expect.anything(), "setDependencies");
      expect(validator.dependencies.warnBatchOverwrite).not.toHaveBeenCalled();
    });

    it("setAll: collects ONLY overwritten keys for warnBatchOverwrite('setDependencies')", () => {
      deps.set("a", 1); // pre-existing
      deps.setAll({ a: 9, c: 3 }); // a overwritten, c new

      expect(validator.dependencies.warnBatchOverwrite).toHaveBeenCalledWith(
        ["a"],
        "setDependencies",
      );
    });

    it("setAll: no overwrites → warnBatchOverwrite NOT called (length > 0 guard)", () => {
      deps.setAll({ x: 1, y: 2 });

      expect(validator.dependencies.warnBatchOverwrite).not.toHaveBeenCalled();
    });

    it("setAll: undefined values are skipped (no count, no overwrite-collection)", () => {
      deps.set("keep", 1);
      // fresh spies so only the setAll() call below is measured
      const fresh = installSpyValidator(router);

      deps.setAll({ keep: undefined, brandNew: 2 });

      // 'keep' is undefined → skipped: not collected as an overwrite
      expect(fresh.dependencies.warnBatchOverwrite).not.toHaveBeenCalled();
      // only 'brandNew' is a real new key, counted under "setDependencies"
      expect(fresh.dependencies.validateDependencyCount).toHaveBeenCalledTimes(
        1,
      );
      expect(fresh.dependencies.validateDependencyCount).toHaveBeenCalledWith(
        expect.anything(),
        "setDependencies",
      );
      // 'keep' kept its old value, 'brandNew' written
      expect(deps.get("keep")).toBe(1);
      expect(deps.get("brandNew")).toBe(2);
    });

    it("get: validates name ('getDependency') then existence", () => {
      deps.set("g", 1);
      deps.get("g");

      expect(
        validator.dependencies.validateDependencyName,
      ).toHaveBeenCalledWith("g", "getDependency");
      expect(
        validator.dependencies.validateDependencyExists,
      ).toHaveBeenCalledWith("g", expect.anything());
    });

    it("remove: validates name ('removeDependency')", () => {
      deps.set("r", 1);
      deps.remove("r");

      expect(
        validator.dependencies.validateDependencyName,
      ).toHaveBeenCalledWith("r", "removeDependency");
    });

    it("remove: removing a NON-existent key warns; removing an existing one does NOT", () => {
      deps.remove("ghost");

      expect(validator.dependencies.warnRemoveNonExistent).toHaveBeenCalledWith(
        "ghost",
      );

      deps.set("real", 1);
      deps.remove("real");

      // still only the ghost warned (kills the !hasOwn inversion)
      expect(
        validator.dependencies.warnRemoveNonExistent,
      ).toHaveBeenCalledTimes(1);
    });

    it("has: validates name ('hasDependency')", () => {
      deps.has("h");

      expect(
        validator.dependencies.validateDependencyName,
      ).toHaveBeenCalledWith("h", "hasDependency");
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

    it("addActivateGuard: validates name + handler ('addActivateGuard'), limit ('canActivate')", () => {
      const handler = (): (() => boolean) => () => true;

      lifecycle.addActivateGuard("home", handler);

      expect(validator.routes.validateRouteName).toHaveBeenCalledWith(
        "home",
        "addActivateGuard",
      );
      expect(validator.lifecycle.validateHandler).toHaveBeenCalledWith(
        handler,
        "addActivateGuard",
      );
      // The hard limit is enforced at the namespace registration choke point
      // (#961), so the validator call carries (count, methodName) — the namespace
      // owns the limit source, not the API layer.
      expect(validator.lifecycle.validateHandlerLimit).toHaveBeenCalledWith(
        expect.any(Number),
        "canActivate",
      );
    });

    it("addDeactivateGuard: validates name + handler ('addDeactivateGuard'), limit ('canDeactivate')", () => {
      const handler = (): (() => boolean) => () => true;

      lifecycle.addDeactivateGuard("home", handler);

      expect(validator.routes.validateRouteName).toHaveBeenCalledWith(
        "home",
        "addDeactivateGuard",
      );
      expect(validator.lifecycle.validateHandler).toHaveBeenCalledWith(
        handler,
        "addDeactivateGuard",
      );
      // Limit enforced at the namespace choke point (#961): (count, methodName).
      expect(validator.lifecycle.validateHandlerLimit).toHaveBeenCalledWith(
        expect.any(Number),
        "canDeactivate",
      );
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

    it("removeActivateGuard: validates name ('removeActivateGuard')", () => {
      lifecycle.removeActivateGuard("home");

      expect(validator.routes.validateRouteName).toHaveBeenCalledWith(
        "home",
        "removeActivateGuard",
      );
    });

    it("removeDeactivateGuard: validates name ('removeDeactivateGuard')", () => {
      lifecycle.removeDeactivateGuard("home");

      expect(validator.routes.validateRouteName).toHaveBeenCalledWith(
        "home",
        "removeDeactivateGuard",
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

    it("buildState: validates state-builder args with caller 'buildState'", () => {
      plugin.buildState("home", {});

      expect(validator.routes.validateStateBuilderArgs).toHaveBeenCalledWith(
        "home",
        {},
        "buildState",
      );
    });

    it("forwardState: validates state-builder args with caller 'forwardState'", () => {
      plugin.forwardState("home", {});

      expect(validator.routes.validateStateBuilderArgs).toHaveBeenCalledWith(
        "home",
        {},
        "forwardState",
      );
    });

    it("buildNavigationState: validates state-builder args with caller 'buildNavigationState'", () => {
      plugin.buildNavigationState("home", {});

      expect(validator.routes.validateStateBuilderArgs).toHaveBeenCalledWith(
        "home",
        {},
        "buildNavigationState",
      );
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

    it("add: validateParentOption called ONLY when a parent option is provided", () => {
      routes.add({ name: "loose", path: "/loose" });

      expect(validator.routes.validateParentOption).not.toHaveBeenCalled();

      routes.add({ name: "child", path: "/child" }, { parent: "admin" });

      expect(validator.routes.validateParentOption).toHaveBeenCalledWith(
        "admin",
        expect.anything(),
      );
    });

    it("add: internal-route guard uses caller 'addRoute'", () => {
      routes.add({ name: "x", path: "/x" });

      expect(validator.routes.throwIfInternalRouteInArray).toHaveBeenCalledWith(
        expect.any(Array),
        "addRoute",
      );
    });

    it("remove: internal-route guard uses caller 'removeRoute'", () => {
      routes.remove("home");

      expect(validator.routes.throwIfInternalRoute).toHaveBeenCalledWith(
        "home",
        "removeRoute",
      );
    });

    it("update: internal-route guard uses caller 'updateRoute'", () => {
      routes.update("home", { defaultParams: { a: "1" } });

      expect(validator.routes.throwIfInternalRoute).toHaveBeenCalledWith(
        "home",
        "updateRoute",
      );
    });

    it("has: validates name with caller 'hasRoute'", () => {
      routes.has("home");

      expect(validator.routes.validateRouteName).toHaveBeenCalledWith(
        "home",
        "hasRoute",
      );
    });

    it("get: validates name with caller 'getRoute'", () => {
      routes.get("home");

      expect(validator.routes.validateRouteName).toHaveBeenCalledWith(
        "home",
        "getRoute",
      );
    });

    it("replace: internal-route guard uses caller 'replaceRoutes'", () => {
      routes.replace([{ name: "only", path: "/only" }]);

      expect(validator.routes.throwIfInternalRouteInArray).toHaveBeenCalledWith(
        expect.any(Array),
        "replaceRoutes",
      );
    });

    // #1046: prepare-phase handler-limit pre-flight (preflightHandlerLimit) —
    // verify core consults the limit for a NEW guard slot BEFORE the swap/commit,
    // and skips it for an overwrite (existing slot). The limit source is the
    // namespace, so the validator call carries (projectedCount, "canActivate" |
    // "canDeactivate"). Atomicity itself (no torn state on throw) is asserted in
    // @real-router/validation-plugin's handler-limit-atomicity test (real plugin).
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

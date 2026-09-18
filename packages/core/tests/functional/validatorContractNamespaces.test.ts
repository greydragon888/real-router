import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { events } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import { createTestRouter } from "../helpers";
import { consultationsOn, installSpyValidator } from "../helpers/spyValidator";

import type { RouterValidator, PluginFactory, Router } from "@real-router/core";

/**
 * Validator CALL-SITE contract — facade (Router.ts) + the two namespaces that
 * read the validator through a getter (`PluginsNamespace`,
 * `RouteLifecycleNamespace`). Companion to api/validatorContract.test.ts.
 *
 * The getter is wired as `() => getInternals(router).validator`
 * (wireNamespaces), so installing a spy validator after construction is
 * picked up dynamically by the namespaces. See helpers/spyValidator for why a
 * spy (not the real validation-plugin) is the correct probe here.
 */
describe("core/validator call-site contract (facade + namespaces)", () => {
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
  // Router.ts facade caller strings
  // ===========================================================================
  describe("facade", () => {
    it("isActiveRoute: validates name with caller 'isActiveRoute'", () => {
      router.isActiveRoute("home");

      expect(validator.routes.validateRouteName).toHaveBeenCalledWith(
        "home",
        "isActiveRoute",
      );
    });

    it("BOTH printers consult the validator at ENTRY, and neither for the copy's values", () => {
      router.buildPath("items", { id: "1" });
      getPluginApi(router).buildPathResolved("items", { id: "1" });

      // Both halves since #2238: the plugin reports the retired single-bag
      // spelling out of this call, so the bag travels with the name it is about.
      expect(validator.routes.validateBuildPathArgs).toHaveBeenCalledWith(
        "items",
        { id: "1" },
      );

      // ⚑ The value walk left this tier for the check channel (#2388): core asks
      // at each printer's `…:params` position instead, because those are handed
      // `ownParams` — the copy that ships. A call here would mean the refusal is
      // raised TWICE, on two different objects.
      //
      // ⚠ No assertion that `validateParams` was NOT called: the member has left
      // `RouterValidator` entirely (#2388), so the compiler owns that now and a
      // runtime cell would only restate it.
    });

    it("CONTROL — the consultation census sees a door that still consults", () => {
      // Without this the two cells below would agree with a census that reports
      // an empty set for every door, including one nothing was converted at.
      router.buildPath("items", { id: "1" });

      expect(consultationsOn(validator)).not.toStrictEqual([]);
    });

    it("canNavigateTo consults the validator for NOTHING — its refusals are checks (#2388)", async () => {
      await router.start("/home");
      vi.clearAllMocks();

      router.canNavigateTo("items", { id: "1" });

      expect(consultationsOn(validator)).toStrictEqual([]);
    });

    it("navigate: the facade consults nothing, and the pipeline below is its own layer (#2388)", async () => {
      await router.start("/home");
      vi.clearAllMocks();

      await router.navigate("items", { id: "1" });

      // ⚑ Not empty, and the remainder is the statement: the facade's four
      // consultations became one check, while the pipeline underneath still
      // judges the state it BUILDS. A door is converted at its own layer.
      expect(consultationsOn(validator)).toStrictEqual([
        "routes.validateStateBuilderArgs",
      ]);
    });

    it("navigateToDefault: validates options with caller 'navigateToDefault'", async () => {
      await router.start("/home");

      // defaultRoute === "home" === current state → rejects SAME_STATES; the
      // validator runs before the navigation, so swallow the rejection.
      await router.navigateToDefault().catch(() => {});

      expect(
        validator.navigation.validateNavigationOptions,
      ).toHaveBeenCalledWith(expect.anything(), "navigateToDefault");
    });
  });

  // ===========================================================================
  // PluginsNamespace warns (validatePluginKeys / warnBatchDuplicates /
  // warnPluginAfterStart / warnPluginMethodType)
  // ===========================================================================
  describe("PluginsNamespace", () => {
    it("usePlugin: validates plugin keys", () => {
      const plugin: PluginFactory = () => ({});

      router.usePlugin(plugin);

      expect(validator.plugins.validatePluginKeys).toHaveBeenCalledTimes(1);
    });

    it("usePlugin: a duplicate within the batch warns once", () => {
      const plugin: PluginFactory = () => ({});

      router.usePlugin(plugin, plugin);

      expect(validator.plugins.warnBatchDuplicates).toHaveBeenCalledTimes(1);
    });

    it("usePlugin: distinct plugins do NOT trigger batch-duplicate warning", () => {
      router.usePlugin(
        () => ({}),
        () => ({}),
      );

      expect(validator.plugins.warnBatchDuplicates).not.toHaveBeenCalled();
    });

    it("usePlugin after start warns about onStart being missed ('onStart')", async () => {
      await router.start("/home");

      router.usePlugin(() => ({
        onStart() {
          /* never called — registered after start */
        },
      }));

      expect(validator.plugins.warnPluginAfterStart).toHaveBeenCalledWith(
        "onStart",
      );
    });

    it("usePlugin BEFORE start does NOT warn about onStart", () => {
      router.usePlugin(() => ({
        onStart() {
          /* will be called on start */
        },
      }));

      expect(validator.plugins.warnPluginAfterStart).not.toHaveBeenCalled();
    });

    it("usePlugin: a non-function lifecycle method warns ('onStart')", () => {
      router.usePlugin(
        () =>
          ({
            onStart: "not a function",
          }) as unknown as ReturnType<PluginFactory>,
      );

      expect(validator.plugins.warnPluginMethodType).toHaveBeenCalledWith(
        "onStart",
      );
    });
  });

  // ===========================================================================
  // RouteLifecycleNamespace warns (warnOverwrite / validateCountThresholds /
  // warnAsyncGuardSync) + the "canActivate"/"canDeactivate"/"canNavigateTo"
  // methodName strings
  // ===========================================================================
  describe("RouteLifecycleNamespace", () => {
    let lifecycle: ReturnType<typeof getLifecycleApi>;

    beforeEach(() => {
      lifecycle = getLifecycleApi(router);
    });

    it("first activate guard checks count thresholds with type 'canActivate'", () => {
      lifecycle.addActivateGuard("home", () => () => true);

      expect(validator.lifecycle.validateCountThresholds).toHaveBeenCalledWith(
        expect.any(Number),
        "canActivate",
      );
      expect(validator.lifecycle.warnOverwrite).not.toHaveBeenCalled();
    });

    it("second activate guard on same route warns overwrite ('activate','canActivate')", () => {
      lifecycle.addActivateGuard("home", () => () => true);
      lifecycle.addActivateGuard("home", () => () => false);

      expect(validator.lifecycle.warnOverwrite).toHaveBeenCalledWith(
        "home",
        "activate",
        "canActivate",
      );
    });

    it("second deactivate guard on same route warns overwrite ('deactivate','canDeactivate')", () => {
      lifecycle.addDeactivateGuard("home", () => () => true);
      lifecycle.addDeactivateGuard("home", () => () => false);

      expect(validator.lifecycle.warnOverwrite).toHaveBeenCalledWith(
        "home",
        "deactivate",
        "canDeactivate",
      );
    });

    it("canNavigateTo: an async canActivate guard warns sync-check ('canNavigateTo')", async () => {
      await router.start("/home");

      lifecycle.addActivateGuard("items", () => async () => true);

      router.canNavigateTo("items", { id: "1" });

      expect(validator.lifecycle.warnAsyncGuardSync).toHaveBeenCalledWith(
        "items",
        "canNavigateTo",
      );
    });

    it("canNavigateTo: an async canDeactivate guard warns sync-check ('canNavigateTo')", async () => {
      await router.start("/home");

      lifecycle.addDeactivateGuard("home", () => async () => true);

      router.canNavigateTo("items", { id: "1" });

      expect(validator.lifecycle.warnAsyncGuardSync).toHaveBeenCalledWith(
        "home",
        "canNavigateTo",
      );
    });
  });

  // ===========================================================================
  // EventBusNamespace — proactive listener-count threshold (#1188). subscribe()
  // and getPluginApi().addEventListener() both feed the emitter's per-event
  // cap; core reads the pre-add count and calls the validator so the plugin can
  // warn/error before the bare-Error hard cap ever throws.
  // ===========================================================================
  describe("EventBusNamespace", () => {
    it("subscribe: checks listener-count thresholds ('$$success','subscribe')", () => {
      router.subscribe(() => {});

      expect(validator.eventBus.validateCountThresholds).toHaveBeenCalledWith(
        expect.any(Number),
        events.TRANSITION_SUCCESS,
        "subscribe",
      );
    });

    it("addEventListener: checks listener-count thresholds (eventName,'addEventListener')", () => {
      getPluginApi(router).addEventListener(events.ROUTER_START, () => {});

      expect(validator.eventBus.validateCountThresholds).toHaveBeenCalledWith(
        expect.any(Number),
        events.ROUTER_START,
        "addEventListener",
      );
    });
  });
});

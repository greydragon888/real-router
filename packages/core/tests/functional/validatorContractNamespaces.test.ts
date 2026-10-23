import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { events } from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

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

    it("usePlugin after start REPORTS the missed onStart, on the diagnostic channel (#2388)", async () => {
      // ⚑ Not a validator consultation any more. Core STATES what happened and
      // whether anyone is told is the listening plugin's business — which is
      // what separates a diagnostic from a check: this one cannot refuse the
      // registration it describes.
      const seen: string[] = [];

      getPluginApi(router).subscribeDiagnostic(
        "PLUGIN_AFTER_START",
        (methodName) => {
          seen.push(methodName);
        },
      );

      await router.start("/home");

      router.usePlugin(() => ({
        onStart() {
          /* never called — registered after start */
        },
      }));

      expect(seen).toStrictEqual(["onStart"]);
    });

    it("usePlugin BEFORE start reports nothing", () => {
      const seen: string[] = [];

      getPluginApi(router).subscribeDiagnostic(
        "PLUGIN_AFTER_START",
        (methodName) => {
          seen.push(methodName);
        },
      );

      router.usePlugin(() => ({
        onStart() {
          /* will be called on start */
        },
      }));

      expect(seen).toStrictEqual([]);
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
  // warnAsyncGuardSync) + the methodName string each door hands them
  // ===========================================================================
  describe("RouteLifecycleNamespace", () => {
    const BOOLEAN_ANSWERS = [true, false] as const;
    /** A guard answering a non-boolean, and the value core hands over. */
    const HANDED_OVER = [
      ["directly", (): unknown => "login", "login"],
      ["through a promise", (): unknown => Promise.resolve(0), 0],
    ] as const;
    /** A guard answering a boolean, directly or through a promise. */
    const KEPT = [
      ["true", (): unknown => true],
      ["false", (): unknown => false],
      ["Promise<true>", (): unknown => Promise.resolve(true)],
      ["Promise<false>", (): unknown => Promise.resolve(false)],
    ] as const;
    /** A diagnostic of the synchronous ask, and a guard answer that reaches it. */
    const SYNC_DIAGNOSTICS = [
      ["warnAsyncGuardSync", (): unknown => Promise.resolve(true)],
      ["warnNonBooleanGuardSync", (): unknown => "login"],
    ] as const;

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
      expect(
        validator.lifecycle.warnNonBooleanGuardSync,
      ).not.toHaveBeenCalled();
    });

    // A thenable may be a function: the ask reads `then` off it as off an
    // object, so it is a pending answer rather than a non-boolean one (#2823).
    it("canNavigateTo: a callable thenable warns sync-check, not non-boolean ('canNavigateTo')", async () => {
      await router.start("/home");

      lifecycle.addActivateGuard(
        "items",
        () => () =>
          Object.assign((): void => {}, {
            // eslint-disable-next-line unicorn/no-thenable -- a callable thenable IS the subject
            then: (): void => {},
          }) as never,
      );

      router.canNavigateTo("items", { id: "1" });

      expect(
        validator.lifecycle.warnAsyncGuardSync,
      ).toHaveBeenCalledExactlyOnceWith("items", "canNavigateTo");
      expect(
        validator.lifecycle.warnNonBooleanGuardSync,
      ).not.toHaveBeenCalled();
    });

    // #2823 — a non-boolean answer is not a pending one: the ask names it as
    // what it is, and the async report stays the thenable's.
    it("canNavigateTo: a non-boolean answer warns non-boolean, with the answer ('canNavigateTo')", async () => {
      await router.start("/home");

      lifecycle.addActivateGuard("items", () => () => "login" as never);

      router.canNavigateTo("items", { id: "1" });

      expect(
        validator.lifecycle.warnNonBooleanGuardSync,
      ).toHaveBeenCalledExactlyOnceWith("items", "login", "canNavigateTo");
      expect(validator.lifecycle.warnAsyncGuardSync).not.toHaveBeenCalled();
    });

    it.each(BOOLEAN_ANSWERS)(
      "canNavigateTo: answer %s warns nothing",
      async (answer) => {
        await router.start("/home");

        lifecycle.addActivateGuard("items", () => () => answer);

        router.canNavigateTo("items", { id: "1" });

        expect(
          validator.lifecycle.warnNonBooleanGuardSync,
        ).not.toHaveBeenCalled();
        expect(validator.lifecycle.warnAsyncGuardSync).not.toHaveBeenCalled();
      },
    );

    // The transition hands the answer over with no door: several calls start
    // one (#2823).
    it.each(HANDED_OVER)(
      "navigate: a non-boolean answer, given %s, is handed to warnNonBooleanGuard",
      async (_how, guard, expected) => {
        await router.start("/home");

        lifecycle.addActivateGuard("items", () => guard as never);

        await expect(router.navigate("items", { id: "1" })).rejects.toThrow();

        expect(
          validator.lifecycle.warnNonBooleanGuard,
        ).toHaveBeenCalledExactlyOnceWith("items", expected);
      },
    );

    it.each(KEPT)(
      "navigate: answer %s hands nothing over",
      async (_, guard) => {
        await router.start("/home");

        lifecycle.addActivateGuard("items", () => guard as never);

        await router.navigate("items", { id: "1" }).catch(() => undefined);

        expect(validator.lifecycle.warnNonBooleanGuard).not.toHaveBeenCalled();
      },
    );

    // A diagnostic is not a verdict: one that throws — a validator without the
    // member — leaves the synchronous ask its answer (#2823).
    it.each(SYNC_DIAGNOSTICS)(
      "canNavigateTo: a throwing %s leaves the answer false",
      async (member, guard) => {
        await router.start("/home");

        vi.mocked(validator.lifecycle[member]).mockImplementation(() => {
          throw new TypeError(`${member} is not a function`);
        });
        lifecycle.addActivateGuard("items", () => guard as never);

        expect(router.canNavigateTo("items", { id: "1" })).toBe(false);
        expect(validator.lifecycle[member]).toHaveBeenCalledTimes(1);
      },
    );

    // The transition's diagnostic sits outside the guard's error channel: one
    // that throws fails the navigation with its own error, and the state stays.
    // That is what a validator without the member makes of the transition.
    it.each(HANDED_OVER)(
      "navigate: a throwing warnNonBooleanGuard fails the navigation with its error, given %s",
      async (_how, guard) => {
        const missing = new TypeError("warnNonBooleanGuard is not a function");

        await router.start("/home");

        vi.mocked(validator.lifecycle.warnNonBooleanGuard).mockImplementation(
          () => {
            throw missing;
          },
        );
        lifecycle.addActivateGuard("items", () => guard as never);

        await expect(router.navigate("items", { id: "1" })).rejects.toBe(
          missing,
        );
        expect(router.getState()?.name).toBe("home");
        expect(validator.lifecycle.warnNonBooleanGuard).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it("CONTROL — the #2823 tables hold the rows they name", () => {
      expect(BOOLEAN_ANSWERS).toHaveLength(2);
      expect(HANDED_OVER).toHaveLength(2);
      expect(KEPT).toHaveLength(4);
      expect(SYNC_DIAGNOSTICS).toHaveLength(2);

      // The promise rows are this suite's reach into the awaited half.
      const promised = (guard: () => unknown): boolean =>
        guard() instanceof Promise;

      expect(HANDED_OVER.filter(([, guard]) => promised(guard))).toHaveLength(
        1,
      );
      expect(KEPT.filter(([, guard]) => promised(guard))).toHaveLength(2);
    });

    it("navigateToNotFound: an async canDeactivate guard warns sync-check ('navigateToNotFound')", async () => {
      await router.start("/home");

      lifecycle.addDeactivateGuard("home", () => async () => true);

      expect(() => router.navigateToNotFound("/nowhere")).toThrow();
      expect(validator.lifecycle.warnAsyncGuardSync).toHaveBeenCalledWith(
        "home",
        "navigateToNotFound",
      );
    });

    it("replace: an async canActivate on the path's new owner warns sync-check ('replace')", async () => {
      await router.start("/home");

      getRoutesApi(router).replace([
        { name: "landing", path: "/home", canActivate: () => async () => true },
        { name: "home", path: "/old-home" },
      ]);

      expect(validator.lifecycle.warnAsyncGuardSync).toHaveBeenCalledWith(
        "landing",
        "replace",
      );
    });
  });

  // ===========================================================================
  // EventBusNamespace — proactive listener-count threshold (#1188). Core asks
  // the validator for three doors and hands it the door's name: subscribe(),
  // getPluginApi().addEventListener(), and usePlugin() for a plugin's hooks
  // (#2821). It counts before the add and hands the validator the count the
  // add will make, so the plugin can warn/error before the bare-Error hard cap
  // ever throws.
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

    it("usePlugin: checks listener-count thresholds for a plugin's hooks (eventName,'usePlugin')", () => {
      router.usePlugin(() => ({ onTransitionSuccess: () => {} }));

      expect(validator.eventBus.validateCountThresholds).toHaveBeenCalledWith(
        expect.any(Number),
        events.TRANSITION_SUCCESS,
        "usePlugin",
      );
    });
  });
});

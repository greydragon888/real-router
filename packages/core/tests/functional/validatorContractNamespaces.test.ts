import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { getPluginApi } from "@real-router/core/api";

import { createTestRouter } from "../helpers";
import { consultationsOn, installSpyValidator } from "../helpers/spyValidator";

import type {
  Plugin,
  PluginFactory,
  RouterValidator,
  Router,
} from "@real-router/core";

/**
 * Validator CALL-SITE contract — the facade (Router.ts) and `usePlugin`.
 * Companion to api/validatorContract.test.ts. See helpers/spyValidator for why
 * a spy (not the real validation-plugin) is the correct probe here.
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
  // usePlugin refuses and reports on its positions and kinds; what they
  // receive is `plugin-channels-2388.test.ts`'s, and the listener count of a
  // hook is `lifecycle-channels-2388.test.ts`'s.
  // ===========================================================================
  describe("PluginsNamespace", () => {
    it("usePlugin consults the validator for nothing (#2388)", () => {
      const repeated: PluginFactory = () => ({});

      vi.clearAllMocks();

      router.usePlugin(() => ({ teardown: vi.fn() }));
      router.usePlugin(repeated, repeated);
      router.usePlugin(() => ({ onStart: "skipped" }) as unknown as Plugin);
      router.usePlugin(() => ({ onStop: vi.fn() }));

      expect(consultationsOn(validator)).toStrictEqual([]);
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
  });
});

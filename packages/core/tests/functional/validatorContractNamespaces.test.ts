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
  // Router.ts facade
  // ===========================================================================
  describe("facade", () => {
    it("the render-path doors and the state builders consult the validator for NOTHING (#2388)", async () => {
      // Their refusals are checks, and the report `buildPath` and
      // `isActiveRoute` raise is a diagnostic kind; what each position and
      // kind receives is `render-path-channels-2388.test.ts`'s.
      await router.start("/home");
      vi.clearAllMocks();

      const api = getPluginApi(router);
      const state = router.getState();

      router.buildPath("items", { id: "1" });
      router.isActiveRoute("home");
      router.areStatesEqual(state, state);
      router.shouldUpdateNode("home");
      api.buildPathResolved("items", { id: "1" });
      api.matchPath("/home");
      api.makeState("home", {}, undefined, "/home");

      expect(consultationsOn(validator)).toStrictEqual([]);
    });

    it("CONTROL — the consultation census sees a consultation made on purpose", () => {
      // Without this the cells around it would agree with a census that
      // reports an empty set for every door. The consultation is made here
      // rather than through a door, so a door core converts later cannot
      // empty the control along with the census.
      const probe = validator as unknown as Record<
        string,
        Record<string, () => void>
      >;

      probe.purpose.built();

      expect(consultationsOn(validator)).toStrictEqual(["purpose.built"]);
    });

    it("canNavigateTo consults the validator for NOTHING — its refusals are checks (#2388)", async () => {
      await router.start("/home");
      vi.clearAllMocks();

      router.canNavigateTo("items", { id: "1" });

      expect(consultationsOn(validator)).toStrictEqual([]);
    });

    it("navigate consults the validator for nothing, the pipeline below included (#2388)", async () => {
      // The pipeline asks `navigate:state` about the state it BUILDS; what that
      // position receives is `render-path-channels-2388.test.ts`'s.
      await router.start("/home");
      vi.clearAllMocks();

      await router.navigate("items", { id: "1" });

      expect(consultationsOn(validator)).toStrictEqual([]);
    });

    it("navigateToDefault consults the validator for nothing, the pipeline below included (#2388)", async () => {
      // Its refusals are checks at `navigateToDefault:entry` and
      // `navigateToDefault:route`, and its report a diagnostic kind; what each
      // receives is `navigation-channels-2388.test.ts`'s.
      await router.start("/home");
      vi.clearAllMocks();

      // defaultRoute === "home" === current state → rejects SAME_STATES.
      await router.navigateToDefault().catch(() => {});

      expect(consultationsOn(validator)).toStrictEqual([]);
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

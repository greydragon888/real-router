import {
  createRouter,
  errorCodes,
  getPluginApi,
  RouterError,
} from "@real-router/core";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createSafeBrowser } from "../../src/browser";
import { browserPluginFactory } from "../../src/plugin";
import {
  shouldSkipTransition,
  handleMissingState,
  handleTransitionResult,
  validateOptions,
  createStateFromEvent,
} from "../../src/utils";

import type { Browser } from "../../src/types";
import type { Router, State } from "@real-router/core";

let router: Router;
let browser: Browser;

const routerConfig = [
  { name: "home", path: "/home" },
  { name: "users", path: "/users" },
];

describe("Utils", () => {
  beforeEach(() => {
    browser = createSafeBrowser();
    router = createRouter(routerConfig, {
      defaultRoute: "home",
    });
  });

  afterEach(() => {
    router.stop();
  });

  describe("createStateFromEvent", () => {
    it("uses fallback for missing meta.id (line 112)", async () => {
      await router.start("/home");

      // Create event with state that has meta WITHOUT id property (not present at all)
      // isMetaFields allows missing properties - only validates if present
      const evt = {
        state: {
          name: "home",
          params: {},
          path: "/home",
          meta: {
            // id is NOT in the object - fallback to 1 is used
            // Note: makeState then overrides with ++stateId, but the fallback branch is executed
            params: {},
          },
        },
      } as PopStateEvent;

      const state = createStateFromEvent(
        evt,
        getPluginApi(router),
        browser,
        {},
      );

      expect(state).toBeDefined();
      // Note: id is overwritten by makeState with ++stateId (value 2 after router.start)
      // The fallback ?? 1 IS executed for coverage, but the result is overwritten
      expect(state?.meta?.id).toBeGreaterThanOrEqual(1);
    });

    it("uses fallback for missing meta.params (line 113)", async () => {
      await router.start("/home");

      // Create event with state that has meta WITHOUT params property
      const evt = {
        state: {
          name: "home",
          params: {},
          path: "/home",
          meta: {
            id: 5,
            // params is NOT in the object - should fallback to {}
          },
        },
      } as PopStateEvent;

      const state = createStateFromEvent(
        evt,
        getPluginApi(router),
        browser,
        {},
      );

      expect(state).toBeDefined();
      expect(state?.meta?.params).toStrictEqual({});
    });

    it("uses all fallbacks when meta is empty (lines 112-114)", async () => {
      await router.start("/home");

      const evt = {
        state: {
          name: "home",
          params: {},
          path: "/home",
          meta: {},
        },
      } as PopStateEvent;

      const state = createStateFromEvent(
        evt,
        getPluginApi(router),
        browser,
        {},
      );

      expect(state).toBeDefined();
      expect(state?.meta?.id).toBeGreaterThanOrEqual(1);
      expect(state?.meta?.params).toStrictEqual({});
    });

    it("matches path when event has no state (new navigation)", async () => {
      await router.start("/home");
      globalThis.history.replaceState({}, "", "/home");

      const evt = {
        state: null,
      } as PopStateEvent;

      const state = createStateFromEvent(
        evt,
        getPluginApi(router),
        browser,
        {},
      );

      expect(state).toBeDefined();
      expect(state?.name).toBe("home");
    });
  });

  describe("shouldSkipTransition", () => {
    it("returns true when newState is undefined (line 136)", () => {
      const result = shouldSkipTransition(undefined, undefined, router);

      expect(result).toBe(true);
    });

    it("returns true when newState is null (line 136)", () => {
      // @ts-expect-error - testing null case
      const result = shouldSkipTransition(null, undefined, router);

      expect(result).toBe(true);
    });

    it("returns false when newState is valid and currentState is undefined", () => {
      const newState: State = {
        name: "home",
        params: {},
        path: "/home",
        meta: { id: 1, params: {} },
      };

      const result = shouldSkipTransition(newState, undefined, router);

      expect(result).toBe(false);
    });

    it("returns true when states are equal", () => {
      const state: State = {
        name: "home",
        params: {},
        path: "/home",
        meta: { id: 1, params: {} },
      };

      const result = shouldSkipTransition(state, state, router);

      expect(result).toBe(true);
    });
  });

  describe("handleMissingState", () => {
    it("returns false when no default route is configured (line 159)", () => {
      const routerWithoutDefault = createRouter(routerConfig);

      const result = handleMissingState(
        routerWithoutDefault,
        getPluginApi(routerWithoutDefault),
        {},
      );

      expect(result).toBe(false);
    });

    it("returns true and navigates to default route when configured", async () => {
      await router.start("/home");
      const navigateSpy = vi.spyOn(router, "navigateToDefault");

      const result = handleMissingState(router, getPluginApi(router), {
        replace: true,
      });

      expect(result).toBe(true);
      expect(navigateSpy).toHaveBeenCalledWith({
        replace: true,
        reload: true,
      });

      router.stop();
    });
  });

  describe("handleTransitionResult", () => {
    const options = { preserveHash: false };
    const fromState: State = {
      name: "home",
      params: {},
      path: "/home",
      meta: { id: 1, params: {} },
    };
    const toState: State = {
      name: "users",
      params: {},
      path: "/users",
      meta: { id: 2, params: {} },
    };

    beforeEach(async () => {
      // Need browser plugin for buildUrl
      router.usePlugin(browserPluginFactory({}, browser));
      await router.start();
    });

    it("returns early when no error", () => {
      const replaceStateSpy = vi.spyOn(browser, "replaceState");

      handleTransitionResult(
        undefined,
        toState,
        fromState,
        false,
        router,
        browser,
        options,
      );

      // Success case now just returns - event is emitted by navigateToState
      expect(replaceStateSpy).not.toHaveBeenCalled();
    });

    it("updates browser state on CANNOT_DEACTIVATE error (lines 236-244)", () => {
      const replaceStateSpy = vi.spyOn(browser, "replaceState");

      const cannotDeactivateError = new RouterError(
        errorCodes.CANNOT_DEACTIVATE,
        {
          segment: "home",
        },
      );

      handleTransitionResult(
        cannotDeactivateError,
        toState,
        fromState,
        false, // isNewState = false (not new state, from history)
        router,
        browser,
        options,
      );

      expect(replaceStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: fromState.name,
          params: fromState.params,
          path: fromState.path,
        }),
        "",
        "/home",
      );
    });

    it("does not update browser state on CANNOT_DEACTIVATE if isNewState is true", () => {
      const replaceStateSpy = vi.spyOn(browser, "replaceState");

      const cannotDeactivateError = new RouterError(
        errorCodes.CANNOT_DEACTIVATE,
        { segment: "home" },
      );

      handleTransitionResult(
        cannotDeactivateError,
        toState,
        fromState,
        true, // isNewState = true
        router,
        browser,
        options,
      );

      expect(replaceStateSpy).not.toHaveBeenCalled();
    });

    it("does not update browser state on other errors", () => {
      const replaceStateSpy = vi.spyOn(browser, "replaceState");

      const otherError = new RouterError(errorCodes.ROUTE_NOT_FOUND, {
        segment: "unknown",
      });

      handleTransitionResult(
        otherError,
        toState,
        fromState,
        false,
        router,
        browser,
        options,
      );

      expect(replaceStateSpy).not.toHaveBeenCalled();
    });
  });

  describe("validateOptions", () => {
    it("ignores unknown option keys not in defaultOptions (line 302)", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Pass an option key that doesn't exist in defaultOptions
      const result = validateOptions(
        { unknownOption: "value", anotherUnknown: 123 } as any,
        {
          useHash: false,
          preserveHash: false,
          forceDeactivate: false,
          mergeState: false,
          base: "",
          hashPrefix: "",
        },
      );

      // Should return false (no type errors for known options)
      // Unknown options are simply ignored
      expect(result).toBe(false);

      // Should NOT warn about unknown options (they're ignored silently)
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("unknownOption"),
      );

      consoleSpy.mockRestore();
    });

    it("does not warn when hashPrefix is empty string in history mode (line 329)", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = validateOptions(
        // hashPrefix is empty string - should not trigger warning
        { useHash: false, hashPrefix: "" } as any,
        {
          useHash: false,
          preserveHash: false,
          forceDeactivate: false,
          mergeState: false,
          base: "",
          hashPrefix: "",
        },
      );

      expect(result).toBe(false);
      // Should NOT warn because hashPrefix is empty
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("hashPrefix ignored"),
      );

      consoleSpy.mockRestore();
    });

    it("does not warn when hashPrefix is undefined in history mode (line 329)", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = validateOptions(
        // hashPrefix is undefined - should not trigger warning
        { useHash: false, hashPrefix: undefined } as any,
        {
          useHash: false,
          preserveHash: false,
          forceDeactivate: false,
          mergeState: false,
          base: "",
          hashPrefix: "",
        },
      );

      expect(result).toBe(false);
      // Should NOT warn because hashPrefix is undefined
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("hashPrefix ignored"),
      );

      consoleSpy.mockRestore();
    });

    it("returns false when opts is undefined (line 294)", () => {
      const result = validateOptions(undefined, {
        useHash: false,
        preserveHash: false,
        forceDeactivate: false,
        mergeState: false,
        base: "",
        hashPrefix: "",
      });

      expect(result).toBe(false);
    });

    it("returns false for valid options", () => {
      const result = validateOptions(
        { useHash: true },
        {
          useHash: false,
          preserveHash: false,
          forceDeactivate: false,
          mergeState: false,
          base: "",
          hashPrefix: "",
        },
      );

      expect(result).toBe(false);
    });

    it("returns true and warns for invalid option types", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = validateOptions(
        // @ts-expect-error - testing invalid type
        { useHash: "invalid" },
        {
          useHash: false,
          preserveHash: false,
          forceDeactivate: false,
          mergeState: false,
          base: "",
          hashPrefix: "",
        },
      );

      expect(result).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Invalid type for 'useHash'"),
      );

      consoleSpy.mockRestore();
    });
  });
});

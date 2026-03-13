import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  arbParamName,
  arbParamValue,
  arbTwoDifferentParamNames,
  arbTwoDistinctValues,
  createStartedRouter,
  createStartedRouterWithDefaults,
  nextId,
  NUM_RUNS,
} from "./helpers";

// =============================================================================
// Persistence
// =============================================================================

describe("persistence: persistent param survives navigation to a different route", () => {
  test.prop([arbParamName, arbParamValue], { numRuns: NUM_RUNS.async })(
    "param set on routeA is present in routeB state without re-passing",
    async (paramName, paramValue) => {
      const router = await createStartedRouter([paramName]);

      const idA = nextId();
      const idB = nextId();

      await router.navigate("routeA", { id: idA, [paramName]: paramValue });
      await router.navigate("routeB", { id: idB });

      expect(router.getState()?.params[paramName]).toBe(paramValue);

      router.stop();
    },
  );

  test.prop([arbParamName, arbParamValue], { numRuns: NUM_RUNS.async })(
    "param persists across two consecutive cross-route navigations",
    async (paramName, paramValue) => {
      const router = await createStartedRouter([paramName]);

      const idA = nextId();
      const idB = nextId();
      const idC = nextId();

      await router.navigate("routeA", { id: idA, [paramName]: paramValue });
      await router.navigate("routeB", { id: idB });
      await router.navigate("routeC", { id: idC });

      expect(router.getState()?.params[paramName]).toBe(paramValue);

      router.stop();
    },
  );
});

// =============================================================================
// Override
// =============================================================================

describe("override: explicitly passed param overrides the stored persistent value", () => {
  test.prop([arbParamName, arbTwoDistinctValues], { numRuns: NUM_RUNS.async })(
    "explicit override value wins over previously stored value on the same navigation",
    async (paramName, [initialValue, overrideValue]) => {
      const router = await createStartedRouter([paramName]);

      const idA = nextId();
      const idB = nextId();

      await router.navigate("routeA", { id: idA, [paramName]: initialValue });
      await router.navigate("routeB", { id: idB, [paramName]: overrideValue });

      expect(router.getState()?.params[paramName]).toBe(overrideValue);

      router.stop();
    },
  );

  test.prop([arbParamName, arbTwoDistinctValues], { numRuns: NUM_RUNS.async })(
    "override value becomes the new persistent value for subsequent navigations",
    async (paramName, [initialValue, overrideValue]) => {
      const router = await createStartedRouter([paramName]);

      const idA = nextId();
      const idB = nextId();
      const idC = nextId();

      await router.navigate("routeA", { id: idA, [paramName]: initialValue });
      await router.navigate("routeB", { id: idB, [paramName]: overrideValue });
      await router.navigate("routeC", { id: idC });

      expect(router.getState()?.params[paramName]).toBe(overrideValue);

      router.stop();
    },
  );
});

// =============================================================================
// No-Clobber
// =============================================================================

describe("no-clobber: route path params are not modified by plugin injection", () => {
  test.prop([arbParamName, arbParamValue], { numRuns: NUM_RUNS.async })(
    "id param of destination route equals exactly what was passed",
    async (paramName, paramValue) => {
      const router = await createStartedRouter([paramName]);

      const idA = nextId();
      const idB = nextId();

      await router.navigate("routeA", { id: idA, [paramName]: paramValue });
      await router.navigate("routeB", { id: idB });

      expect(router.getState()?.params.id).toBe(idB);

      router.stop();
    },
  );

  test.prop([arbParamName, arbParamValue], { numRuns: NUM_RUNS.async })(
    "id param is always the explicitly passed value across multiple navigations",
    async (paramName, paramValue) => {
      const router = await createStartedRouter([paramName]);

      const idA = nextId();
      const idB = nextId();
      const idC = nextId();

      await router.navigate("routeA", { id: idA, [paramName]: paramValue });
      await router.navigate("routeB", { id: idB });
      await router.navigate("routeC", { id: idC });

      expect(router.getState()?.params.id).toBe(idC);

      router.stop();
    },
  );
});

// =============================================================================
// Scope
// =============================================================================

describe("scope: persistent params apply ONLY to params listed in plugin config", () => {
  test.prop([arbTwoDifferentParamNames, arbParamValue], {
    numRuns: NUM_RUNS.async,
  })(
    "param not in plugin config is not injected into subsequent navigations",
    async ([configuredName, unconfiguredName], paramValue) => {
      const router = await createStartedRouter([configuredName]);

      const idA = nextId();
      const idB = nextId();

      await router.navigate("routeA", {
        id: idA,
        [unconfiguredName]: paramValue,
      });
      await router.navigate("routeB", { id: idB });

      expect(router.getState()?.params).not.toHaveProperty(unconfiguredName);

      router.stop();
    },
  );

  test.prop([arbTwoDifferentParamNames, arbParamValue, arbParamValue], {
    numRuns: NUM_RUNS.async,
  })(
    "configured param persists while unconfigured param is absent on next navigation",
    async (
      [configuredName, unconfiguredName],
      configuredValue,
      unconfiguredValue,
    ) => {
      const router = await createStartedRouter([configuredName]);

      const idA = nextId();
      const idB = nextId();

      await router.navigate("routeA", {
        id: idA,
        [configuredName]: configuredValue,
        [unconfiguredName]: unconfiguredValue,
      });
      await router.navigate("routeB", { id: idB });

      const state = router.getState();

      expect(state?.params[configuredName]).toBe(configuredValue);
      expect(state?.params).not.toHaveProperty(unconfiguredName);

      router.stop();
    },
  );
});

// =============================================================================
// Idempotency
// =============================================================================

describe("idempotency: double merge does not duplicate persistent params", () => {
  test.prop([arbParamName, arbParamValue], { numRuns: NUM_RUNS.async })(
    "buildPath with explicit param equals buildPath with implicit injection after persistence",
    async (paramName, paramValue) => {
      const router = await createStartedRouter([paramName]);

      const idA = nextId();
      const idB = nextId();

      await router.navigate("routeA", { id: idA, [paramName]: paramValue });

      const pathExplicit = router.buildPath("routeB", {
        id: idB,
        [paramName]: paramValue,
      });
      const pathImplicit = router.buildPath("routeB", { id: idB });

      expect(pathExplicit).toBe(pathImplicit);

      router.stop();
    },
  );

  test.prop([arbParamName, arbParamValue], { numRuns: NUM_RUNS.async })(
    "persistent param appears exactly once after multiple merge operations",
    async (paramName, paramValue) => {
      const router = await createStartedRouter([paramName]);

      const idA = nextId();
      const idB = nextId();
      const idC = nextId();

      await router.navigate("routeA", { id: idA, [paramName]: paramValue });
      await router.navigate("routeB", { id: idB });
      await router.navigate("routeC", { id: idC });

      const params = router.getState()?.params ?? {};
      const occurrences = Object.keys(params).filter((k) => k === paramName);

      expect(occurrences).toStrictEqual([paramName]);

      router.stop();
    },
  );
});

// =============================================================================
// Removal
// =============================================================================

describe("removal: passing undefined permanently removes a param from persistence", () => {
  test.prop([arbParamName, arbParamValue], { numRuns: NUM_RUNS.async })(
    "param set to undefined is absent on subsequent navigation",
    async (paramName, paramValue) => {
      const router = await createStartedRouter([paramName]);

      const idA = nextId();
      const idB = nextId();
      const idC = nextId();

      await router.navigate("routeA", { id: idA, [paramName]: paramValue });
      await router.navigate("routeB", { id: idB, [paramName]: undefined });
      await router.navigate("routeC", { id: idC });

      expect(router.getState()?.params).not.toHaveProperty(paramName);

      router.stop();
    },
  );

  test.prop([arbParamName, arbTwoDistinctValues], { numRuns: NUM_RUNS.async })(
    "re-passing a removed param does not restore persistence",
    async (paramName, [initialValue, laterValue]) => {
      const router = await createStartedRouter([paramName]);

      const idA = nextId();
      const idB = nextId();
      const idC = nextId();
      const idD = nextId();

      await router.navigate("routeA", { id: idA, [paramName]: initialValue });
      await router.navigate("routeB", { id: idB, [paramName]: undefined });
      await router.navigate("routeC", { id: idC, [paramName]: laterValue });
      await router.navigate("routeA", { id: idD });

      expect(router.getState()?.params).not.toHaveProperty(paramName);

      router.stop();
    },
  );
});

// =============================================================================
// Default Values
// =============================================================================

describe("default values: object config injects defaults before any explicit set", () => {
  test.prop([arbParamName, arbParamValue], { numRuns: NUM_RUNS.async })(
    "default value is present on first navigation without explicit param",
    async (paramName, defaultValue) => {
      const router = await createStartedRouterWithDefaults({
        [paramName]: defaultValue,
      });

      const idA = nextId();

      await router.navigate("routeA", { id: idA });

      expect(router.getState()?.params[paramName]).toBe(defaultValue);

      router.stop();
    },
  );

  test.prop([arbParamName, arbTwoDistinctValues], { numRuns: NUM_RUNS.async })(
    "explicit value overrides default and persists",
    async (paramName, [defaultValue, explicitValue]) => {
      const router = await createStartedRouterWithDefaults({
        [paramName]: defaultValue,
      });

      const idA = nextId();
      const idB = nextId();

      await router.navigate("routeA", {
        id: idA,
        [paramName]: explicitValue,
      });
      await router.navigate("routeB", { id: idB });

      expect(router.getState()?.params[paramName]).toBe(explicitValue);

      router.stop();
    },
  );
});

// =============================================================================
// Multi-Param
// =============================================================================

describe("multi-param: multiple persistent params coexist correctly", () => {
  test.prop([arbTwoDifferentParamNames, arbParamValue, arbParamValue], {
    numRuns: NUM_RUNS.async,
  })(
    "two persistent params both survive navigation",
    async ([param1, param2], value1, value2) => {
      const router = await createStartedRouter([param1, param2]);

      const idA = nextId();
      const idB = nextId();

      await router.navigate("routeA", {
        id: idA,
        [param1]: value1,
        [param2]: value2,
      });
      await router.navigate("routeB", { id: idB });

      const params = router.getState()?.params ?? {};

      expect(params[param1]).toBe(value1);
      expect(params[param2]).toBe(value2);

      router.stop();
    },
  );

  test.prop([arbTwoDifferentParamNames, arbTwoDistinctValues, arbParamValue], {
    numRuns: NUM_RUNS.async,
  })(
    "overriding one param does not affect the other",
    async ([param1, param2], [val1Initial, val1Override], val2) => {
      const router = await createStartedRouter([param1, param2]);

      const idA = nextId();
      const idB = nextId();
      const idC = nextId();

      await router.navigate("routeA", {
        id: idA,
        [param1]: val1Initial,
        [param2]: val2,
      });
      await router.navigate("routeB", {
        id: idB,
        [param1]: val1Override,
      });
      await router.navigate("routeC", { id: idC });

      const params = router.getState()?.params ?? {};

      expect(params[param1]).toBe(val1Override);
      expect(params[param2]).toBe(val2);

      router.stop();
    },
  );
});

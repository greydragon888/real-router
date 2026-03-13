import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { getDependenciesApi } from "@real-router/core";

import {
  createFixtureRouter,
  arbParamKey,
  arbParamValue,
  NUM_RUNS,
} from "./helpers";

import type { DependenciesApi } from "@real-router/core";

type AnyDepsApi = DependenciesApi<Record<string, unknown>>;

function getTypedDepsApi(): { deps: AnyDepsApi } {
  const router = createFixtureRouter();
  const deps = getDependenciesApi(router) as unknown as AnyDepsApi;

  return { deps };
}

describe("getDependenciesApi CRUD Properties", () => {
  test.prop([arbParamKey, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "set → has: after set(name, value), has(name) === true",
    (name, value) => {
      const { deps } = getTypedDepsApi();

      deps.set(name, value);

      expect(deps.has(name)).toBe(true);
    },
  );

  test.prop([arbParamKey, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "set → get: after set(name, value), get(name) === value",
    (name, value) => {
      const { deps } = getTypedDepsApi();

      deps.set(name, value);

      expect(deps.get(name)).toBe(value);
    },
  );

  test.prop([arbParamKey, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "remove → has: after remove(name), has(name) === false",
    (name, value) => {
      const { deps } = getTypedDepsApi();

      deps.set(name, value);
      deps.remove(name);

      expect(deps.has(name)).toBe(false);
    },
  );

  test.prop(
    [
      fc
        .array(
          fc.tuple(
            arbParamKey.filter(
              (k) =>
                k !== "__proto__" && k !== "constructor" && k !== "prototype",
            ),
            arbParamValue,
          ),
          { minLength: 1, maxLength: 5 },
        )
        .map((entries) => Object.fromEntries(entries)),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "setAll → getAll: setAll(deps) means getAll() contains all pairs",
    (depsMap) => {
      const { deps } = getTypedDepsApi();

      deps.setAll(depsMap);

      const all = deps.getAll() as Record<string, unknown>;

      for (const [key, value] of Object.entries(depsMap)) {
        expect(all[key]).toBe(value);
      }
    },
  );

  test.prop([arbParamKey, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "idempotent set: set(name, value) twice does not break",
    (name, value) => {
      const { deps } = getTypedDepsApi();

      deps.set(name, value);
      const before = deps.get(name);

      deps.set(name, value);

      expect(deps.get(name)).toBe(before);
    },
  );

  test.prop([arbParamKey, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "reset → has: after reset(), has(name) === false for all",
    (name, value) => {
      const { deps } = getTypedDepsApi();

      deps.set(name, value);
      deps.reset();

      expect(deps.has(name)).toBe(false);
    },
  );

  test.prop([arbParamKey, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "getAll returns a copy, not the internal object",
    (name, value) => {
      const { deps } = getTypedDepsApi();

      deps.set(name, value);

      const all1 = deps.getAll();
      const all2 = deps.getAll();

      expect(all1).not.toBe(all2);
      expect(all1).toStrictEqual(all2);
    },
  );

  test.prop([arbParamKey], { numRuns: NUM_RUNS.fast })(
    "set undefined is a no-op: has(name) remains false",
    (name) => {
      const { deps } = getTypedDepsApi();

      deps.set(name, undefined as unknown);

      expect(deps.has(name)).toBe(false);
    },
  );
});

import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { getDependenciesApi } from "@real-router/core/api";

import {
  createFixtureRouter,
  arbParamKey,
  arbParamValue,
  NUM_RUNS,
} from "./helpers";
import { getInternals } from "../../src/internals";

import type { DependenciesApi } from "@real-router/core/api";

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

      const all = deps.getAll();

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

  // The store-level idempotency above (Object.is semantics) holds for NaN too,
  // but it can't exercise the `bothAreNaN` special case in setDependency: that
  // case only suppresses the validator's overwrite WARNING (validation-plugin-
  // gated) — the store writes NaN regardless. `arbParamValue` also never emits
  // NaN. So a focused unit with a mock validator is the right probe.
  it("NaN idempotency: re-setting NaN over NaN suppresses the overwrite warning (bothAreNaN)", () => {
    const router = createFixtureRouter();
    const deps = getDependenciesApi(router) as unknown as AnyDepsApi;

    const overwriteWarnings: string[] = [];

    // set() calls several validator.dependencies hooks (validateSetDependencyArgs,
    // validateDependencyCount, warnOverwrite, …). Stub them all as no-ops via a
    // Proxy and record only warnOverwrite — the bothAreNaN signal under test.
    const dependenciesValidator = new Proxy(
      {
        warnOverwrite: (name: string) => {
          overwriteWarnings.push(name);
        },
      } as Record<string, (...args: unknown[]) => unknown>,
      {
        get: (target, prop: string) => target[prop] ?? (() => undefined),
      },
    );

    getInternals(router).validator = {
      dependencies: dependenciesValidator,
    } as never;

    // NaN over NaN looks like a change (NaN !== NaN) but `bothAreNaN` suppresses
    // the overwrite warning — idempotent.
    deps.set("k", Number.NaN);
    // eslint-disable-next-line sonarjs/no-element-overwrite -- re-setting the same key IS the idempotency under test
    deps.set("k", Number.NaN);

    expect(overwriteWarnings).toStrictEqual([]);

    // A genuine value change DOES warn — proves the suppression is NaN-specific
    // (not a blanket "never warn").
    deps.set("k", 1);
    // eslint-disable-next-line sonarjs/no-element-overwrite -- intentional overwrite with a different value
    deps.set("k", 2);

    expect(overwriteWarnings).toContain("k");
  });

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

      deps.set(name, undefined);

      expect(deps.has(name)).toBe(false);
    },
  );
});

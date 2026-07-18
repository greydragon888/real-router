import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { isStateStrict } from "../../../src/browser-env/state-guard";

/**
 * Property coverage for the shared/browser-env `isStateStrict` twin (M1). Only the
 * guard is public, so its `isRouteName` / `isParams` closure is exercised through
 * it. Arbitraries are inlined (the guard's former type-guards property helpers were
 * dissolved with the package) so this suite stays self-contained.
 */

const validRouteName = fc.oneof(
  fc.stringMatching(/^[A-Z_a-z][\w-]{0,20}$/),
  fc
    .tuple(
      fc.stringMatching(/^[A-Z_a-z][\w-]{0,10}$/),
      fc.stringMatching(/^[A-Z_a-z][\w-]{0,10}$/),
    )
    .map(([a, b]) => `${a}.${b}`),
  fc.stringMatching(/^@@[A-Z_a-z][\w-]{0,20}$/),
  fc.constant(""),
);

const validPath = fc.oneof(
  fc.constant(""),
  fc.stringMatching(/^\/[\w-]{0,20}$/),
);

const primitiveValue = fc.oneof(fc.string(), fc.integer(), fc.boolean());

const validParams = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }),
  fc.oneof(primitiveValue, fc.array(primitiveValue, { maxLength: 5 })),
  { maxKeys: 5 },
);

describe("isStateStrict properties (shared/browser-env twin)", () => {
  test.prop([validRouteName, validPath, validParams], { numRuns: 5000 })(
    "accepts any state with a valid name / path / params",
    (name, path, params) => {
      expect(isStateStrict({ name, path, params })).toBe(true);
    },
  );

  test.prop(
    [
      fc.oneof(
        fc.constant(null),
        fc.constant(undefined),
        fc.integer(),
        fc.string(),
        fc.boolean(),
      ),
    ],
    { numRuns: 5000 },
  )("rejects non-object / nullish values", (value) => {
    expect(isStateStrict(value)).toBe(false);
  });

  test.prop([validPath, validParams], { numRuns: 3000 })(
    "rejects a non-string name",
    (path, params) => {
      expect(isStateStrict({ name: 123, path, params })).toBe(false);
    },
  );

  test.prop([validRouteName, validParams], { numRuns: 3000 })(
    "rejects a non-string path",
    (name, params) => {
      expect(isStateStrict({ name, path: 123, params })).toBe(false);
    },
  );

  test.prop(
    [
      validRouteName,
      validPath,
      fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.constant(true)),
    ],
    { numRuns: 3000 },
  )("rejects primitive (non-object) params", (name, path, params) => {
    expect(isStateStrict({ name, path, params })).toBe(false);
  });

  it("follows isParams semantics for structural params (cycle / diamond / instance)", () => {
    // Diamond (shared reference) → accepted.
    const shared = { k: "v" };

    expect(
      isStateStrict({
        name: "home",
        path: "/",
        params: { a: shared, b: shared },
      }),
    ).toBe(true);

    // Cycle → rejected.
    const cyclic: Record<string, unknown> = {};

    cyclic.self = cyclic;

    expect(isStateStrict({ name: "home", path: "/", params: cyclic })).toBe(
      false,
    );

    // Class instance → rejected.
    expect(
      isStateStrict({ name: "home", path: "/", params: { d: new Date() } }),
    ).toBe(false);
  });

  test.prop([validRouteName, validPath, validParams, fc.integer()], {
    numRuns: 3000,
  })(
    "accepts backward-compat history.state with a string meta.id",
    (name, path, params, idValue) => {
      expect(
        isStateStrict({ name, path, params, meta: { id: `${idValue}` } }),
      ).toBe(true);
    },
  );
});

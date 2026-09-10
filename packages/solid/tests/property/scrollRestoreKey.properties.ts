// packages/solid/tests/property/scrollRestoreKey.properties.ts

/**
 * Property-based tests for `keyOf` from
 * `shared/dom-utils/scroll-restore.ts`.
 *
 * The key names a LOCATION: it reads `state.path`, the form core prints the
 * current URL in (#1923). `keyOf` is not on the package's public surface —
 * the barrel exports `createScrollRestoration` and its types — so the suite
 * imports it from the module directly rather than replicating it.
 *
 * Locked here:
 *
 * - **the key IS the printed path**, not a composition of the bags;
 * - **location-injectivity**: two locations never share a bucket, and two
 *   states printing one URL always do;
 * - **no separator of the helper's own** for a route name to pun against.
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";
import { keyOf } from "../../src/dom-utils/scroll-restore";

import type { State } from "@real-router/core";

const arbPlainParams = fc.dictionary(
  fc.stringMatching(/^[a-z]{1,6}$/),
  fc.oneof(fc.string({ maxLength: 8 }), fc.integer(), fc.boolean()),
  { minKeys: 0, maxKeys: 5 },
);

const printPath = (name: string, params: Record<string, unknown>): string => {
  const query = Object.keys(params)
    .toSorted((left, right) => left.localeCompare(right))
    .map((key) => `${key}=${String(params[key])}`)
    .join("&");

  return query ? `/${name}?${query}` : `/${name}`;
};

// ⚑ The path is DERIVED from the bags here, the way core derives it. A fixture
// that hands every state one literal path measures itself: the key reads
// `state.path`, so a constant there makes every location the same location.
const arbState = (
  params: Record<string, unknown>,
  name = "users.view",
): State =>
  ({
    name,
    params,
    search: {},
    path: printPath(name, params),
    context: {},
  }) as unknown as State;

describe("keyOf — Property Tests (§8b H20, audit #S3)", () => {
  describe("Invariant 1: the key IS the printed path (#1923)", () => {
    // Not "derived from it" — equal to it. Any transformation would make this
    // a second place that has to know how a location prints, which is the
    // defect #1923 closed: the URL direction parses `?page=2` into the number
    // `2` and an intent keeps `"2"`, so a key built from the bags puts one
    // location in two buckets.
    test.prop([arbPlainParams], { numRuns: NUM_RUNS.thorough })(
      "keyOf(state) === state.path",
      (params) => {
        const state = arbState(params);

        expect(keyOf(state)).toBe(state.path);
      },
    );

    test.prop([arbPlainParams], { numRuns: NUM_RUNS.standard })(
      "the key is not the route name plus a separator",
      (params) => {
        const state = arbState(params);

        // The falsifier for a refactor back to `${name}:${…}`: that shape
        // OPENS with the bare name, the printed path opens with "/". Asserting
        // the absence of a ":" would be wrong — a param VALUE may hold one.
        expect(keyOf(state).startsWith(state.name)).toBe(false);
        expect(keyOf(state).startsWith("/")).toBe(true);
      },
    );
  });

  describe("Invariant 7: `keyOf` injectivity for distinct locations", () => {
    // Two snapshots that differ in either `name` or `params` MUST produce
    // distinct keys — otherwise the scroll-restore cache would silently
    // collide and "restore" wrong positions on back-navigation. Locks the
    // structural separator between `name` and `params` and the
    // canonicalisation of `params`. We restrict the param shape to objects
    // whose canonical form is non-trivial so the differing-params branch
    // actually surfaces in the key.
    test.prop(
      [
        fc.tuple(
          fc.stringMatching(/^[a-z][a-z.]{0,8}[a-z]$/),
          fc.stringMatching(/^[a-z][a-z.]{0,8}[a-z]$/),
        ),
        arbPlainParams,
        arbPlainParams,
      ],
      { numRuns: NUM_RUNS.thorough },
    )(
      "distinct printed paths produce distinct keys, equal ones share a bucket",
      ([nameA, nameB], paramsA, paramsB) => {
        const stateA = arbState(paramsA, nameA);
        const stateB = arbState(paramsB, nameB);

        if (stateA.path === stateB.path) {
          // The equality branch, and it is the #1923 trade rather than an
          // accident: one URL, one bucket, whatever the bags hold.
          expect(keyOf(stateA)).toBe(keyOf(stateB));

          return;
        }

        expect(keyOf(stateA)).not.toBe(keyOf(stateB));
      },
    );
  });

  describe("Invariant 8: no separator of the helper's own to pun against", () => {
    // The class this used to guard: a key built as `${name}:${params}` can be
    // punned by a route name carrying the separator. Reading the printed path
    // removes the separator and the class with it — core owns how a location
    // prints, and a name is not spliced in.
    test("a route named 'a:b' and a route 'a' with param b are separate locations", () => {
      const colonName = arbState({}, "a:b");
      const emptyParam = arbState({ b: "" }, "a");

      expect(keyOf(colonName)).not.toBe(keyOf(emptyParam));
    });

    test("a parameterless location keys as its bare path", () => {
      expect(keyOf(arbState({}, "home"))).toBe("/home");
    });
  });
});

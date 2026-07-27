// RFC nav-pipeline, milestone 1 — `canonicalize` as a PURE function.
//
// The pipeline's single producer is tested here against a mocked port, which is
// the only way to observe the stage-③ merge in isolation: through the router
// the merge is entangled with forwardTo resolution, the interceptor chain and
// the URL build, so a merge regression can hide behind any of them.
//
// Scope — deliberately SINGLE-POINT invariants only (RFC §7, Phase 1): the two
// merge invariants the design names, plus three structural ones the pipeline's
// own shape adds (channel independence, merge-time freeze, idempotence). The
// cross-entry-point lock ("entry points of one compositional form yield one
// `Canonical`") is NOT here: it needs ≥2 migrated entry points and is Phase 2's
// acceptance, while only `navigate` rides the pipeline today.
//
// NOT duplicated here: `state.search` ⊆ printed `state.path`. That one is a
// router-level property and already lives, mutationally validated, in
// `searchPathConsistency.properties.ts` — repeating it against a mocked port
// would assert the mock, not the URL.

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { arbParamKey, NUM_RUNS } from "./helpers";
import { canonicalize } from "../../src/pipeline";

import type { RouteResolver } from "../../src/pipeline";
import type { Params, SearchParams } from "../../src/types";

/**
 * Identity port: `resolveForward` hands the bags back untouched, so whatever
 * the assertions see comes from `canonicalize` itself — not from the seam.
 * `buildPath` is never reached (⑤a is a separate primitive).
 */
function makePort(
  defaultParams?: Params,
  defaultSearch?: SearchParams,
): RouteResolver {
  return {
    resolveForward: (name, params, search) => ({ name, params, search }),
    defaultParams: () => defaultParams,
    defaultSearch: () => defaultSearch,
    buildPath: () => {
      throw new Error("buildPath must not be reached by canonicalize");
    },
  };
}

/** Defined (non-`undefined`) param values, both channels. */
const arbDefinedValue = fc.oneof(
  fc.string({ minLength: 1, maxLength: 8 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
);

const arbDefinedBag = fc.dictionary(arbParamKey, arbDefinedValue, {
  maxKeys: 4,
});

/** Bags that may carry explicit `undefined` values ("I said nothing"). */
const arbMaybeUndefinedBag = fc.dictionary(
  arbParamKey,
  fc.oneof(arbDefinedValue, fc.constant(undefined)),
  { maxKeys: 4 },
);

describe("canonicalize (pure) — properties", () => {
  // Invariant 1 — "the caller always beats the default, including a default
  // that carries `undefined`". The whole whack-a-mole class this pipeline
  // exists to kill is a default silently winning over a user value (#1550).
  test.prop([fc.string(), arbDefinedBag, arbDefinedBag], {
    numRuns: NUM_RUNS.standard,
  })(
    "a defined caller value beats the route default on both channels",
    (name, callerBag, defaultBag) => {
      // Same keys on both sides — the collision is the point, so build the
      // default from the caller's own keys plus its own.
      const defaults = { ...callerBag, ...defaultBag };
      const undefinedDefaults = Object.fromEntries(
        Object.keys(defaults).map((key) => [key, undefined]),
      ) as Params;

      for (const routeDefaults of [defaults, undefinedDefaults]) {
        const canonical = canonicalize(
          makePort(routeDefaults, routeDefaults as SearchParams),
          name,
          callerBag,
          callerBag,
        );

        for (const [key, value] of Object.entries(callerBag)) {
          expect(canonical.path[key]).toBe(value);
          expect(canonical.query[key]).toBe(value);
        }
      }
    },
  );

  // Invariant 2 — `undefined` IS absence, on BOTH sides of the merge. No
  // `undefined`-valued own key may ever reach a Canonical: an explicitly
  // `undefined` caller value leaves the default in place (#1550), and a default
  // that itself carries `undefined` behaves like no entry at all (#1551).
  test.prop([fc.string(), arbMaybeUndefinedBag, arbMaybeUndefinedBag], {
    numRuns: NUM_RUNS.standard,
  })(
    "`undefined` is absence on both sides of the merge",
    (name, callerBag, defaultBag) => {
      const canonical = canonicalize(
        makePort(defaultBag, defaultBag),
        name,
        callerBag,
        callerBag,
      );

      for (const channel of [canonical.path, canonical.query]) {
        for (const key of Object.keys(channel)) {
          expect(channel[key]).not.toBeUndefined();
        }
      }

      // A key that is `undefined` on both sides must not exist at all.
      for (const [key, value] of Object.entries(callerBag)) {
        if (value === undefined && defaultBag[key] === undefined) {
          expect(Object.hasOwn(canonical.path, key)).toBe(false);
          expect(Object.hasOwn(canonical.query, key)).toBe(false);
        }
      }
    },
  );

  // Invariant 3 (structural) — the pipeline does NOT move keys between
  // channels. Stage ② is gone by design: a value handed in the path bag stays
  // in `path`, a value handed in the query bag stays in `query`, and a name
  // occupying both (`/items/:id?id`) keeps two INDEPENDENT values.
  test.prop([fc.string(), arbDefinedBag, arbDefinedBag], {
    numRuns: NUM_RUNS.standard,
  })(
    "channels are independent — canonicalize never re-splits",
    (name, pathBag, queryBag) => {
      const canonical = canonicalize(makePort(), name, pathBag, queryBag);

      // Spread BOTH sides: `fc.dictionary` also generates null-prototype objects,
      // and `toStrictEqual` compares prototypes — comparing a null-prototype bag
      // against a plain one fails with "no visual difference", which is a fact
      // about the generator, not about the channels.
      expect({ ...canonical.path }).toStrictEqual({ ...pathBag });
      expect({ ...canonical.query }).toStrictEqual({ ...queryBag });
    },
  );

  // Invariant 4 — channels are frozen AT MERGE TIME,
  // independently of the state-object freeze that `materialize`'s `skipFreeze`
  // governs. The navigate path defers the state freeze, so a guard would
  // otherwise observe mutable bags. The caller's own bag must never be frozen
  // out from under it.
  test.prop([fc.string(), arbDefinedBag, arbDefinedBag, arbDefinedBag], {
    numRuns: NUM_RUNS.standard,
  })(
    "channels are frozen; the caller's bag is not",
    (name, callerParams, callerSearch, defaultBag) => {
      for (const routeDefaults of [undefined, defaultBag]) {
        const params = { ...callerParams };
        const search = { ...callerSearch };

        const canonical = canonicalize(
          makePort(routeDefaults, routeDefaults),
          name,
          params,
          search,
        );

        expect(Object.isFrozen(canonical.path)).toBe(true);
        expect(Object.isFrozen(canonical.query)).toBe(true);
        expect(Object.isFrozen(params)).toBe(false);
        expect(Object.isFrozen(search)).toBe(false);
      }
    },
  );

  // Stage ③ is idempotent — re-canonicalizing a Canonical's own channels under
  // the same route defaults changes nothing. This is what makes the migration
  // safe where an entry point still passes through both the old and the new
  // path, and it is the premise behind "materialize must not call makeState"
  // (the second merge would be a wasted pass, not a behaviour change).
  test.prop([fc.string(), arbMaybeUndefinedBag, arbDefinedBag], {
    numRuns: NUM_RUNS.standard,
  })("stage ③ is idempotent", (name, callerBag, defaultBag) => {
    const port = makePort(defaultBag, defaultBag);

    const once = canonicalize(port, name, callerBag, callerBag);
    const twice = canonicalize(port, once.name, once.path, once.query);

    expect({ ...twice.path }).toStrictEqual({ ...once.path });
    expect({ ...twice.query }).toStrictEqual({ ...once.query });
    expect(twice.name).toBe(once.name);
  });
});

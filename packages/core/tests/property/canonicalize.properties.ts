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
import { EMPTY_SEARCH } from "../../src/constants";
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
  gate?: { queryNames: readonly string[]; admitsUndeclared: boolean },
): RouteResolver {
  return {
    resolveForward: (name, params, search) => ({ name, params, search }),
    defaultParams: () => defaultParams,
    defaultSearch: () => defaultSearch,
    buildPath: () => {
      throw new Error("buildPath must not be reached by canonicalize");
    },
    // Default to `loose` so every pre-existing property keeps exercising the
    // un-gated path; the mode-gate properties below pass their own.
    pathNames: () => [],
    queryNames: () => gate?.queryNames ?? [],
    admitsUndeclaredQuery: () => gate?.admitsUndeclared ?? true,
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
  //
  // ⚠ Crosses BOTH paths on purpose (#1599). The fast-path gate discriminates on
  // exactly the query bag's form, and a fresh `{...callerSearch}` is neither
  // `undefined` nor the `EMPTY_SEARCH` singleton — so until this property carried
  // the other two forms, every one of its runs took the SLOW path and the fast
  // path's own `Object.freeze` was asserted by nothing at all. Demonstrated by
  // mutation: with a `throw` in place of the fast-path `return`, this property
  // used to pass while 81 others failed.
  test.prop([fc.string(), arbDefinedBag, arbDefinedBag, arbDefinedBag], {
    numRuns: NUM_RUNS.standard,
  })(
    "channels are frozen on both paths; the caller's own bag is not",
    (name, callerParams, callerSearch, defaultBag) => {
      // `undefined` and the singleton reach the fast path only while the route
      // carries no defaults — with `defaultBag` the gate falls through, which is
      // why the query forms are crossed with the defaults rather than listed.
      const queryForms: (SearchParams | undefined)[] = [
        { ...callerSearch },
        undefined,
        EMPTY_SEARCH,
      ];

      for (const routeDefaults of [undefined, defaultBag]) {
        for (const search of queryForms) {
          const params = { ...callerParams };

          const canonical = canonicalize(
            makePort(routeDefaults, routeDefaults),
            name,
            params,
            search,
          );

          expect(Object.isFrozen(canonical.path)).toBe(true);
          expect(Object.isFrozen(canonical.query)).toBe(true);
          expect(Object.isFrozen(params)).toBe(false);

          // Only a bag the caller OWNS may be asserted mutable: `EMPTY_SEARCH` is
          // the shared frozen singleton, and `undefined` has nothing to assert.
          if (search !== undefined && search !== EMPTY_SEARCH) {
            expect(Object.isFrozen(search)).toBe(false);
          }
        }
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

  // The mode gate (#1575). Two halves, both needed: what a non-loose mode ADMITS
  // and what it DROPS. Stated over the merged bag, because that is the bag ⑤a
  // prints from — a `defaultSearch` for an undeclared key is dropped with it.
  test.prop(
    [fc.string(), arbDefinedBag, fc.array(arbParamKey, { maxLength: 4 })],
    {
      numRuns: NUM_RUNS.standard,
    },
  )(
    "a non-loose mode admits exactly the declared query keys",
    (name, searchBag, declared) => {
      const port = makePort(undefined, undefined, {
        queryNames: declared,
        admitsUndeclared: false,
      });

      const canonical = canonicalize(port, name, {}, searchBag);

      for (const key of Object.keys(canonical.query)) {
        expect(declared).toContain(key);
      }

      // ...and nothing declared-and-present was lost on the way — without this
      // half the property would pass for a gate that emptied the bag.
      for (const [key, value] of Object.entries(searchBag)) {
        if (declared.includes(key)) {
          expect(canonical.query[key]).toStrictEqual(value);
        }
      }
    },
  );

  test.prop(
    [fc.string(), arbDefinedBag, fc.array(arbParamKey, { maxLength: 4 })],
    {
      numRuns: NUM_RUNS.standard,
    },
  )("loose admits every key, declared or not", (name, searchBag, declared) => {
    const port = makePort(undefined, undefined, {
      queryNames: declared,
      admitsUndeclared: true,
    });

    const canonical = canonicalize(port, name, {}, searchBag);

    expect({ ...canonical.query }).toStrictEqual({ ...searchBag });
  });

  // A DROP, never a move: the gate must not push the rejected key into the path
  // channel — that would re-create the per-entry-point ambiguity (#1553).
  test.prop([fc.string(), arbDefinedBag], { numRuns: NUM_RUNS.standard })(
    "a dropped query key never reappears in the path channel",
    (name, searchBag) => {
      const port = makePort(undefined, undefined, {
        queryNames: [],
        admitsUndeclared: false,
      });

      const canonical = canonicalize(port, name, {}, searchBag);

      expect(Object.keys(canonical.query)).toStrictEqual([]);

      for (const key of Object.keys(searchBag)) {
        expect(key in canonical.path).toBe(false);
      }
    },
  );
});

import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { arbState, createFixtureRouter, NUM_RUNS } from "./helpers";
import { DEFAULT_TRANSITION } from "../helpers";

import type {
  Params,
  Route,
  SearchParams,
  SearchParamValue,
  State,
} from "@real-router/core";

describe("areStatesEqual Properties", () => {
  const router = createFixtureRouter();

  // areStatesEqual's param-comparison loop only runs when `state.name` is a
  // route the matcher knows AND that has URL params — `getUrlParams(name)` drives
  // the loop (StateNamespace :168-176). The fixture's `users.view` (path `/:id`)
  // exposes the URL param `id`, so states built here actually EXERCISE the
  // comparison engine. The old generator (`arbState`, random dotted names) made
  // `getUrlParams()` return `[]`, so the whole loop was dead and equality
  // collapsed to a name-only check — symmetry/transitivity/monotonicity held
  // vacuously and no param-comparison mutation could fail them.
  function viewState(params: Params): State {
    // path is irrelevant to areStatesEqual (it compares name + params only), so
    // a constant keeps the helper simple and array-valued `id` lint-safe.
    return {
      name: "users.view",
      params,
      search: {},
      path: "/users/x",
      transition: DEFAULT_TRANSITION,
      context: {},
    };
  }

  const arbIdValue = fc.stringMatching(/^[a-z0-9]{1,6}$/);
  const arbExtra = fc.stringMatching(/^[a-z0-9]{1,6}$/);

  /** Routed state on `users.view` with a real URL param `id` (+ optional non-URL `q`). */
  const arbRoutedState = fc
    .record({ id: arbIdValue, q: fc.option(arbExtra, { nil: undefined }) })
    .map(({ id, q }) => viewState(q === undefined ? { id } : { id, q }));

  test.prop([arbRoutedState], { numRuns: NUM_RUNS.thorough })(
    "reflexivity: areStatesEqual(s, s) === true",
    (state) => {
      expect(router.areStatesEqual(state, state)).toBe(true);
    },
  );

  test.prop([arbRoutedState, arbRoutedState], { numRuns: NUM_RUNS.thorough })(
    "symmetry: areStatesEqual(s1, s2) === areStatesEqual(s2, s1)",
    (s1, s2) => {
      expect(router.areStatesEqual(s1, s2)).toBe(router.areStatesEqual(s2, s1));
    },
  );

  // ── #1815: the OWN-ENUMERABLE surface decides, and nothing else ────────────
  //
  // A SISTER of the symmetry property above rather than a widening of it, and
  // the reason is structural: that one draws its two states INDEPENDENTLY, so
  // the values almost never collide and the pair is refused by the length gate
  // before the membership test runs. Measured — carrying the excluded shapes
  // through `arbRoutedState` left the property tier green against a full revert
  // of the fix. The discriminating input needs a CORRELATED pair: one value,
  // two carriers.
  const arbCarrier = fc.constantFrom("own", "inherited", "concealed");

  /**
   * ⚠ The excluded shapes keep the bag's own-enumerable COUNT — `id` moves out
   * of that surface and a decoy takes its place — because `recordsShallowEqual`
   * compares counts first and a shorter bag never reaches the membership test.
   */
  function carry(id: string, shape: "own" | "inherited" | "concealed"): Params {
    if (shape === "own") {
      return { id };
    }

    if (shape === "inherited") {
      return Object.assign(Object.create({ id }) as Params, { decoy: id });
    }

    const bag: Params = { decoy: id };

    Object.defineProperty(bag, "id", { value: id, enumerable: false });

    return bag;
  }

  /** The bag as the supported-input rule sees it, order-insensitive. */
  const visibleSurface = (params: Params): string =>
    JSON.stringify(
      Object.entries(params).toSorted(([a], [b]) => a.localeCompare(b)),
    );

  test.prop([arbIdValue, arbCarrier, arbCarrier], {
    numRuns: NUM_RUNS.thorough,
  })(
    "carrier independence: only the own-enumerable surface decides equality",
    (id, leftShape, rightShape) => {
      const a = viewState(carry(id, leftShape));
      const b = viewState(carry(id, rightShape));

      // ⚑ The precondition the ⚠ on `carry` states in prose, asserted. Every
      // shape must present the SAME number of own-enumerable keys, or the
      // length gate in `recordsShallowEqual` answers before the ownership rule
      // is asked and the property passes while measuring nothing.
      expect(Object.keys(a.params)).toHaveLength(Object.keys(b.params).length);
      expect(Object.keys(a.params).length).toBeGreaterThan(0);

      // The oracle is computed here, from `Object.entries` — the same family as
      // the `Object.keys` list the code decides by, deliberately, since that
      // rule is what is being pinned. It reaches the answer without calling
      // `areStatesEqual`, so a defect in the comparison cannot hide in the
      // expectation. Measured: it reds on a full revert of the fix.
      expect(router.areStatesEqual(a, b, false)).toBe(
        visibleSurface(a.params) === visibleSurface(b.params),
      );

      expect(router.areStatesEqual(a, b)).toBe(router.areStatesEqual(b, a));
      expect(router.areStatesEqual(a, b, false)).toBe(
        router.areStatesEqual(b, a, false),
      );
    },
  );

  test.prop([arbRoutedState, arbRoutedState, arbRoutedState], {
    numRuns: NUM_RUNS.standard,
  })("transitivity: equal(a,b) && equal(b,c) → equal(a,c)", (a, b, c) => {
    if (router.areStatesEqual(a, b) && router.areStatesEqual(b, c)) {
      expect(router.areStatesEqual(a, c)).toBe(true);
    }
  });

  test.prop([arbIdValue, arbIdValue], { numRuns: NUM_RUNS.thorough })(
    "URL-param sensitivity: equal iff the url param `id` matches (default ignoreQueryParams)",
    (id1, id2) => {
      // Dichotomy driving the getUrlParams("users.view")=["id"] loop directly.
      // If the param loop is removed (returns true after the name check), this
      // fails for id1 !== id2; if it over-compares it fails for id1 === id2.
      expect(
        router.areStatesEqual(viewState({ id: id1 }), viewState({ id: id2 })),
      ).toBe(id1 === id2);
    },
  );

  test.prop([arbIdValue, arbExtra, arbExtra], { numRuns: NUM_RUNS.standard })(
    "ignoreQueryParams axis: non-URL params ignored by default, compared when false",
    (id, q1, q2) => {
      fc.pre(q1 !== q2);

      const a = viewState({ id, q: q1 });
      const b = viewState({ id, q: q2 }); // same URL param, different non-URL param

      // default / explicit-true: only the URL param `id` is compared → equal
      expect(router.areStatesEqual(a, b)).toBe(true);
      expect(router.areStatesEqual(a, b, true)).toBe(true);
      // strict (false): all keys compared → the differing `q` makes them unequal
      expect(router.areStatesEqual(a, b, false)).toBe(false);
    },
  );

  test.prop([arbIdValue, arbIdValue, arbIdValue], {
    numRuns: NUM_RUNS.standard,
  })(
    "array param values are compared element-wise (areParamValuesEqual recursion)",
    (x, y, z) => {
      fc.pre(y !== z);

      // An array-valued URL param exercises the array branch of
      // areParamValuesEqual (untested when every param value is a scalar).
      const same = router.areStatesEqual(
        viewState({ id: [x, y] }),
        viewState({ id: [x, y] }),
      );
      const diff = router.areStatesEqual(
        viewState({ id: [x, y] }),
        viewState({ id: [x, z] }),
      );

      expect(same).toBe(true);
      expect(diff).toBe(false);
    },
  );

  // ── #1554: equality must not depend on where the values came from ──────────
  //
  // The class-guard for the whole provenance defect: for ANY round-trippable bag,
  // a state built from an intent must compare equal to the state the SAME path
  // matches back to. The URL direction parses (`?page=2` → `2`, `?q=1&q=2` →
  // `[1, 2]`), the intent direction keeps the caller's values — a `===`-based
  // comparison fails this for every numeric-looking value.
  const arbQueryScalar = fc.oneof(
    fc.stringMatching(/^[a-z0-9]{1,6}$/),
    fc.integer({ min: -9999, max: 9999 }),
    fc.boolean(),
    fc.constant(null),
  );

  test.prop(
    [arbQueryScalar, fc.array(arbQueryScalar, { minLength: 1, maxLength: 3 })],
    { numRuns: NUM_RUNS.standard },
  )(
    "provenance independence: makeState(intent) === matchPath(its own path)",
    (q, page) => {
      const provenanceRouter = createFixtureRouter();
      const api = getPluginApi(provenanceRouter);

      // `search` (path `/search?q&page`) declares both query names, so every
      // generated value travels the query channel in BOTH directions.
      const fromIntent = api.makeState("search", {}, { q, page });
      const fromUrl = api.matchPath(fromIntent.path);

      expect(fromUrl).toBeDefined();
      expect(provenanceRouter.areStatesEqual(fromIntent, fromUrl, false)).toBe(
        true,
      );
    },
  );

  test.prop([fc.integer({ min: 0, max: 99_999 })], {
    numRuns: NUM_RUNS.standard,
  })(
    "provenance independence: a numeric path param matches its decoded string",
    (id) => {
      const provenanceRouter = createFixtureRouter();

      expect(
        provenanceRouter.areStatesEqual(
          viewState({ id }),
          viewState({ id: String(id) }),
        ),
      ).toBe(true);
    },
  );

  // ── #2905: the same property on routes with a codec ────────────────────────
  //
  // Only the URL direction runs a route's `decodeParams` (the contract
  // `Route.decodeParams` states), so the property holds for a decoder that
  // undoes its `encodeParams` and adds no key, and fails for one that does not.
  // INVARIANTS areStatesEqual #8 names the conditions.
  const printDay = (value: unknown): unknown =>
    value instanceof Date ? value.toISOString().slice(0, 10) : value;
  const readDay = (value: unknown): unknown =>
    typeof value === "string" ? new Date(value) : value;

  const CODEC_ROUTES: Route[] = [
    {
      name: "product",
      path: "/product/:id",
      encodeParams: ({ params, search }) => ({
        params: { ...params, id: (params.id as number).toString() },
        search,
      }),
      decodeParams: ({ params, search }) => ({
        params: { ...params, id: Number(params.id) },
        search,
      }),
    },
    {
      name: "derived",
      path: "/derived/:slug",
      decodeParams: ({ params, search }) => ({
        params: { ...params, kind: "car" },
        search,
      }),
    },
    {
      name: "lossy",
      path: "/lossy/:slug",
      decodeParams: ({ params, search }) => ({
        params: { ...params, slug: params.slug.toUpperCase() },
        search,
      }),
    },
    { name: "seam", path: "/seam/:slug" },
    {
      // A day in the URL, a fresh `Date` in the state: the wiki "Dates" recipe.
      name: "day",
      path: "/day/:day?from",
      encodeParams: ({ params, search }) => ({
        params: { ...params, day: printDay(params.day) } as Params,
        search: { ...search, from: printDay(search.from) } as SearchParams,
      }),
      decodeParams: ({ params, search }) => ({
        params: { ...params, day: readDay(params.day) } as Params,
        search: { ...search, from: readDay(search.from) } as SearchParams,
      }),
    },
    {
      // JSON in the URL, a fresh plain object in the state.
      name: "filtered",
      path: "/filtered?filter",
      encodeParams: ({ params, search }) => ({
        params,
        search: { ...search, filter: JSON.stringify(search.filter) },
      }),
      decodeParams: ({ params, search }) => ({
        params,
        search: {
          ...search,
          filter: JSON.parse(search.filter as string) as SearchParamValue,
        },
      }),
    },
  ];
  /** Starts with a letter, so `toUpperCase()` always changes it. */
  const arbSlug = fc.stringMatching(/^[a-z][a-z0-9-]{0,7}$/);
  /** UTC midnight: a value exactly as fine as the day its URL prints. */
  const arbDay = fc
    .integer({ min: 0, max: 36_524 })
    .map((offset) => new Date(Date.UTC(2000, 0, 1 + offset)));
  const arbFilter = fc.record({
    status: fc.stringMatching(/^[a-z]{1,6}$/),
    page: fc.integer({ min: 0, max: 99 }),
  });

  const codecRouter = createRouter(CODEC_ROUTES);
  const codecApi = getPluginApi(codecRouter);

  // The remedy `Route.decodeParams` names: the same key, derived in a
  // `forwardState` interceptor.
  const seamRouter = createRouter(CODEC_ROUTES);
  const seamApi = getPluginApi(seamRouter);

  seamApi.addInterceptor("forwardState", (next, name, params, search) => {
    const resolved = next(name, params, search);

    return resolved.name === "seam"
      ? { ...resolved, params: { ...resolved.params, kind: "car" } }
      : resolved;
  });

  test.prop([fc.integer({ min: 0, max: 99_999 })], {
    numRuns: NUM_RUNS.standard,
  })(
    "provenance independence: a decoder that undoes its encoder (#2905)",
    (id) => {
      // The form the decoder returns, and the form the URL prints.
      for (const intent of [id, String(id)]) {
        const fromIntent = codecApi.makeState("product", { id: intent });
        const fromUrl = codecApi.matchPath(fromIntent.path);

        expect(fromUrl?.params).toStrictEqual({ id });
        expect(codecRouter.areStatesEqual(fromIntent, fromUrl, false)).toBe(
          true,
        );
      }
    },
  );

  // A decoded object is a fresh one on every read, so the two states hold two
  // instances of one value and compare by its key (#2905).
  test.prop([arbDay], { numRuns: NUM_RUNS.standard })(
    "provenance independence: a decoder that hands back a fresh Date (#2905)",
    (value) => {
      const fromIntent = codecApi.makeState(
        "day",
        { day: value },
        { from: new Date(value) },
      );
      const fromUrl = codecApi.matchPath(fromIntent.path);

      expect(fromUrl?.params.day).toBeInstanceOf(Date);
      expect(fromUrl?.params.day).not.toBe(value);
      expect(codecRouter.areStatesEqual(fromIntent, fromUrl, false)).toBe(true);
    },
  );

  test.prop([arbFilter], { numRuns: NUM_RUNS.standard })(
    "provenance independence: a decoder that hands back a fresh plain object (#2905)",
    (filter) => {
      const fromIntent = codecApi.makeState(
        "filtered",
        {},
        {
          filter,
        },
      );
      const fromUrl = codecApi.matchPath(fromIntent.path);

      // `fc.record` builds a null-prototype object too, and `JSON.parse` never
      // does: the two prototypes of a plain object share one key, so the fields
      // are compared on copies with one prototype.
      expect({ ...(fromUrl?.search.filter as object) }).toStrictEqual({
        ...filter,
      });
      expect(fromUrl?.search.filter).not.toBe(filter);
      expect(codecRouter.areStatesEqual(fromIntent, fromUrl, false)).toBe(true);
    },
  );

  test.prop([arbSlug], { numRuns: NUM_RUNS.standard })(
    "provenance independence fails for a decoder that adds a key or changes a value: the intent side never decodes (#2905)",
    (slug) => {
      for (const name of ["derived", "lossy"]) {
        const fromUrl = codecApi.matchPath(
          codecApi.makeState(name, { slug }).path,
        );

        expect(fromUrl).toBeDefined();

        // `buildNavigationState` resolves an intent the way `navigate` does.
        for (const fromIntent of [
          codecApi.makeState(name, { slug }),
          codecApi.buildNavigationState(name, { slug }),
        ]) {
          expect(fromIntent?.params).toStrictEqual({ slug });
          expect(codecRouter.areStatesEqual(fromIntent, fromUrl, false)).toBe(
            false,
          );
        }
      }
    },
  );

  test.prop([arbSlug], { numRuns: NUM_RUNS.standard })(
    "a key derived in a forwardState interceptor is on both sides of a navigation, and not on the literal makeState (#2905)",
    (slug) => {
      const fromUrl = seamApi.matchPath(`/seam/${slug}`);

      expect(fromUrl?.params).toStrictEqual({ slug, kind: "car" });
      expect(
        seamRouter.areStatesEqual(
          seamApi.buildNavigationState("seam", { slug }),
          fromUrl,
          false,
        ),
      ).toBe(true);
      expect(
        seamRouter.areStatesEqual(
          seamApi.makeState("seam", { slug }),
          fromUrl,
          false,
        ),
      ).toBe(false);
    },
  );

  it("both undefined: areStatesEqual(undefined, undefined) === true", () => {
    expect(
      router.areStatesEqual(
        undefined as unknown as State,
        undefined as unknown as State,
      ),
    ).toBe(true);
  });

  test.prop([arbRoutedState], { numRuns: NUM_RUNS.standard })(
    "one undefined: areStatesEqual(s, undefined) === false",
    (state) => {
      expect(router.areStatesEqual(state, undefined as unknown as State)).toBe(
        false,
      );
    },
  );

  test.prop([arbState, arbState], { numRuns: NUM_RUNS.thorough })(
    "different names implies not equal",
    (s1, s2) => {
      fc.pre(s1.name !== s2.name);

      // Name check short-circuits before the param loop, so arbitrary names are
      // the right generator here.
      expect(router.areStatesEqual(s1, s2)).toBe(false);
    },
  );
});

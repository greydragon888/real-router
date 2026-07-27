import { fc, test } from "@fast-check/vitest";
import { describe, expect, beforeAll, afterAll } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { NUM_RUNS } from "./helpers";

import type { Route, Router, State } from "@real-router/core";

/**
 * RFC-4 M2 (#1548) + `defaultSearch` (#1549) — the STRUCTURAL anti-masker.
 *
 * Invariant (search ↔ path consistency): for ANY committed state, the query
 * reconstructed from `state.path` carries EXACTLY the defined values in
 * `state.search`. `state.path` faithfully encodes `state.search` — no key the
 * URL prints is missing from `state.search`, and no defined `state.search` key
 * is missing from the URL.
 *
 * WHY THIS EXISTS: the CI e2e failure that motivated the `defaultSearch` work
 * was a `state.search` ↔ `state.path` DIVERGENCE — a state-commit path built
 * the URL from a different query bag than it committed to `state.search`
 * (`matchPath` rebuilt `state.path` from the raw matched query while committing
 * the recovered query to `state.search`). EVERY recovery unit test asserted
 * ONLY `state.search`, so the divergence hid; the e2e (which asserts the URL)
 * was the only thing that caught it. This property pins the two channels
 * together at the CORE level, across every state-producing path, so a future
 * regression in the pipeline's ⑤a (`buildURL` → `port.buildPath`, the navigate
 * path), in makeState's internal fallback
 * (`path: buildPath(name, mergedParams, mergedSearch)`, still used by every
 * entry point not yet migrated), in makeState's `defaultSearch` merge, or in the
 * `matchPath` URL rebuild can never again print one query while committing
 * another. (`buildPath`'s own `#mergeDefaultSearch` is NOT among them — see the
 * measured map below.)
 *
 * DISCRIMINATING POWER — re-measured on the nav-pipeline milestone (five
 * independent mutations, each applied and reverted; the previous map was written
 * before `navigate` moved onto `src/pipeline` and two of its four claims no
 * longer held). What each mutation actually kills:
 *
 *  | mutation                                                   | blocks red |
 *  |------------------------------------------------------------|------------|
 *  | `pipeline/buildURL` drops the query from `port.buildPath`   | 1, 2, 6    |
 *  | `makeState`'s path fallback drops `mergedSearch`            | 3          |
 *  | `matchPath`'s URL rebuild prints without the query          | 4, 7       |
 *  | `makeState` stops merging `defaultSearch`                   | 3, 5       |
 *  | `buildPath` stops merging `defaultSearch`                   | none       |
 *
 *  - blocks 1, 2 AND 6 (both navigate forms) now guard ONE builder — the
 *    pipeline's ⑤a. Block 2 used to sit with block 3: before the milestone the
 *    single-bag navigate reached its URL through makeState's internal fallback.
 *    It does not any more, so a `mergedSearch` regression is invisible to every
 *    navigate block and is pinned by block 3 alone.
 *  - block 3 is the only guard left on `makeState`'s own path build — the one
 *    still used by `canNavigateTo` / `isActiveRoute` and by direct plugin calls,
 *    i.e. by the seven entry points not yet on the pipeline.
 *  - blocks 4 and 7 guard the `matchPath` URL rebuild (the exact site of the e2e
 *    divergence — raw vs recovered query).
 *  - block 5 guards makeState's `defaultSearch` merge, NOT buildPath's
 *    `#mergeDefaultSearch` as previously claimed: dropping the latter kills
 *    nothing here (measured), because makeState merges the default itself and
 *    hands it to buildPath as an explicit `search`, making buildPath's own merge
 *    redundant on this path. That claim was already wrong before the milestone —
 *    `RoutesNamespace` is untouched by it. ⚠ No mutation in this set kills block 5
 *    alone (both that reach it also reach block 3), so its unique contribution is
 *    the VALUE assertion (`state.search` equals the route default), not the
 *    consistency invariant. Five mutations are not proof of redundancy; treat it
 *    as the open end of this map.
 *
 * A `state.search`-only assertion (the masking shape the e2e exposed) survives
 * EVERY one of these mutations — this property is exactly what that shape could
 * not see.
 *
 * TOLERANCES (principled, none masking):
 *  - `numberFormat: "auto"` retypes `"1"`→`1` on the URL→State parse, so values
 *    are compared STRINGIFIED (a URL only ever carries strings).
 *  - `state.search` may retain an explicit `{k: undefined}` key that the URL
 *    (correctly) omits — the search channel is not undefined-stripped (an M2-era
 *    asymmetry orthogonal to this task). A URL cannot carry `undefined`, so the
 *    invariant is over DEFINED values only.
 *  - We parse the QUERY of `state.path` (not string-compare the whole path), so
 *    trailingSlash / path-encoding choices never false-fail. Generated values
 *    are URL-safe (`[a-zA-Z0-9_-]` + small ints), isolating the CONSISTENCY
 *    invariant from encoding correctness (covered by pathRoundtrip.properties).
 */

const ROUTES: Route[] = [
  { name: "home", path: "/" },
  // Pure query route with a query-channel default (page).
  {
    name: "search",
    path: "/search?q&page&sort",
    defaultSearch: { page: "1" },
  },
  // Mixed channels: `:id` on the path (defaultParams), `?ref` on the query
  // (defaultSearch) — the two channels must stay independent AND each stay in
  // step with the URL.
  {
    name: "item",
    path: "/item/:id?ref",
    defaultParams: { id: "0" },
    defaultSearch: { ref: "home" },
  },
  // A decoder that injects a declared `?tag` into the PARAMS bag reproduces,
  // in bare core, the exact shape a plugin's forwardState injection produces
  // (persistent-params on start()): the declared key rides in `routeParams` on
  // the matchPath rebuild, with no defaultParams pollution. Locks the rebuild's
  // params→query routing (#1549).
  {
    name: "tagged",
    path: "/tagged/:id?tag",
    decodeParams: ({ params, search }) => ({
      params: { ...params, tag: "d" },
      search,
    }),
  },
];

/** URL-safe scalar: never needs percent-encoding, so router-encode and
 * URLSearchParams-decode agree trivially (isolates consistency from encoding). */
const arbVal = fc.oneof(
  fc.stringMatching(/^[a-zA-Z0-9_-]{1,12}$/),
  fc.integer({ min: 0, max: 9999 }),
);

/** Partial declared-query bag over {q, page, sort} — any subset present. */
const arbSearch = fc.record(
  { q: arbVal, page: arbVal, sort: arbVal },
  { requiredKeys: [] },
);

const arbId = fc.stringMatching(/^[a-zA-Z0-9_-]{1,10}$/);
const arbRefSearch = fc.record({ ref: arbVal }, { requiredKeys: [] });

/** The declared query the URL string carries, decoded to strings. */
function urlQuery(path: string): Record<string, string> {
  const i = path.indexOf("?");

  if (i === -1) {
    return {};
  }

  const out: Record<string, string> = {};

  for (const [k, v] of new URLSearchParams(path.slice(i + 1))) {
    out[k] = v;
  }

  return out;
}

/** `state.search` restricted to defined values, stringified for URL comparison. */
function definedSearchAsStrings(state: State): Record<string, string> {
  const out: Record<string, string> = {};

  for (const key of Object.keys(state.search)) {
    const value = state.search[key];

    if (value !== undefined) {
      out[key] = String(value);
    }
  }

  return out;
}

/** THE invariant: the URL's query ≡ the committed `state.search` (defined). */
function assertSearchMatchesPath(state: State): void {
  expect(urlQuery(state.path)).toStrictEqual(definedSearchAsStrings(state));
}

describe("core/state — search ↔ path consistency (#1548/#1549)", () => {
  let router: Router;
  let pluginApi: ReturnType<typeof getPluginApi>;

  beforeAll(async () => {
    router = createRouter(ROUTES, {
      queryParams: { numberFormat: "auto" },
    } as never);
    pluginApi = getPluginApi(router);
    await router.start("/");
  });

  afterAll(() => {
    router.stop();
  });

  // 1. navigate via the explicit search arg — makeState commit + explicit search
  //    + defaultSearch merge. `reload` keeps each run an independent transition
  //    (no SAME_STATES on a repeated draw).
  test.prop([arbSearch], { numRuns: NUM_RUNS.standard })(
    "navigate(name, {}, search): committed state.path encodes state.search",
    async (search) => {
      const state = await router.navigate("search", {}, search, {
        reload: true,
      });

      assertSearchMatchesPath(state);
    },
  );

  // 2. navigate via the params bag (v1 single-bag) — query-declared keys route
  //    to state.search; state.path must show exactly that query.
  test.prop([arbSearch], { numRuns: NUM_RUNS.standard })(
    "navigate(name, searchInParamsBag): committed state.path encodes state.search",
    async (search) => {
      const state = await router.navigate("search", search, undefined, {
        reload: true,
      });

      assertSearchMatchesPath(state);
    },
  );

  // 3. direct makeState (plugin API) — the pure state factory, no commit.
  test.prop([arbSearch], { numRuns: NUM_RUNS.standard })(
    "makeState(name, {}, search): state.path encodes state.search",
    (search) => {
      const state = pluginApi.makeState("search", {}, search);

      assertSearchMatchesPath(state);
    },
  );

  // 4. matchPath (URL→State rebuild) — the exact site of the e2e divergence.
  //    URL built manually from URL-safe values (decoupled from buildPath).
  test.prop([arbSearch], { numRuns: NUM_RUNS.standard })(
    "matchPath(url): rebuilt state.path encodes state.search",
    (search) => {
      const qs = Object.entries(search)
        .map(([k, v]) => `${k}=${v}`)
        .join("&");
      const url = qs ? `/search?${qs}` : "/search";

      const state = pluginApi.matchPath(url);

      expect(state).toBeDefined();

      assertSearchMatchesPath(state!);
    },
  );

  // 5. defaultSearch injection — no caller query at all. The query default must
  //    reach BOTH state.search AND state.path (the #mergeDefaultSearch / makeState
  //    default-routing consistency). A default that lands in state.search but not
  //    in the URL fails here (and ONLY here — a search-only assert would pass).
  test.prop([fc.constant(null)], { numRuns: NUM_RUNS.fast })(
    "defaultSearch reaches state.search AND state.path together",
    () => {
      const state = pluginApi.makeState("search");

      expect(state.search).toStrictEqual({ page: "1" });

      assertSearchMatchesPath(state);
    },
  );

  // 6. mixed path-param + query-default route — the two channels stay independent
  //    and each stays in step with the URL.
  test.prop([arbId, arbRefSearch], { numRuns: NUM_RUNS.standard })(
    "item(:id?ref): path param and query default each stay in step with the URL",
    async (id, refSearch) => {
      const state = await router.navigate("item", { id }, refSearch, {
        reload: true,
      });

      // Path param lives in state.params, never leaks into the query.
      expect(state.params).toStrictEqual({ id });
      expect(urlQuery(state.path)).not.toHaveProperty("id");

      // ref: explicit wins over the default; absent → default "home". Either way
      // state.search and state.path agree.
      assertSearchMatchesPath(state);
    },
  );

  // 7. A declared `?key` riding in routeParams during the matchPath rebuild (here
  //    via a query-declared defaultParam; the same shape a plugin's forwardState
  //    injection produces — persistent-params on start()) must reach state.path,
  //    not only state.search. The #1549 rebuild routes params-bag declared keys
  //    into the URL query; without it state.search carries `tag` while the URL
  //    omits it. Verified mutationally: reverting that routing fails this block.
  test.prop([arbId], { numRuns: NUM_RUNS.standard })(
    "matchPath: a declared key riding in routeParams reaches state.path AND state.search",
    (id) => {
      const state = pluginApi.matchPath(`/tagged/${id}`);

      expect(state).toBeDefined();
      expect(state!.params).toStrictEqual({ id });
      expect(state!.search).toStrictEqual({ tag: "d" });

      assertSearchMatchesPath(state!);
    },
  );
});

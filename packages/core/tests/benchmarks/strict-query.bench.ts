/**
 * Core hot-path benchmarks — `queryParamsMode: "strict"` matcher form.
 *
 * Strict mode allocates a Set per match to reject undeclared query params
 * (RFC §6.5). Isolated in its own file/process so its matcher shape does not
 * megamorphic-pollute the default-form inline caches (§9.2 / §6.6.1).
 */
import { batched, isMain, keep, makeBench, settleHeap } from "./fixtures";
import { createRouter } from "../../src";
import { getPluginApi } from "../../src/api";

import type { Route, SearchParams } from "../../src";

export async function run(): Promise<void> {
  const bench = makeBench("strict-query");

  const routes: Route[] = [
    { name: "home", path: "/" },
    { name: "search", path: "/search?q&page&sort&filter&limit" },
  ];
  const url = "/search?q=test&page=1&sort=date&filter=active&limit=10";

  {
    const router = createRouter(routes, { queryParamsMode: "strict" });

    await router.start("/");
    const api = getPluginApi(router);

    bench.add(
      "matchPath/strict-query",
      batched(128, () => {
        keep(api.matchPath(url));
      }),
    );
  }

  // Explicit `search` channel under strict mode (RFC-4 M2 / #1548): the caller
  // pre-separates the query, and the strict-reject Set still allocates per
  // match — so this arm is the strict matcher cost on a clean two-channel call.
  //
  // It used to be one half of a delta pair: `navigate/strict-query` passed the
  // same five keys in the `params` bag, and the difference isolated the
  // channel-split cost from the strict matcher cost. That arm is GONE, not
  // migrated — the single-bag spelling throws at the facade since the channel
  // guard's P1 (#1572), so the delta has no second term any more, and migrating
  // it would have produced a byte-identical duplicate of this block (same
  // routes, same five keys, same batch). Same retirement as
  // `navigate/search-single-bag` in default.bench.ts.
  {
    const router = createRouter(routes, { queryParamsMode: "strict" });

    await router.start("/");
    const searches: SearchParams[] = [
      { q: "a", page: "1", sort: "date", filter: "active", limit: "10" },
      { q: "b", page: "2", sort: "name", filter: "all", limit: "20" },
    ];
    let i = 0;

    bench.add(
      "navigate/strict-query-channel",
      batched(192, () => {
        void router.navigate("search", {}, searches[i++ % searches.length]);
      }),
    );
  }

  // buildPath under strict mode — the query string comes from the `search`
  // argument, the path bag stays empty. `buildPath` has no channel guard (it is
  // a predicate-class entry point, deliberately uninstrumented), so the
  // single-bag spelling this arm used to carry still RUNS today — it just
  // reaches the query string through the engine's `search ?? params` fallback
  // instead of the channel. That fallback is what nav-pipeline Phase 2 removes
  // from `buildPath`, at which point the old spelling would have printed a bare
  // `/search` and this arm would have gone on measuring nothing. Spelled in the
  // channel it survives the migration and measures the same URL build.
  {
    const router = createRouter(routes, { queryParamsMode: "strict" });

    await router.start("/");
    const search: SearchParams = {
      q: "test",
      page: "1",
      sort: "date",
      filter: "active",
      limit: "10",
    };

    bench.add(
      "buildPath/strict-query",
      batched(384, () => {
        keep(router.buildPath("search", {}, search));
      }),
    );
  }

  await settleHeap();
  await bench.run();
  console.table(bench.table());
}

if (isMain(__filename)) {
  run().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

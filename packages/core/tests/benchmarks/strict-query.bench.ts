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

import type { Params, Route } from "../../src";

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

  {
    const router = createRouter(routes, { queryParamsMode: "strict" });

    await router.start("/");
    const targets: Params[] = [
      { q: "a", page: "1", sort: "date", filter: "active", limit: "10" },
      { q: "b", page: "2", sort: "name", filter: "all", limit: "20" },
    ];
    let i = 0;

    bench.add(
      "navigate/strict-query",
      batched(192, () => {
        void router.navigate("search", targets[i++ % targets.length]);
      }),
    );
  }

  {
    const router = createRouter(routes, { queryParamsMode: "strict" });

    await router.start("/");
    const params: Params = {
      q: "test",
      page: "1",
      sort: "date",
      filter: "active",
      limit: "10",
    };

    bench.add(
      "buildPath/strict-query",
      batched(384, () => {
        keep(router.buildPath("search", params));
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

/**
 * Core hot-path benchmarks — `trailingSlash: "preserve"` matcher form.
 *
 * Preserve mode re-attaches the source URL's trailing-slash choice after the
 * rewrite pipeline (`matchSourceTrailingSlash`, popstate fixture 6). Isolated
 * in its own file/process to keep its matcher shape from polluting the
 * default-form inline caches (§9.2).
 */
import { addBatched, isMain, keep, makeBench, settleHeap } from "./fixtures";
import { createRouter } from "../../src";
import { getPluginApi } from "../../src/api";

import type { Route } from "../../src";

export async function run(): Promise<void> {
  const bench = makeBench("trailing-preserve");

  const routes: Route[] = [
    { name: "home", path: "/" },
    { name: "users", path: "/users" },
    { name: "about", path: "/about" },
  ];
  const urls = ["/users/", "/users", "/about/", "/about"];

  {
    const router = createRouter(routes, { trailingSlash: "preserve" });

    await router.start("/");
    const api = getPluginApi(router);
    let i = 0;

    addBatched(bench, "matchPath/trailing-preserve", 48, () => {
      keep(api.matchPath(urls[i++ % urls.length]));
    });
  }

  // Popstate round-trip under preserve: matchPath → navigate.
  {
    const router = createRouter(routes, { trailingSlash: "preserve" });

    await router.start("/");
    const api = getPluginApi(router);
    let i = 0;

    addBatched(bench, "navigate/trailing-preserve-roundtrip", 12, () => {
      const matched = api.matchPath(urls[i++ % urls.length]);

      if (matched) {
        void router.navigate(matched.name, matched.params);
      }
    });
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

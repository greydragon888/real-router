/**
 * Core hot-path benchmarks — `urlParamsEncoding: "none"` matcher form.
 *
 * The pass-through encode/decode strategy. Isolated in its own file/process so
 * its encode-strategy call-site stays monomorphic under instrumentation,
 * distinct from the default and uriComponent forms (§9.2 / §6.6.1).
 */
import { addBatched, isMain, keep, makeBench, settleHeap } from "./fixtures";
import { createRouter } from "../../src";
import { getPluginApi } from "../../src/api";

import type { Route } from "../../src";

export async function run(): Promise<void> {
  const bench = makeBench("encoding-none");

  const routes: Route[] = [{ name: "user", path: "/users/:id" }];

  {
    const router = createRouter(routes, { urlParamsEncoding: "none" });

    await router.start("/users/seed");
    const api = getPluginApi(router);

    addBatched(bench, "matchPath/encoding-none", 48, () => {
      keep(api.matchPath("/users/plainvalue"));
    });
  }

  {
    const router = createRouter(routes, { urlParamsEncoding: "none" });

    await router.start("/users/seed");

    addBatched(bench, "buildPath/encoding-none", 48, () => {
      keep(router.buildPath("user", { id: "plainvalue" }));
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

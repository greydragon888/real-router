/**
 * Core hot-path benchmarks — `urlParamsEncoding: "uriComponent"` matcher form.
 *
 * Exercises the encode (buildPath) / decode (matchPath) strategy that differs
 * from the default. Isolated in its own file/process so the encode-strategy
 * call-site stays monomorphic under instrumentation (§9.2 / §6.6.1).
 */
import { keep, makeBench } from "./fixtures";
import { createRouter } from "../../src";
import { getPluginApi } from "../../src/api";

import type { Route } from "../../src";

async function main(): Promise<void> {
  const bench = makeBench("encoding-uricomponent");

  const routes: Route[] = [{ name: "user", path: "/users/:id" }];

  {
    const router = createRouter(routes, { urlParamsEncoding: "uriComponent" });

    await router.start("/users/seed");
    const api = getPluginApi(router);

    bench.add("matchPath/encoding-uriComponent", () => {
      keep(api.matchPath("/users/hello%20world"));
    });
  }

  {
    const router = createRouter(routes, { urlParamsEncoding: "uriComponent" });

    await router.start("/users/seed");

    bench.add("buildPath/encoding-uriComponent", () => {
      keep(router.buildPath("user", { id: "hello world" }));
    });
  }

  await bench.run();
  console.table(bench.table());
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

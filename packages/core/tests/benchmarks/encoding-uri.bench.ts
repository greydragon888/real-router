/**
 * Core hot-path benchmarks — `urlParamsEncoding: "uri"` matcher form.
 *
 * Exercises the encodeURI / decodeURI strategy — distinct from the default
 * (encodeURIComponent-excluding-sub-delims) and uriComponent forms: `uri`
 * preserves reserved chars (`/?:@&=+$#`) that uriComponent percent-encodes.
 * Isolated in its own file/process so the encode-strategy call-site stays
 * monomorphic under instrumentation (§9.2 / §6.6.1).
 */
import { keep, makeBench } from "./fixtures";
import { createRouter } from "../../src";
import { getPluginApi } from "../../src/api";

import type { Route } from "../../src";

async function main(): Promise<void> {
  const bench = makeBench("encoding-uri");

  const routes: Route[] = [{ name: "user", path: "/users/:id" }];

  {
    const router = createRouter(routes, { urlParamsEncoding: "uri" });

    await router.start("/users/seed");
    const api = getPluginApi(router);

    bench.add("matchPath/encoding-uri", () => {
      keep(api.matchPath("/users/hello%20world"));
    });
  }

  {
    const router = createRouter(routes, { urlParamsEncoding: "uri" });

    await router.start("/users/seed");

    bench.add("buildPath/encoding-uri", () => {
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

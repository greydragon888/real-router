/**
 * Core hot-path benchmarks — `urlParamsEncoding: "uri"` matcher form.
 *
 * Exercises the encodeURI / decodeURI strategy — distinct from the default
 * (encodeURIComponent-excluding-sub-delims) and uriComponent forms: `uri`
 * preserves reserved chars (`/?:@&=+$#`) that uriComponent percent-encodes.
 * Isolated in its own file/process so the encode-strategy call-site stays
 * monomorphic under instrumentation (§9.2 / §6.6.1).
 */
import { batched, isMain, keep, makeBench, settleHeap } from "./fixtures";
import { createRouter } from "../../src";
import { getPluginApi } from "../../src/api";

import type { Route } from "../../src";

export async function run(): Promise<void> {
  const bench = makeBench("encoding-uri");

  const routes: Route[] = [{ name: "user", path: "/users/:id" }];

  {
    const router = createRouter(routes, { urlParamsEncoding: "uri" });

    await router.start("/users/seed");
    const api = getPluginApi(router);

    // Genuinely ~99 µs/op — ×7 its encoding siblings (stable across runs
    // 6a588535/6a5887c4, so a real cost, not a GC artifact), hence the low K.
    bench.add(
      "matchPath/encoding-uri",
      batched(48, () => {
        keep(api.matchPath("/users/hello%20world"));
      }),
    );
  }

  {
    const router = createRouter(routes, { urlParamsEncoding: "uri" });

    await router.start("/users/seed");

    bench.add(
      "buildPath/encoding-uri",
      batched(1536, () => {
        keep(router.buildPath("user", { id: "hello world" }));
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

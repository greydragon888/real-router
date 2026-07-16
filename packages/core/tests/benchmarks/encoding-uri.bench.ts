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

    // Genuinely ~34 µs/op — ~×3 its encoding siblings (~10-12 µs; stable
    // across runs, so a real decodeURI-strategy cost, not a GC artifact).
    // The earlier "~99 µs" read came from a dirty single-shot measurement.
    bench.add(
      "matchPath/encoding-uri",
      batched(128, () => {
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

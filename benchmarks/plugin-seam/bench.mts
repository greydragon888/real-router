/**
 * The href door, with the real plugins installed.
 *
 * ⚑ **The one cost in this repo that no other benchmark can see.** Core's suite
 * cannot install a plugin — core does not depend on one — and the six adapter
 * suites install `memory-plugin`, which registers no interceptor. So the work a
 * plugin does on `router.buildPath` (the call behind every `<Link>` href) is
 * measured by nothing, and a change that relocates a plugin's interceptor onto
 * that door would land with every existing benchmark flat.
 *
 * That change is on the table: #1938 asks whether the injection seam belongs
 * above the default merge on every door. Measured on a prototype, the move costs
 * `search-schema` +68 % on this call and `persistent-params` nothing — the second
 * plugin already hangs on this door, so for it the move is a move. Those two
 * readings are why the arms below are per-plugin and not one aggregate.
 *
 * ⚠ **A stand-in interceptor is not a substitute, measured rather than assumed.**
 * A trivial pass-through put the same move at +16 %. The work is the PLUGIN's,
 * so the plugin has to be the one running, and the arms below install the
 * shipped factories rather than emulating them.
 *
 * ⚠ **This rides the `adapters` CodSpeed job rather than adding a third.** The
 * workflow's two jobs already serialise on a single self-hosted slot, and
 * aggregation requires them to stay inside one workflow — a third job buys
 * nothing here and costs wall-clock on a runner with an OOM history. The entry
 * lives in `adapter-bench/codspeed.mts`'s suite list, which is a plain list of
 * `() => import(...)`; this suite needs no vite prebuild and no DOM.
 *
 * Local: `pnpm -C benchmarks run bench:seam`.
 */
import { createRouter } from "@real-router/core";
import { persistentParamsPluginFactory } from "@real-router/persistent-params-plugin";
import { searchSchemaPlugin } from "@real-router/search-schema-plugin";
import { z } from "zod";

import {
  batched,
  makeBench,
} from "../adapter-bench/shared/bench-utils.mjs";

import type { Router } from "@real-router/core";

/**
 * Three optional keys — a FLOOR, not a worst case. A larger schema costs more,
 * and an application quoting this number should re-measure against its own.
 */
const shape = z.object({
  q: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).max(999).optional(),
  sort: z.enum(["asc", "desc"]).optional(),
});

const searchSchema = {
  "~standard": {
    version: 1,
    vendor: "plugin-seam-bench",
    validate: (value: unknown) => {
      const parsed = shape.safeParse(value);

      return parsed.success
        ? { value: parsed.data }
        : {
            issues: parsed.error.issues.map((issue) => ({
              message: issue.message,
              path: issue.path,
            })),
          };
    },
  },
};

type Arm = "none" | "schema" | "persistent" | "both";

async function routerFor(arm: Arm): Promise<Router> {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "list", path: "/list?q&page&sort", searchSchema },
  ]);

  if (arm === "schema" || arm === "both") {
    router.usePlugin(searchSchemaPlugin({ mode: "production", strict: false }));
  }
  if (arm === "persistent" || arm === "both") {
    router.usePlugin(persistentParamsPluginFactory({ sort: "asc" }));
  }

  await router.start("/");

  return router;
}

export async function run(): Promise<void> {
  const bench = makeBench("plugin-seam");
  const search = { q: "hello", page: "2" };

  for (const arm of ["none", "schema", "persistent", "both"] as const) {
    const router = await routerFor(arm);

    // `none` is the control the other three are read against: on its own a
    // per-arm number says nothing about what the plugin added, and the arms
    // differ by an order of magnitude between plugins.
    bench.add(
      `seam/buildPath-${arm}`,
      batched(1024, () => {
        router.buildPath("list", {}, search);
      }),
    );
  }

  await bench.run();
  console.table(bench.table());
}

if (process.argv[1]?.endsWith("bench.mts")) {
  run().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

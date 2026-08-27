/**
 * Vue adapter hot-path benches — see shared/bench-utils.mjs for the
 * measurement discipline and apps/vue.ts for the commit mechanics.
 * Vue is the one ASYNC suite: commits settle on nextTick (no flushSync in
 * Vue), so bodies are batchedAsync and the microtask hop is part of the
 * measured span (negligible vs the multi-ms render mass).
 * K is CALIBRATED per bench, not shared: `K = ceil(4000µs / per-op)` from
 * measured wall-clock medians, rounded up the {48,64,96,128,192,256,384,512}
 * series — the same rule #984 applied to the core suite. Below ~4 ms of mass a
 * simulation run measures ONE invocation in which first-call work dominates,
 * which is REPRODUCIBLE (V8 runs --predictable) and therefore indistinguishable
 * from a real regression by an A/A pair. Re-calibrate from a fresh local run if
 * a bench body changes; do NOT lower K to save CI time.
 */
import {
  batchedAsync,
  makeBench,
  newContainer,
  selfCheck,
  settleHeap,
} from "../shared/bench-utils.mjs";

import type { MountTestApp } from "../shared/bench-utils.mjs";

type AppModule = { mountTestApp: MountTestApp };

const { mountTestApp } = (await import(
  // @ts-expect-error -- vite prebuild artifact, no declarations
  "../dist/vue/app.mjs"
)) as unknown as AppModule;

export async function run(): Promise<void> {
  await selfCheck("vue", mountTestApp);

  const bench = makeBench("vue-adapter");

  {
    const app = await mountTestApp(newContainer(), "/items/1");
    const ids = ["2", "1"] as const;
    let i = 0;

    bench.add(
      "vue/navigate-param-swap",
      batchedAsync(192, async () => {
        await app.commitNavigate("items", { id: ids[i++ % ids.length] });
      }),
    );
  }

  {
    const app = await mountTestApp(newContainer(), "/items/1");
    const targets = ["about", "items"] as const;
    let i = 0;

    bench.add(
      "vue/navigate-route-swap",
      batchedAsync(96, async () => {
        const name = targets[i++ % targets.length];

        await app.commitNavigate(
          name,
          name === "items" ? { id: "1" } : undefined,
        );
      }),
    );
  }

  {
    const app = await mountTestApp(newContainer(), "/items/1");

    await app.commitNavigate("about");
    let back = true;

    bench.add(
      "vue/back-forward",
      batchedAsync(96, async () => {
        await app.commitHistory(back ? "back" : "forward");
        back = !back;
      }),
    );
  }

  // routeSearch active-recompute (RFC-4 M2 / #1548): query-only ?tab swap on
  // the same route — RouteView/param subscribers stay put; the five routeSearch
  // <Link>s recompute active (ignoreQueryParams=false slow-path active source).
  {
    const app = await mountTestApp(newContainer(), "/search?tab=t0");
    const tabs = ["t1", "t0"] as const;
    let i = 0;

    bench.add(
      "vue/navigate-search-active-swap",
      batchedAsync(384, async () => {
        await app.commitNavigate("search", undefined, {
          tab: tabs[i++ % tabs.length],
        });
      }),
    );
  }

  await settleHeap();
  await bench.run();
  console.table(bench.table());
}

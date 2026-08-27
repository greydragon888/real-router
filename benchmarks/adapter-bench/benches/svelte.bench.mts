/**
 * Svelte adapter hot-path benches — see shared/bench-utils.mjs for the
 * measurement discipline and apps/svelte/index.ts for the commit mechanics.
 * K is CALIBRATED per bench, not shared: `K = ceil(4000µs / per-op)` from
 * measured wall-clock medians, rounded up the {48,64,96,128,192,256,384,512}
 * series — the same rule #984 applied to the core suite. Below ~4 ms of mass a
 * simulation run measures ONE invocation in which first-call work dominates,
 * which is REPRODUCIBLE (V8 runs --predictable) and therefore indistinguishable
 * from a real regression by an A/A pair. Re-calibrate from a fresh local run if
 * a bench body changes; do NOT lower K to save CI time.
 */
import {
  batched,
  makeBench,
  newContainer,
  selfCheck,
  settleHeap,
} from "../shared/bench-utils.mjs";

import type { MountTestApp } from "../shared/bench-utils.mjs";

type AppModule = { mountTestApp: MountTestApp };

const { mountTestApp } = (await import(
  // @ts-expect-error -- vite prebuild artifact, no declarations
  "../dist/svelte/app.mjs"
)) as unknown as AppModule;

export async function run(): Promise<void> {
  await selfCheck("svelte", mountTestApp);

  const bench = makeBench("svelte-adapter");

  // param navigation: items/1 <-> items/2 — subscriber fan-out + Link
  // active recompute; RouteView subtree stays mounted.
  {
    const app = await mountTestApp(newContainer(), "/items/1");
    const ids = ["2", "1"] as const;
    let i = 0;

    bench.add(
      "svelte/navigate-param-swap",
      batched(192, () => {
        app.commitNavigate("items", { id: ids[i++ % ids.length] });
      }),
    );
  }

  // route swap: items/1 <-> about — conditional subtree unmount/mount.
  {
    const app = await mountTestApp(newContainer(), "/items/1");
    const targets = ["about", "items"] as const;
    let i = 0;

    bench.add(
      "svelte/navigate-route-swap",
      batched(48, () => {
        const name = targets[i++ % targets.length];

        app.commitNavigate(name, name === "items" ? { id: "1" } : undefined);
      }),
    );
  }

  // memory-plugin history churn: back <-> forward (navigateToState path).
  {
    const app = await mountTestApp(newContainer(), "/items/1");

    await app.commitNavigate("about");
    let back = true;

    bench.add(
      "svelte/back-forward",
      batched(64, () => {
        app.commitHistory(back ? "back" : "forward");
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
      "svelte/navigate-search-active-swap",
      batched(384, () => {
        app.commitNavigate("search", undefined, {
          tab: tabs[i++ % tabs.length],
        });
      }),
    );
  }

  await settleHeap();
  await bench.run();
  console.table(bench.table());
}

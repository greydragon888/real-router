/**
 * React adapter hot-path benches — see shared/bench-utils.mjs for the
 * measurement discipline and apps/react.tsx for the commit mechanics.
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
  "../dist/react/app.mjs"
)) as unknown as AppModule;

export async function run(): Promise<void> {
  await selfCheck("react", mountTestApp);

  const bench = makeBench("react-adapter");

  // param navigation: items/1 <-> items/2 — subscriber fan-out + Link
  // active recompute; RouteView subtree stays mounted.
  {
    const app = await mountTestApp(newContainer(), "/items/1");
    const ids = ["2", "1"] as const;
    let i = 0;

    bench.add(
      "react/navigate-param-swap",
      batched(96, () => {
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
      "react/navigate-route-swap",
      batched(64, () => {
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
      "react/back-forward",
      batched(64, () => {
        app.commitHistory(back ? "back" : "forward");
        back = !back;
      }),
    );
  }

  // routeSearch active-recompute (RFC-4 M2 / #1548): query-only swap between two
  // `?tab=` values on the SAME route. Distinct from `navigate-param-swap` — the
  // active route name and params are unchanged, only the query flips, so the
  // RouteView subtree and param subscribers stay put while the five
  // `routeSearch` <Link>s recompute active (the `ignoreQueryParams: false`
  // slow-path `createActiveRouteSource`, not the name-only fast selector).
  {
    const app = await mountTestApp(newContainer(), "/search?tab=t0");
    const tabs = ["t1", "t0"] as const;
    let i = 0;

    bench.add(
      "react/navigate-search-active-swap",
      batched(128, () => {
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

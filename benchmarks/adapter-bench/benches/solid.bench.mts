/**
 * Solid adapter hot-path benches — see shared/bench-utils.mjs for the
 * measurement discipline and apps/solid.tsx for the commit mechanics.
 * K=2: first-callgrind-run calibration pending (adjust from honest masses).
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
  "../dist/solid/app.mjs"
)) as unknown as AppModule;

export async function run(): Promise<void> {
  await selfCheck("solid", mountTestApp);

  const bench = makeBench("solid-adapter");

  // param navigation: items/1 <-> items/2 — subscriber fan-out + Link
  // active recompute; RouteView subtree stays mounted.
  // K=24 (~13 ms — double the usual target): this bench is the suite's
  // chronic GC-alignment victim (straddled the 10% threshold at K=2 AND K=8
  // with a ~0.2-0.5 ms swing; same class as core's task-#1 sync-baseline —
  // extra mass, not more K-nudging, is the fix).
  {
    const app = await mountTestApp(newContainer(), "/items/1");
    const ids = ["2", "1"] as const;
    let i = 0;

    bench.add(
      "solid/navigate-param-swap",
      batched(24, () => {
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
      "solid/navigate-route-swap",
      batched(4, () => {
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
      "solid/back-forward",
      batched(2, () => {
        app.commitHistory(back ? "back" : "forward");
        back = !back;
      }),
    );
  }

  await settleHeap();
  await bench.run();
  console.table(bench.table());
}

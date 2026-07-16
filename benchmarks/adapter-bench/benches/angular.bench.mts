/**
 * Angular adapter hot-path benches — see shared/bench-utils.mjs for the
 * measurement discipline and apps/angular/main.ts for the commit mechanics.
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
  "../dist/angular/app.mjs"
)) as unknown as AppModule;

export async function run(): Promise<void> {
  await selfCheck("angular", mountTestApp);

  const bench = makeBench("angular-adapter");

  // param navigation: items/1 <-> items/2 — subscriber fan-out + Link
  // active recompute; RouteView subtree stays mounted.
  {
    const app = await mountTestApp(newContainer(), "/items/1");
    const ids = ["2", "1"] as const;
    let i = 0;

    bench.add(
      "angular/navigate-param-swap",
      batched(4, () => {
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
      "angular/navigate-route-swap",
      batched(2, () => {
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
      "angular/back-forward",
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

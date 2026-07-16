/**
 * Vue adapter hot-path benches — see shared/bench-utils.mjs for the
 * measurement discipline and apps/vue.ts for the commit mechanics.
 * Vue is the one ASYNC suite: commits settle on nextTick (no flushSync in
 * Vue), so bodies are batchedAsync and the microtask hop is part of the
 * measured span (negligible vs the multi-ms render mass).
 * K=2: first-callgrind-run calibration pending.
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
      batchedAsync(2, async () => {
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
      batchedAsync(2, async () => {
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
      batchedAsync(2, async () => {
        await app.commitHistory(back ? "back" : "forward");
        back = !back;
      }),
    );
  }

  await settleHeap();
  await bench.run();
  console.table(bench.table());
}

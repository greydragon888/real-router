/**
 * PoC: React-adapter hot-path bench — pure tinybench + vite-prebuilt app
 * under jsdom (path B from the adapter-bench research).
 *
 * Run (from benchmarks/):
 *   pnpm exec vite build --config adapter-bench-poc/vite.config.mts
 *   node --expose-gc --import tsx adapter-bench-poc/react.bench.mts
 *
 * Single direct node process — the exact shape the core CodSpeed gate uses,
 * so the V8-flag injection question of vitest workers does not apply.
 *
 * Measurement discipline is inherited from the core gate saga (see
 * IMPLEMENTATION_NOTES "CodSpeed benchmark gate — consolidated record"):
 * batched() mass per measured call, settleHeap() before run, flushSync per
 * navigation so every iteration includes the React commit synchronously
 * (no event-loop hops inside the measure window).
 */
import "./jsdom-env.mjs";

import { withCodSpeed } from "@codspeed/tinybench-plugin";
import { Bench } from "tinybench";

import type { Router } from "@real-router/core";

interface MountResult {
  router: Router;
  unmount: () => void;
}

type AppModule = {
  mountTestApp: (
    container: HTMLElement,
    startPath: string,
  ) => Promise<MountResult>;
  flushSync: <R>(fn: () => R) => R;
};

// dynamic import AFTER the jsdom shim side-effects
const { mountTestApp, flushSync } = (await import(
  // @ts-expect-error -- build artifact (vite prebuild), no declarations
  "./dist/app.mjs"
)) as unknown as AppModule;

const bench = withCodSpeed(
  new Bench({ name: "react-adapter", time: 100, warmup: false, throws: true }),
);

/** Same helper as core's fixtures.ts — mass per measured call. */
function batched(iterations: number, fn: () => void): () => void {
  return () => {
    for (let i = 0; i < iterations; i++) {
      fn();
    }
  };
}

async function settleHeap(): Promise<void> {
  const gc = (globalThis as { gc?: () => void }).gc;

  if (!gc) {
    return;
  }

  for (let round = 0; round < 2; round++) {
    gc();
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  }
}

function mount(startPath: string): Promise<MountResult> {
  const container = document.createElement("div");

  document.body.append(container);

  return mountTestApp(container, startPath);
}

// ---------------------------------------------------------------------------
// Self-check BEFORE measuring: a flushSync'd navigation must commit to the
// DOM synchronously — otherwise the benches would measure router-only work
// while React batches renders outside the measure window.
{
  const { router, unmount } = await mount("/items/1");
  const container = document.body.lastElementChild as HTMLElement;
  const routeAttr = (): string =>
    container.querySelector("span[data-route]")?.getAttribute("data-route") ??
    "";

  const before = routeAttr();

  flushSync(() => {
    void router.navigate("about");
  });

  const after = routeAttr();

  if (before !== "items" || after !== "about") {
    throw new Error(
      `self-check failed: DOM did not commit synchronously (before=${before}, after=${after})`,
    );
  }
  unmount();
  container.remove();
  console.log("self-check: flushSync navigation commits to DOM synchronously");
}

// ---------------------------------------------------------------------------
// 1. param navigation: items/1 ⇄ items/2 — uSES fan-out + Link active
//    recompute + node-scoped subscribers; RouteView subtree stays mounted.
{
  const { router } = await mount("/items/1");
  const ids = ["2", "1"] as const;
  let i = 0;

  bench.add(
    "react/navigate-param-swap",
    batched(16, () => {
      flushSync(() => {
        void router.navigate("items", { id: ids[i++ % ids.length] });
      });
    }),
  );
}

// 2. route swap: items/1 ⇄ about — conditional subtree unmount/mount on top
//    of the fan-out (the "page change" shape).
{
  const { router } = await mount("/items/1");
  const targets = ["about", "items"] as const;
  let i = 0;

  bench.add(
    "react/navigate-route-swap",
    batched(16, () => {
      const name = targets[i++ % targets.length];

      flushSync(() => {
        void router.navigate(name, name === "items" ? { id: "1" } : undefined);
      });
    }),
  );
}

// 3. memory-plugin history churn: back() ⇄ forward() — snapshot commit path
//    (navigateToState), no matcher work, pure adapter re-render.
{
  const { router } = await mount("/items/1");

  await router.navigate("about");
  let back = true;

  bench.add(
    "react/back-forward",
    batched(16, () => {
      flushSync(() => {
        if (back) {
          router.back();
        } else {
          router.forward();
        }
        back = !back;
      });
    }),
  );
}

await settleHeap();
await bench.run();
console.table(bench.table());

// PoC sanity: fail loudly if jsdom actually rendered nothing.
const anchors = document.querySelectorAll("a").length;

if (anchors < 8) {
  throw new Error(`PoC sanity failed: expected ≥8 <a>, got ${String(anchors)}`);
}
console.log(`sanity: ${String(anchors)} anchors rendered across mounts`);

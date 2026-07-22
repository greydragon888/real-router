/**
 * Shared bench plumbing for the adapter suite — same discipline as the core
 * gate (IMPLEMENTATION_NOTES "CodSpeed benchmark gate — consolidated record"):
 * batched mass per measured call + settleHeap before each run.
 *
 * IMPORTANT: `bench.add` must stay in each per-framework bench file — the
 * CodSpeed plugin attributes the benchmark URI to the file that CALLS `add`
 * (an add-wrapping helper re-homes every URI to this file).
 */
import { withCodSpeed } from "@codspeed/tinybench-plugin";
import { Bench } from "tinybench";

export function makeBench(name: string): Bench {
  return withCodSpeed(
    new Bench({ name, time: 100, warmup: false, throws: true }),
  );
}

/** K sync ops per measured call. */
export function batched(iterations: number, fn: () => void): () => void {
  return () => {
    for (let i = 0; i < iterations; i++) {
      fn();
    }
  };
}

/** K async ops per measured call (Vue — commit settles on nextTick). */
export function batchedAsync(
  iterations: number,
  fn: () => Promise<void>,
): () => Promise<void> {
  return async () => {
    for (let i = 0; i < iterations; i++) {
      await fn();
    }
  };
}

export async function settleHeap(): Promise<void> {
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

/** Adapter-app contract: framework-specific commit mechanics live in the app. */
export interface MountedApp {
  /**
   * navigate + framework-synchronous render commit (Vue: settles async).
   * `search` is the query channel (RFC-4 M2 / #1548) — passed to
   * `router.navigate(name, params, search)`; a query-only swap drives the
   * `routeSearch` <Link> active-recompute path.
   */
  commitNavigate: (
    name: string,
    params?: Record<string, string>,
    search?: Record<string, string>,
  ) => void | Promise<void>;
  /** memory-plugin back()/forward() + the same commit mechanics. */
  commitHistory: (dir: "back" | "forward") => void | Promise<void>;
  unmount: () => void;
}

export type MountTestApp = (
  container: HTMLElement,
  startPath: string,
) => Promise<MountedApp>;

/** Fresh container in document.body per mounted app. */
export function newContainer(): HTMLElement {
  const container = document.createElement("div");

  document.body.append(container);

  return container;
}

/**
 * Pre-measure self-check: one committed navigation must mutate the DOM
 * (every app renders `<span data-route>`); otherwise the benches would
 * silently measure router-only work while the framework batches renders
 * outside the measure window.
 */
export async function selfCheck(
  fw: string,
  mountTestApp: MountTestApp,
): Promise<void> {
  const container = newContainer();
  const app = await mountTestApp(container, "/items/1");
  const routeAttr = (): string =>
    container.querySelector("span[data-route]")?.getAttribute("data-route") ??
    "";

  const before = routeAttr();

  await app.commitNavigate("about");

  const after = routeAttr();

  if (before !== "items" || after !== "about") {
    throw new Error(
      `${fw} self-check failed: DOM did not commit (before=${before}, after=${after})`,
    );
  }
  app.unmount();
  container.remove();
  console.log(`${fw} self-check: navigation commits to DOM synchronously`);
}

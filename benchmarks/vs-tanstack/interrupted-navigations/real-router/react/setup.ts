import type { Router } from "@real-router/core";

interface SlowControls {
  has: (id: string) => boolean;
  resolve: (id: string) => void;
  resolveAll: () => void;
}

interface AppModule {
  mountTestApp: (
    container: HTMLElement,
    startPath?: string,
  ) => Promise<{ router: Router; unmount: () => void }>;
  slowLoaderControls: SlowControls;
}

let module_: AppModule | undefined;

// Module-level so slow/fast ids never repeat across runner invocations.
let pairIndex = 0;
let lcg = 13;

function nextSegment() {
  lcg = (lcg * 1_664_525 + 1_013_904_223) >>> 0;

  return lcg.toString(36);
}

async function drainMicrotasks() {
  for (let index = 0; index < 5; index++) {
    await Promise.resolve();
  }
}

/**
 * interrupted-navigations: start a slow navigation (hangs in canActivate), let a
 * fast navigation interrupt it (core aborts the pending nav → TRANSITION_CANCELLED),
 * then release the slow guard. Detects that superseded in-flight navigations —
 * their closures, contexts, abort controllers — are reclaimed (flat heap floor).
 */
export function setup(appModulePath = "./dist/app.mjs") {
  let container: HTMLDivElement | undefined;
  let router: Router | undefined;
  let unmount: (() => void) | undefined;
  let unsubscribe = () => {};
  let resolveRendered: () => void = () => {};

  async function before() {
    module_ ??= (await import(appModulePath)) as AppModule;

    container = document.createElement("div");
    document.body.append(container);

    const mounted = await module_.mountTestApp(container, "/");

    router = mounted.router;
    unmount = mounted.unmount;
    unsubscribe = router.subscribe(() => {
      resolveRendered();
    });

    pairIndex = 0;
  }

  async function waitForSlow(id: string) {
    for (let attempt = 0; attempt < 20; attempt++) {
      if (module_!.slowLoaderControls.has(id)) {
        return;
      }

      await drainMicrotasks();
    }

    throw new Error(`slow navigation did not register for id: ${id}`);
  }

  function navigateFast(id: string) {
    const rendered = new Promise<void>((resolve) => {
      resolveRendered = () => {
        queueMicrotask(resolve);
      };
    });

    return Promise.all([
      router!.navigate("fast", { id }, { replace: true }),
      rendered,
    ]).then(() => {});
  }

  async function tick() {
    const index = pairIndex++;
    const slowId = `slow-${index}-${nextSegment()}`;
    const fastId = `fast-${index}-${nextSegment()}`;

    // Start the slow navigation — hangs in canActivate.
    const slowSettlement = router!
      .navigate("slow", { id: slowId }, { replace: true })
      .then(() => "fulfilled" as const)
      .catch(() => "cancelled" as const);

    await waitForSlow(slowId);

    // Fast navigation interrupts the slow one (core aborts the pending nav).
    await navigateFast(fastId);

    // Release the slow guard — lands after cancellation, ignored.
    module_!.slowLoaderControls.resolve(slowId);

    await slowSettlement;
    await drainMicrotasks();
  }

  function after() {
    module_?.slowLoaderControls.resolveAll();
    unmount?.();
    container?.remove();
    unsubscribe();
  }

  return { before, tick, after };
}

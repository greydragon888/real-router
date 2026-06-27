import type { NavigateOptions } from "@tanstack/router-core";

interface SlowControls {
  has: (id: string) => boolean;
  resolve: (id: string) => void;
  resolveAll: () => void;
}

interface AppModule {
  mountTestApp: (container: Element) => {
    router: {
      subscribe: (event: string, cb: () => void) => () => void;
      navigate: (opts: NavigateOptions) => Promise<void>;
      load: () => Promise<void>;
    };
    unmount: () => void;
  };
  slowLoaderControls: SlowControls;
}

let module_: AppModule | undefined;

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

/** interrupted-navigations — see real-router setup.ts for the shape rationale. */
export function setup(appModulePath = "./dist/app.mjs") {
  let container: HTMLDivElement | undefined;
  let router: ReturnType<AppModule["mountTestApp"]>["router"] | undefined;
  let unmount: (() => void) | undefined;
  let unsub = () => {};
  let resolveRendered: () => void = () => {};

  async function before() {
    module_ ??= (await import(appModulePath)) as AppModule;

    container = document.createElement("div");
    document.body.append(container);

    const mounted = module_.mountTestApp(container);

    router = mounted.router;
    unmount = mounted.unmount;
    unsub = router.subscribe("onRendered", () => {
      resolveRendered();
    });

    await router.load();

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
      router!.navigate({ to: "/fast/$id", params: { id }, replace: true }),
      rendered,
    ]).then(() => {});
  }

  async function tick() {
    const index = pairIndex++;
    const slowId = `slow-${index}-${nextSegment()}`;
    const fastId = `fast-${index}-${nextSegment()}`;

    const slowSettlement = router!
      .navigate({ to: "/slow/$id", params: { id: slowId }, replace: true })
      .then(() => "fulfilled" as const)
      .catch(() => "cancelled" as const);

    await waitForSlow(slowId);

    await navigateFast(fastId);

    module_!.slowLoaderControls.resolve(slowId);

    await slowSettlement;
    await drainMicrotasks();
  }

  function after() {
    module_?.slowLoaderControls.resolveAll();
    unmount?.();
    container?.remove();
    unsub();
  }

  return { before, tick, after };
}

import type { NavigateOptions } from "@tanstack/router-core";

interface MountResult {
  router: {
    subscribe: (event: string, cb: () => void) => () => void;
    navigate: (opts: NavigateOptions) => Promise<void>;
    load: () => Promise<void>;
  };
  unmount: () => void;
}

let mountTestApp: ((container: Element) => MountResult) | undefined;

/** navigation-churn — see real-router setup.ts for the shape rationale. */
export function setup(appModulePath = "./dist/app.mjs") {
  let container: HTMLDivElement | undefined;
  let router: MountResult["router"] | undefined;
  let unmount: (() => void) | undefined;
  let unsub = () => {};
  let resolveRendered: () => void = () => {};
  let toB = true;

  async function before() {
    mountTestApp ??= (
      (await import(appModulePath)) as {
        mountTestApp: NonNullable<typeof mountTestApp>;
      }
    ).mountTestApp;

    container = document.createElement("div");
    document.body.append(container);

    const mounted = mountTestApp(container);

    router = mounted.router;
    unmount = mounted.unmount;
    unsub = router.subscribe("onRendered", () => {
      resolveRendered();
    });

    await router.load();

    toB = true;
  }

  function tick() {
    const rendered = new Promise<void>((resolve) => {
      resolveRendered = () => {
        queueMicrotask(resolve);
      };
    });

    const nav = router!.navigate({ to: toB ? "/b" : "/a", replace: true });

    toB = !toB;

    // One navigation in flight per tick (TanStack memory-bench convention).
    return Promise.all([nav, rendered]).then(() => {});
  }

  function after() {
    unmount?.();
    container?.remove();
    unsub();
  }

  return { before, tick, after };
}

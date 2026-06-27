import type { NavigateOptions } from "@tanstack/router-core";

interface MountResult {
  router: {
    subscribe: (event: string, cb: () => void) => () => void;
    navigate: (opts: NavigateOptions) => Promise<void>;
    load: () => Promise<void>;
  };
  unmount: () => void;
}

let module_: { mountTestApp: (container: Element) => MountResult } | undefined;

let counter = 0;
let lcg = 0x10_ad_e7_a0;

function nextSegment() {
  lcg = (lcg * 1_664_525 + 1_013_904_223) >>> 0;

  return lcg.toString(36);
}

/** loader-data-retention — see real-router setup.ts for the shape rationale. */
export function setup(appModulePath = "./dist/app.mjs") {
  let container: HTMLDivElement | undefined;
  let router: MountResult["router"] | undefined;
  let unmount: (() => void) | undefined;
  let unsub = () => {};
  let resolveRendered: () => void = () => {};

  async function before() {
    module_ ??= (await import(appModulePath)) as NonNullable<typeof module_>;

    container = document.createElement("div");
    document.body.append(container);

    const mounted = module_.mountTestApp(container);

    router = mounted.router;
    unmount = mounted.unmount;
    unsub = router.subscribe("onRendered", () => {
      resolveRendered();
    });

    await router.load();

    counter = 0;
  }

  function tick() {
    const rendered = new Promise<void>((resolve) => {
      resolveRendered = () => {
        queueMicrotask(resolve);
      };
    });

    counter += 1;
    const id = `${counter}-${nextSegment()}`;

    const nav = router!.navigate({
      to: "/page/$id",
      params: { id },
      replace: true,
    });

    return Promise.all([nav, rendered]).then(() => {});
  }

  function after() {
    unmount?.();
    container?.remove();
    unsub();
  }

  return { before, tick, after };
}

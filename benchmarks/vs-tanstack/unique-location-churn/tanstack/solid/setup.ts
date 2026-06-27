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

let locationCounter = 0;
let lcg = 0xde_ca_fb_ad;

function nextSegment() {
  lcg = (lcg * 1_664_525 + 1_013_904_223) >>> 0;

  return lcg.toString(36);
}

/** unique-location-churn — see real-router setup.ts for the shape rationale. */
export function setup(appModulePath = "./dist/app.mjs") {
  let container: HTMLDivElement | undefined;
  let router: MountResult["router"] | undefined;
  let unmount: (() => void) | undefined;
  let unsub = () => {};
  let resolveRendered: () => void = () => {};

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
  }

  function tick() {
    const rendered = new Promise<void>((resolve) => {
      resolveRendered = () => {
        queueMicrotask(resolve);
      };
    });

    locationCounter += 1;
    const id = `${locationCounter}-${nextSegment()}`;
    const q = nextSegment();

    const nav = router!.navigate({
      to: "/items/$id",
      params: { id },
      search: { q },
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

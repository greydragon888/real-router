import type { Router } from "@real-router/core";

interface MountResult {
  router: Router;
  unmount: () => void;
}

let mountTestApp:
  | ((container: HTMLElement, startPath?: string) => Promise<MountResult>)
  | undefined;

// Module-level so ids/queries never repeat across runner invocations on one
// mount — a repeated URL would hit the match cache and mask a leak.
let locationCounter = 0;
let lcg = 0xde_ca_fb_ad;

function nextSegment() {
  lcg = (lcg * 1_664_525 + 1_013_904_223) >>> 0;

  return lcg.toString(36);
}

/**
 * unique-location-churn: navigate to `/items/:id?q` with a never-repeated id +
 * query each tick. Detects unbounded growth of match/history caches keyed by
 * href/params (a flat heap floor means caches are bounded).
 */
export function setup(appModulePath = "./dist/app.mjs") {
  let container: HTMLDivElement | undefined;
  let router: Router | undefined;
  let dispose: (() => void) | undefined;
  let unsubscribe = () => {};
  let resolveRendered: () => void = () => {};

  async function before() {
    mountTestApp ??= (
      (await import(appModulePath)) as {
        mountTestApp: NonNullable<typeof mountTestApp>;
      }
    ).mountTestApp;

    container = document.createElement("div");
    document.body.append(container);

    const mounted = await mountTestApp(container, "/items/0");

    router = mounted.router;
    unsubscribe = router.subscribe(() => {
      resolveRendered();
    });

    dispose = () => {
      mounted.unmount();
      router!.dispose();
    };
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

    return Promise.all([
      router!.navigate("items", { id, q }, { replace: true }),
      rendered,
    ]).then(() => {});
  }

  function after() {
    dispose?.();
    container?.remove();
    unsubscribe();
  }

  return { before, tick, after };
}

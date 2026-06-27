import type { Router } from "@real-router/core";

interface MountResult {
  router: Router;
  unmount: () => void;
}

let module_:
  | {
      mountTestApp: (
        container: HTMLElement,
        startPath?: string,
      ) => Promise<MountResult>;
    }
  | undefined;

// Module-level so page ids never repeat across runner invocations.
let counter = 0;
let lcg = 0x10_ad_e7_a0;

function nextSegment() {
  lcg = (lcg * 1_664_525 + 1_013_904_223) >>> 0;

  return lcg.toString(36);
}

/**
 * loader-data-retention: navigate to a never-repeated `/page/:id` each tick; a
 * plugin writes a large payload into that state's context. Detects that the
 * departed route's context payload is reclaimed (flat heap floor), not pinned.
 */
export function setup(appModulePath = "./dist/app.mjs") {
  let container: HTMLDivElement | undefined;
  let router: Router | undefined;
  let dispose: (() => void) | undefined;
  let unsubscribe = () => {};
  let resolveRendered: () => void = () => {};

  async function before() {
    module_ ??= (await import(appModulePath)) as NonNullable<typeof module_>;

    container = document.createElement("div");
    document.body.append(container);

    const mounted = await module_.mountTestApp(container, "/");

    router = mounted.router;
    unsubscribe = router.subscribe(() => {
      resolveRendered();
    });

    dispose = () => {
      mounted.unmount();
      router!.dispose();
    };

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

    return Promise.all([
      router!.navigate("page", { id }, { replace: true }),
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

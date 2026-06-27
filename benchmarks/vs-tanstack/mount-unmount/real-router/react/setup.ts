import type { Router } from "@real-router/core";

interface MountResult {
  router: Router;
  unmount: () => void;
}

let mountTestApp:
  | ((container: HTMLElement, startPath?: string) => Promise<MountResult>)
  | undefined;

async function drainMicrotasks() {
  for (let index = 0; index < 5; index++) {
    await Promise.resolve();
  }
}

// Wait for React to COMMIT the initial render before tearing down. createRoot's
// render is async; unmounting before commit leaves useSyncExternalStore
// subscribe/cleanup half-run and the router transiently uncollectable — a
// benchmark-harness race, not a router leak (TanStack's setup waits onRendered).
async function waitForRender(container: HTMLElement) {
  for (let index = 0; index < 30; index++) {
    if (container.childNodes.length > 0) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 1);
    });
  }
}

/**
 * mount-unmount: full create → start → mount → dispose lifecycle each tick.
 * Detects router/adapter instances not collectable after dispose (a flat heap
 * floor means each cycle is fully reclaimed).
 */
export function setup(appModulePath = "./dist/app.mjs") {
  async function before() {
    mountTestApp ??= (
      (await import(appModulePath)) as {
        mountTestApp: NonNullable<typeof mountTestApp>;
      }
    ).mountTestApp;
  }

  async function tick() {
    const container = document.createElement("div");

    document.body.append(container);

    const mounted = await mountTestApp!(container, "/a");

    // Wait for the initial React commit before tearing down (see waitForRender).
    await waitForRender(container);

    mounted.unmount();
    mounted.router.dispose();
    container.remove();

    await drainMicrotasks();
  }

  function after() {
    // Each tick fully owns its mount/unmount lifecycle; nothing to tear down.
  }

  return { before, tick, after };
}

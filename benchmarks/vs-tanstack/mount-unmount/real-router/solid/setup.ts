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

// Confirm the initial render committed DOM before tearing down. Solid's render()
// is synchronous, so this normally returns on the first check; retained as a
// defensive guard and for structural parity with the React harness, whose
// createRoot commit is async (TanStack's setup waits onRendered instead).
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

    // Wait for the initial render commit before tearing down (see waitForRender).
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

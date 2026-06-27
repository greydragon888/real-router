interface MountResult {
  router: {
    load: () => Promise<void>;
    subscribe: (event: string, cb: () => void) => () => void;
  };
  unmount: () => void;
}

let mountTestApp: ((container: Element) => MountResult) | undefined;

async function drainMicrotasks() {
  for (let index = 0; index < 5; index++) {
    await Promise.resolve();
  }
}

/** mount-unmount — see real-router setup.ts for the shape rationale. */
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

    const mounted = mountTestApp!(container);

    const rendered = new Promise<void>((resolve) => {
      const unsub = mounted.router.subscribe("onRendered", () => {
        unsub();
        resolve();
      });
    });

    await mounted.router.load();
    await rendered;

    mounted.unmount();
    container.remove();

    await drainMicrotasks();
  }

  function after() {
    // Each tick fully owns its mount/unmount lifecycle; nothing to tear down.
  }

  return { before, tick, after };
}

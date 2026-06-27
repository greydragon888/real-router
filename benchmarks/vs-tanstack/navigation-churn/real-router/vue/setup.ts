import type { Router } from "@real-router/core";

interface MountResult {
  router: Router;
  unmount: () => void;
}

let mountTestApp:
  | ((container: HTMLElement, startPath?: string) => Promise<MountResult>)
  | undefined;

/**
 * navigation-churn: alternate `navigate("b")` / `navigate("a")` at steady state
 * with `replace: true`, awaiting the render signal each tick. Detects
 * per-navigation retention (a flat heap floor means no leak).
 */
export function setup(appModulePath = "./dist/app.mjs") {
  let container: HTMLDivElement | undefined;
  let router: Router | undefined;
  let dispose: (() => void) | undefined;
  let unsubscribe = () => {};
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

    const mounted = await mountTestApp(container, "/a");

    router = mounted.router;
    unsubscribe = router.subscribe(() => {
      resolveRendered();
    });

    dispose = () => {
      mounted.unmount();
      router!.dispose();
    };

    toB = true;
  }

  function tick() {
    const rendered = new Promise<void>((resolve) => {
      resolveRendered = () => {
        queueMicrotask(resolve);
      };
    });

    const target = toB ? "b" : "a";

    toB = !toB;

    // One navigation in flight per tick (TanStack memory-bench convention).
    return Promise.all([
      router!.navigate(target, {}, { replace: true }),
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

import { getRequiredLink, waitForRequiredLink } from "../setup-helpers";

import type { Router } from "@real-router/core";

interface MountResult {
  router: Router;
  unmount: () => void;
}

export function createSetup(appModulePath: string) {
  let mountTestApp: (container: HTMLElement) => MountResult;

  return function setup() {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "client-nav benchmark is running without NODE_ENV=production; framework dev overhead will dominate results.",
      );
    }

    let container: HTMLDivElement | undefined;
    let dispose: (() => void) | undefined;
    let unsubscribe = () => {};
    let stepIndex = 0;
    let next: () => Promise<void> = () =>
      Promise.reject("Test not initialized");

    async function before() {
      if (!mountTestApp) {
        mountTestApp = (
          (await import(appModulePath)) as { mountTestApp: typeof mountTestApp }
        ).mountTestApp;
      }

      stepIndex = 0;
      container = document.createElement("div");
      document.body.append(container);

      const { router, unmount } = mountTestApp(container);

      await router.start("/items/5");

      let resolveRendered: () => void = () => {};

      unsubscribe = router.subscribe(() => {
        resolveRendered();
      });

      dispose = () => {
        unmount();
        router.dispose();
      };

      const navigate = (
        name: string,
        params: Record<string, string | number>,
        options?: { replace?: boolean },
      ) =>
        new Promise<void>((resolveNext) => {
          resolveRendered = () => {
            queueMicrotask(resolveNext);
          };
          void router.navigate(name, params, options);
        });

      const click = (testId: string, cache?: Map<string, HTMLAnchorElement>) =>
        new Promise<void>((resolveNext) => {
          resolveRendered = () => {
            queueMicrotask(resolveNext);
          };
          getRequiredLink(container!, testId, cache).dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              button: 0,
            }),
          );
        });

      const cachedLinks = new Map<string, HTMLAnchorElement>();

      for (const testId of [
        "go-items-1",
        "go-items-2",
        "go-search",
        "go-ctx",
      ]) {
        await waitForRequiredLink(container, testId, cachedLinks);
      }

      const steps = [
        () => click("go-items-1", cachedLinks),
        () => click("items-details"),
        () => navigate("items.details", { id: 2 }, { replace: true }),
        () => click("items-parent"),
        () => click("go-search", cachedLinks),
        () => click("search-next-page"),
        () => navigate("search", { page: 1, filter: "all" }, { replace: true }),
        () => click("go-ctx", cachedLinks),
        () => navigate("ctx", { id: 2 }, { replace: true }),
        () => click("go-items-2", cachedLinks),
      ] as const;

      next = () => {
        const step = steps[stepIndex % steps.length];

        stepIndex += 1;

        return step();
      };
    }

    function after() {
      dispose?.();
      container?.remove();
      unsubscribe();
    }

    function tick() {
      return next();
    }

    return { before, tick, after };
  };
}

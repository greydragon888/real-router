import { createRouter } from "@real-router/core";
import { describe, it, expect } from "vitest";

import { memoryPluginFactory } from "@real-router/memory-plugin";

import type { Route, Router } from "@real-router/core";

/**
 * #1803 — a `back()` / `forward()` / `go(n)` whose restore never starts must
 * leave the plugin's bookkeeping exactly where a router that never made the
 * call would have it. `#index` is the truncation point for the next push, so
 * a stale one does not merely misreport: it deletes a page.
 *
 * Every cell runs the SAME script and differs only in which refusal it drives,
 * so the control is the assertion — no hand-written expectation to keep true.
 */

interface MemoryRouter extends Router {
  back: () => void;
  forward: () => void;
  go: (delta: number) => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
}

interface Surface {
  canGoBack: boolean;
  canGoForward: boolean;
  walk: string[];
}

function settle(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function plainRoutes(): Route[] {
  return [
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
    { name: "c", path: "/c" },
    { name: "d", path: "/d" },
  ];
}

/**
 * Seeds `a → b → c → d`, runs the cell's refusal around a `b` navigation,
 * pushes `c`, and reports what history looks like from the outside.
 */
async function measure(
  routes: Route[],
  drive: (router: MemoryRouter) => Promise<void>,
): Promise<Surface> {
  const router = createRouter(routes, { defaultRoute: "a" }) as MemoryRouter;
  const off = router.usePlugin(memoryPluginFactory());

  await router.start("/a");
  await router.navigate("b");
  await router.navigate("c");
  await router.navigate("d");

  await drive(router);

  await router.navigate("c");

  const walk: string[] = [];

  for (let step = 0; step < 4; step++) {
    router.back();
    await settle();
    walk.push(router.getState()!.path);
  }

  const surface: Surface = {
    canGoBack: router.canGoBack(),
    canGoForward: router.canGoForward(),
    walk,
  };

  router.stop();
  off();

  return surface;
}

/** The navigation every cell performs; the refusals happen around it. */
async function navigateToB(router: MemoryRouter): Promise<void> {
  await router.navigate("b");
}

/** Fires `call` from a subscribe listener, where the facade refuses it synchronously. */
function refusedForReentrancy(
  call: (router: MemoryRouter) => void,
): (router: MemoryRouter) => Promise<void> {
  return async (router) => {
    let refused = false;
    const unsub = router.subscribe(() => {
      try {
        call(router);
      } catch {
        refused = true;
      }
    });

    await navigateToB(router);
    unsub();

    expect(refused).toBe(true);
  };
}

/** Routes whose `/d` guard refuses the one visit the cell arms it for. */
function armedGuardCell(): {
  routes: Route[];
  drive: (router: MemoryRouter) => Promise<void>;
} {
  let armed = false;

  return {
    routes: [
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
      { name: "c", path: "/c" },
      {
        name: "d",
        path: "/d",
        canActivate: () => async () => {
          await Promise.resolve();

          if (!armed) {
            return true;
          }

          armed = false;

          return false;
        },
      },
    ],
    drive: async (router) => {
      await navigateToB(router);
      armed = true;
      router.back();
      await settle();

      expect(router.getState()!.path).toBe("/b");
    },
  };
}

const CELLS: {
  readonly name: string;
  readonly cell: () => {
    routes: Route[];
    drive: (router: MemoryRouter) => Promise<void>;
  };
}[] = [
  {
    name: "back() refused for reentrancy",
    cell: () => ({
      routes: plainRoutes(),
      drive: refusedForReentrancy((router) => {
        router.back();
      }),
    }),
  },
  {
    name: "go(-2) refused for reentrancy",
    cell: () => ({
      routes: plainRoutes(),
      drive: refusedForReentrancy((router) => {
        router.go(-2);
      }),
    }),
  },
  {
    name: "back() blocked by an async canActivate",
    cell: armedGuardCell,
  },
  {
    name: "go(-99) out of range",
    cell: () => ({
      routes: plainRoutes(),
      drive: async (router) => {
        router.go(-99);
        await navigateToB(router);
      },
    }),
  },
];

describe("memory-plugin — a refused history call unwinds its bookkeeping (#1803)", () => {
  it.each(CELLS)(
    "$name leaves history where a router that never made the call has it",
    async ({ cell }) => {
      const control = await measure(plainRoutes(), navigateToB);
      const { routes, drive } = cell();
      const observed = await measure(routes, drive);

      expect(observed).toStrictEqual(control);
    },
  );
});

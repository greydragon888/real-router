import { describe, expect, it } from "vitest";

import { constants, createRouter, errorCodes } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Route } from "@real-router/core";

/**
 * A root moved inside the boot window is reported, not papered over (#1752 gap D).
 *
 * `start()` matches the path BEFORE `completeStart()` opens the window in which a
 * plugin's `onStart` runs, so a `setRootPath` there lands after the match. The
 * boot then committed the pre-move state: `home @ /home`, a state naming a real
 * route whose `path` the router no longer routes anywhere — and it announced it
 * as a healthy `TRANSITION_SUCCESS`.
 *
 * ⚑ **Degrade, not gate — #1750's rule, applied faithfully.** That decision says
 * the mutation the application asked for applies and the boot reports the
 * consequence through the channel the caller already handles. The move applies
 * here too; what was missing was the report. Re-deriving what the boot is about
 * to announce is what produces one: under `allowNotFound` the consequence is the
 * router's own not-found state, and without it the same `ROUTE_NOT_FOUND` the
 * pre-window gate already raises for a path that routes nowhere.
 *
 * ⚠ **Refusing the call was the other option and it is not taken.** #1750 owns
 * the neighbouring window and chose degrade; gating here would split the
 * philosophy across two doors in one layer. It would also be a gate for nobody:
 * no shipped plugin sets its root from `onStart` — `persistent-params-plugin`,
 * the only consumer, sets it from the factory body at `usePlugin()` time, which
 * runs before `start()` and is unaffected by any of this.
 */
const ROUTES: readonly Route[] = [{ name: "home", path: "/home" }];

const bootWithRootMove = (
  allowNotFound: boolean,
  startAt: string,
): { router: ReturnType<typeof createRouter>; started: Promise<unknown> } => {
  const router = createRouter([...ROUTES], { allowNotFound });

  router.usePlugin(() => ({
    onStart: () => {
      getPluginApi(router).setRootPath("/app");
    },
  }));

  return { router, started: router.start(startAt) };
};

describe("a root moved in the boot window (#1752)", () => {
  it("degrades to not-found instead of announcing a state that routes nowhere", async () => {
    const { router, started } = bootWithRootMove(true, "/home");

    await started;

    const state = router.getState();

    expect(state?.name).toBe(constants.UNKNOWN_ROUTE);
    // The move applied — that is the half #1750 keeps.
    expect(getPluginApi(router).getRootPath()).toBe("/app");
    expect(router.buildPath("home")).toBe("/app/home");

    router.dispose();
  });

  it("without allowNotFound it fails, with the code the pre-window gate uses", async () => {
    const { router, started } = bootWithRootMove(false, "/home");

    await expect(started).rejects.toMatchObject({
      code: errorCodes.ROUTE_NOT_FOUND,
    });

    router.dispose();
  });

  it("CONTROL — a boot window that does NOT move the root is untouched", async () => {
    const router = createRouter([...ROUTES], { allowNotFound: true });
    let ran = false;

    router.usePlugin(() => ({
      onStart: () => {
        ran = true;
      },
    }));

    await router.start("/home");

    expect(ran).toBe(true);
    expect(router.getState()?.name).toBe("home");
    expect(router.getState()?.path).toBe("/home");

    router.dispose();
  });

  it("CONTROL — a root set BEFORE start is the supported path, and still works", async () => {
    // Where `persistent-params-plugin` actually sets it. If this reds, the fix
    // has moved the cost onto the only shipped consumer.
    const router = createRouter([...ROUTES], { allowNotFound: true });

    getPluginApi(router).setRootPath("/app");

    await router.start("/app/home");

    expect(router.getState()?.name).toBe("home");
    expect(router.getState()?.path).toBe("/app/home");

    router.dispose();
  });
});

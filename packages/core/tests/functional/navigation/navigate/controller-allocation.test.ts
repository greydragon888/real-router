import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import type { Router } from "@real-router/core";

/**
 * WHO pays for an `AbortController`, pinned by counting them.
 *
 * A navigation is *suspendable* (an external `signal`, a pre-commit plugin
 * listener, or a `subscribeLeave` listener) on an axis that does NOT coincide
 * with "needs a controller": only the last of those three has anything to hand a
 * signal to. That asymmetry is why Step 1b of the two-pipelines RFC (#1588)
 * refused to fold `#handleNoGuardsLeave` into the guard machinery — the fold was
 * behaviourally correct and cost a controller on the other two arcs.
 *
 * That decision was held by a benchmark arc alone, and the benchmark gate is
 * paused (#984): allocating a controller unconditionally in
 * `#handleNoGuardsLeave` left the whole suite green (measured, 3836/3836). These
 * tests are the missing gate — they fail on exactly that edit, so a refactor
 * that moves controller ownership cannot silently re-introduce the cost.
 */

const RealAbortController = AbortController;

let created: number;

class CountingAbortController extends RealAbortController {
  constructor() {
    super();
    created++;
  }
}

function makeRouter(): Router {
  return createRouter([
    { name: "home", path: "/" },
    { name: "page", path: "/page" },
  ]);
}

describe("AbortController allocation is paid by the arcs that need a signal", () => {
  beforeEach(() => {
    created = 0;
    vi.stubGlobal("AbortController", CountingAbortController);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("an external signal makes the navigation suspendable WITHOUT allocating one", async () => {
    const router = makeRouter();

    await router.start("/");

    // The caller supplied the signal — there is nothing for core to create.
    const external = new RealAbortController();

    created = 0;

    await router.navigate("page", {}, undefined, { signal: external.signal });

    expect(router.getState()?.name).toBe("page");
    expect(created).toBe(0);
  });

  it("a pre-commit listener makes it suspendable WITHOUT allocating one", async () => {
    const router = makeRouter();

    router.usePlugin(() => ({
      onTransitionStart() {
        /* the listener window is what makes this suspendable */
      },
    }));

    await router.start("/");
    created = 0;

    await router.navigate("page");

    expect(router.getState()?.name).toBe("page");
    expect(created).toBe(0);
  });

  it("positive control: a leave listener DOES get one — it receives the signal", async () => {
    const router = makeRouter();

    let seen: AbortSignal | undefined;

    router.subscribeLeave(({ signal }) => {
      seen = signal;
    });

    await router.start("/");
    created = 0;

    await router.navigate("page");

    expect(created).toBe(1);
    expect(seen).toBeDefined();
    // Released without aborting on success (#722).
    expect(seen?.aborted).toBe(false);
  });

  it("positive control: a guard on the walked path DOES get one — guards receive the signal", async () => {
    const router = makeRouter();

    getLifecycleApi(router).addActivateGuard("page", () => () => true);

    await router.start("/");
    created = 0;

    await router.navigate("page");

    expect(created).toBe(1);
  });
});

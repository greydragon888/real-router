import { createRouter } from "@real-router/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDirectionTracker } from "../../../src/dom-utils";

import type { Router } from "@real-router/core";

/**
 * ⚑ A REAL router, not a `subscribeLeave`-shaped fake (#1924). The tracker
 * observes the transition lifecycle through `getPluginApi`, which resolves the
 * instance in core's internals registry, so a plain object is not a router as
 * far as this utility is concerned. The fake also could not produce the arc the
 * flag's lifetime turns on — a navigation core REFUSES.
 */
async function makeRouter(): Promise<Router> {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
  ]);

  await router.start("/");

  return router;
}

describe("createDirectionTracker", () => {
  afterEach(() => {
    delete document.documentElement.dataset.navDirection;
    vi.restoreAllMocks();
  });

  it("returns no-op when document is undefined (SSR)", async () => {
    const router = await makeRouter();
    const documentDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "document",
    );

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: undefined,
    });

    try {
      const tracker = createDirectionTracker(router);

      expect(tracker.destroy).toBeTypeOf("function");

      tracker.destroy();
    } finally {
      if (documentDescriptor) {
        Object.defineProperty(globalThis, "document", documentDescriptor);
      }
    }
  });

  it("sets baseline data-nav-direction='forward' on install", async () => {
    const router = await makeRouter();
    const tracker = createDirectionTracker(router);

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();
  });

  it("writes 'forward' on subscribeLeave when no popstate occurred", async () => {
    const router = await makeRouter();
    const tracker = createDirectionTracker(router);

    await router.navigate("about");

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();
  });

  it("writes 'back' after popstate, then resets to 'forward' on next leave", async () => {
    const router = await makeRouter();
    const tracker = createDirectionTracker(router);

    globalThis.dispatchEvent(new PopStateEvent("popstate"));
    await router.navigate("about");

    expect(document.documentElement.dataset.navDirection).toBe("back");

    await router.navigate("home");

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();
  });

  it("destroy() removes popstate listener and clears dataset attribute", async () => {
    const router = await makeRouter();
    const tracker = createDirectionTracker(router);

    tracker.destroy();

    expect(document.documentElement.dataset.navDirection).toBeUndefined();

    // After destroy, popstate should not affect anything.
    globalThis.dispatchEvent(new PopStateEvent("popstate"));
    await router.navigate("about");

    // Dataset stays undefined because subscribeLeave was unsubscribed.
    expect(document.documentElement.dataset.navDirection).toBeUndefined();
  });
});

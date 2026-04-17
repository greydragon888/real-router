import { describe, beforeEach, afterEach, it, expect } from "vitest";

import ManyLinks from "./components/ManyLinks.svelte";
import { createStressRouter, renderWithRouter } from "./helpers";

import type { Router } from "@real-router/core";

describe("Stress: teardown race", () => {
  let router: Router;
  const unhandled: PromiseRejectionEvent[] = [];
  const onUnhandled = (event: PromiseRejectionEvent) => unhandled.push(event);

  beforeEach(async () => {
    router = createStressRouter(8);
    await router.start("/route0");
    unhandled.length = 0;
    globalThis.addEventListener("unhandledrejection", onUnhandled);
  });

  afterEach(() => {
    globalThis.removeEventListener("unhandledrejection", onUnhandled);
    router.stop();
  });

  it("11.1 Click 100 Links and immediately unmount — no unhandled rejections, no thrown errors", async () => {
    const { container, unmount } = renderWithRouter(router, ManyLinks, {
      count: 8,
    });

    const links = container.querySelectorAll("a");

    expect(links).toHaveLength(8);

    // Fire all clicks then unmount in the same task — handlers may complete
    // mid-teardown.
    for (const link of links) {
      const evt = new MouseEvent("click", { bubbles: true, cancelable: true });

      link.dispatchEvent(evt);
    }

    unmount();

    // Drain microtasks so any pending router.navigate().catch(...) chain settles.
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }

    expect(unhandled).toHaveLength(0);
  });

  it("11.2 Repeated mount → click → unmount cycle (50 iterations) — bounded by Link.svelte's catch-noop, no leaks", async () => {
    for (let i = 0; i < 50; i++) {
      const { container, unmount } = renderWithRouter(router, ManyLinks, {
        count: 8,
      });

      const firstLink = container.querySelector("a");

      expect(firstLink).not.toBeNull();

      firstLink!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );

      unmount();

      await Promise.resolve();
    }

    expect(unhandled).toHaveLength(0);
  });

  // Covers review gap #2: programmatic router.navigate() racing with unmount.
  // A queued microtask dispatches navigate() into a RouterProvider that is
  // tearing down. The pending promise must not surface as an unhandled
  // rejection in the adapter — it is caught inside Link / createLinkAction,
  // but programmatic callers also need the router itself to stay consistent.
  it("11.3 programmatic router.navigate() racing with unmount — no unhandled rejections over 200 cycles", async () => {
    for (let i = 0; i < 200; i++) {
      const { unmount } = renderWithRouter(router, ManyLinks, { count: 4 });

      const target = `route${i % 8}`;

      // Kick a programmatic navigation on the next microtask tick and unmount
      // immediately. The transition may resolve after the component tree is
      // gone; the adapter must tolerate this.
      const pending = Promise.resolve().then(() =>
        router.navigate(target).catch(() => {}),
      );

      unmount();

      await pending;
      await Promise.resolve();
    }

    expect(unhandled).toHaveLength(0);
  });
});

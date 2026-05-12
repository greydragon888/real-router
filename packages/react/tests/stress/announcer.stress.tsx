import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RouterProvider } from "@real-router/react";

import { createStressRouter } from "./helpers";

const ANNOUNCER_SEL = "[data-real-router-announcer]";

/**
 * R9 — `announceNavigation` toggle stress.
 *
 * Mounts and unmounts RouterProvider with `announceNavigation` flipping on
 * and off many times. The shared `[data-real-router-announcer]` element is
 * a singleton in `document.body` (per `getOrCreateAnnouncer`), so a sloppy
 * effect cleanup would either leave orphans behind or duplicate the node.
 */
describe("R9 — announceNavigation toggle stress", () => {
  afterEach(() => {
    cleanup();
    document.querySelector(ANNOUNCER_SEL)?.remove();
  });

  it("9.1: 100 toggle on/off cycles — exactly zero or one announcer node at all times", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    for (let i = 0; i < 100; i++) {
      const { unmount } = render(
        <RouterProvider router={router} announceNavigation>
          <div />
        </RouterProvider>,
      );

      expect(document.querySelectorAll(ANNOUNCER_SEL)).toHaveLength(1);

      unmount();

      expect(document.querySelectorAll(ANNOUNCER_SEL)).toHaveLength(0);
    }

    router.stop();
  });

  it("9.2: 50 prop-flip cycles on a stable RouterProvider — no orphan nodes", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const { rerender, unmount } = render(
      <RouterProvider router={router} announceNavigation={false}>
        <div />
      </RouterProvider>,
    );

    expect(document.querySelectorAll(ANNOUNCER_SEL)).toHaveLength(0);

    for (let i = 0; i < 50; i++) {
      rerender(
        <RouterProvider router={router} announceNavigation>
          <div />
        </RouterProvider>,
      );

      expect(document.querySelectorAll(ANNOUNCER_SEL)).toHaveLength(1);

      rerender(
        <RouterProvider router={router} announceNavigation={false}>
          <div />
        </RouterProvider>,
      );

      expect(document.querySelectorAll(ANNOUNCER_SEL)).toHaveLength(0);
    }

    unmount();
    router.stop();
  });

  it("9.3: 2 concurrent RouterProvider with announceNavigation — singleton element shared, cleanup safe", async () => {
    const routerA = createStressRouter(3);
    const routerB = createStressRouter(3);

    await routerA.start("/route0");
    await routerB.start("/route1");

    const a = render(
      <RouterProvider router={routerA} announceNavigation>
        <div data-testid="a" />
      </RouterProvider>,
    );

    const b = render(
      <RouterProvider router={routerB} announceNavigation>
        <div data-testid="b" />
      </RouterProvider>,
    );

    // Both providers attach their own subscription, but the announcer DOM
    // node is a singleton selected by attribute. Two simultaneous providers
    // must NOT produce two `[data-real-router-announcer]` elements.
    expect(document.querySelectorAll(ANNOUNCER_SEL)).toHaveLength(1);

    a.unmount();

    // The first unmount removes the singleton element. The second provider
    // still subscribes but its element is gone — cleanup must not throw.
    b.unmount();

    expect(document.querySelectorAll(ANNOUNCER_SEL)).toHaveLength(0);

    routerA.stop();
    routerB.stop();
  });

  it("9.4: 200 rapid navigations through the announcer state machine — single node, clean teardown (#14)", async () => {
    // The announcer is a four-state machine: `lastAnnouncedText` +
    // `pendingText` + `safariTimeoutId` + double rAF. Rapid navigations
    // overlap announcement attempts; if the cleanup doesn't reset
    // pendingText / clearTimeout the Safari buffer, the announcer can
    // mutate the DOM after destroy() or leave a stale timer.
    const router = createStressRouter(10);

    await router.start("/route0");

    const { unmount } = render(
      <RouterProvider router={router} announceNavigation>
        <div data-testid="anchor" />
      </RouterProvider>,
    );

    expect(document.querySelectorAll(ANNOUNCER_SEL)).toHaveLength(1);

    // 200 navigations through a round-robin of 10 routes (some adjacent
    // pairs duplicate, exercising same-name and different-name paths).
    for (let i = 0; i < 200; i++) {
      await act(async () => {
        await router.navigate(`route${i % 10}`).catch(() => {});
      });
    }

    // Invariant: still exactly one announcer node — nothing duplicated
    // even after 200 transitions firing the subscribe callback.
    expect(document.querySelectorAll(ANNOUNCER_SEL)).toHaveLength(1);

    unmount();

    // Cleanup: announcer DOM gone; no further mutations possible.
    expect(document.querySelectorAll(ANNOUNCER_SEL)).toHaveLength(0);

    // Post-unmount navigations must not resurrect the announcer node.
    await act(async () => {
      await router.navigate("route1").catch(() => {});
    });

    expect(document.querySelectorAll(ANNOUNCER_SEL)).toHaveLength(0);

    router.stop();
  });
});

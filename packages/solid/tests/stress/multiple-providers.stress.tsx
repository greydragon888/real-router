import { errorCodes } from "@real-router/core";
import { render } from "@solidjs/testing-library";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { RouterProvider, useRoute } from "@real-router/solid";

import { createStressRouter, forceGC, MB, takeHeapSnapshot } from "./helpers";

import type { RouterError } from "@real-router/core";
import type { JSX } from "solid-js";

const swallowSameStates = (error: unknown): void => {
  if ((error as RouterError | undefined)?.code !== errorCodes.SAME_STATES) {
    throw error;
  }
};

/**
 * §7.2 audit scenario G18 — multiple `<RouterProvider>` mounted on the
 * same router instance (micro-frontend / federated-app pattern).
 *
 * Each `<RouterProvider>` mount creates a separate `createRouteSource`
 * subscription, a separate `routeSelector`, and a separate set of
 * `mountFeature` handles (announceNavigation / scrollRestoration /
 * viewTransitions). Multiplied across N providers, this would:
 *
 *   - Add N router.subscribe registrations (acceptable — each one is a
 *     legitimate `<RouterProvider>` lifetime).
 *   - Multiply opt-in feature side-effects: 2 announcers writing to one
 *     aria-live region, 2 scroll-restore listeners on window, 2 view-
 *     transitions handlers competing. **This is the gotcha.**
 *
 * The current adapter does NOT detect/dedupe nested or sibling provider
 * mounts on the same router. The tests below pin that behaviour so a
 * future "single-provider-per-router" guard surfaces as a test diff — and
 * so micro-frontend consumers can see the cost via a deterministic
 * regression-locked snapshot.
 */

function RouteProbe(props: { readonly id: string }): JSX.Element {
  const state = useRoute();

  return (
    <span data-id={props.id} data-name={state().route.name}>
      {state().route.name}
    </span>
  );
}

describe("MP1 — multiple RouterProvider on one router (§7.2 G18)", () => {
  let originalRAF: typeof globalThis.requestAnimationFrame;

  beforeEach(() => {
    originalRAF = globalThis.requestAnimationFrame;
    // Stub rAF so announcer/scroll handlers flush synchronously and the
    // tests don't race against jsdom's deferred microtasks.
    vi.stubGlobal("requestAnimationFrame", ((cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    }) as typeof globalThis.requestAnimationFrame);
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRAF;
    vi.unstubAllGlobals();
  });

  it("MP1.1: two sibling providers on same router → both subscribe (no dedupe)", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const subscribeSpy = vi.spyOn(router, "subscribe");

    render(() => (
      <>
        <RouterProvider router={router}>
          <RouteProbe id="A" />
        </RouterProvider>
        <RouterProvider router={router}>
          <RouteProbe id="B" />
        </RouterProvider>
      </>
    ));

    // RouterProvider's createRouteSource calls subscribe ONCE per mount.
    // Two providers → at least 2 subscriptions (may be more with internal
    // helper subscriptions; bound only the lower number to keep the test
    // robust against unrelated source-cache refactors).
    expect(subscribeSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

    subscribeSpy.mockRestore();
    router.stop();
  });

  it("MP1.2: both providers see the same route on navigation", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const { container } = render(() => (
      <>
        <RouterProvider router={router}>
          <RouteProbe id="A" />
        </RouterProvider>
        <RouterProvider router={router}>
          <RouteProbe id="B" />
        </RouterProvider>
      </>
    ));

    await router.navigate("route3");

    const probes = container.querySelectorAll("[data-id]");

    expect(probes).toHaveLength(2);

    // Both probes reflect the same active route — proves the route source
    // fans out correctly even though each provider has its own bridge.
    for (const probe of probes) {
      expect((probe as HTMLElement).dataset.name).toBe("route3");
    }

    router.stop();
  });

  it("MP1.3: announceNavigation on two providers → shared aria-live element via getOrCreateAnnouncer (documented dedupe)", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const subscribeSpy = vi.spyOn(router, "subscribe");

    render(() => (
      <>
        <RouterProvider router={router} announceNavigation>
          <RouteProbe id="A" />
        </RouterProvider>
        <RouterProvider router={router} announceNavigation>
          <RouteProbe id="B" />
        </RouterProvider>
      </>
    ));

    // The shared `createRouteAnnouncer` helper uses `getOrCreateAnnouncer`
    // which dedupes the aria-live DOM node across providers — only ONE
    // element ends up in the document, regardless of how many providers
    // enable announceNavigation. **But** each provider still adds its own
    // router.subscribe registration AND its own `textContent =` writer,
    // so screen-reader announcements may be doubled (race between the
    // two writers on the shared node). Pin both observations.
    const announcers = document.querySelectorAll(
      "[data-real-router-announcer]",
    );

    // Dedupe at the DOM level: at most one aria-live node.
    expect(announcers.length).toBeLessThanOrEqual(1);

    // But NOT at the subscription level: each provider subscribed
    // independently (this IS the duplication consumers see in screen-
    // reader output).
    expect(subscribeSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Cleanup announcer DOM so subsequent tests don't see leftovers.
    for (const element of announcers) {
      element.remove();
    }

    subscribeSpy.mockRestore();
    router.stop();
  });

  it("MP1.4: 50 mount/unmount cycles of two sibling providers — bounded heap", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const heapBefore = takeHeapSnapshot();
    const ITERATIONS = 50;

    for (let i = 0; i < ITERATIONS; i++) {
      const { unmount } = render(() => (
        <>
          <RouterProvider router={router}>
            <RouteProbe id="A" />
          </RouterProvider>
          <RouterProvider router={router}>
            <RouteProbe id="B" />
          </RouterProvider>
        </>
      ));

      // Alternate between two routes to guarantee cross-route navs
      // (no SAME_STATES rejections from staying on the same route).
      const target = `route${i % 2 === 0 ? 1 : 2}`;

      await router.navigate(target).catch(swallowSameStates);
      unmount();
    }

    forceGC();
    const heapAfter = takeHeapSnapshot();

    // Two providers per iteration × 50 iterations = 100 provider
    // lifetimes. Heap must not grow unboundedly — each cleanup releases
    // both subscriptions.
    expect(heapAfter - heapBefore).toBeLessThan(20 * MB);

    router.stop();
  }, 60_000);
});

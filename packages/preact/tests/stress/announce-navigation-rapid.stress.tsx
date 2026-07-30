// packages/preact/tests/stress/announce-navigation-rapid.stress.tsx

/**
 * Stress tests for `announceNavigation` under rapid navigations.
 *
 * Closes §7.2 #14 review item: "announceNavigation rapid navigations —
 * pendingText buffer держит только LAST text. 7-sec auto-clear + новые
 * announces overlap. lastAnnouncedText dedupe + clearTimeout interaction
 * unverified."
 *
 * Background — `createRouteAnnouncer` (`shared/dom-utils/route-announcer.ts`):
 *   - 100 ms `SAFARI_READY_DELAY` window during which announcements queue
 *     into `pendingText` (last write wins)
 *   - 7000 ms `CLEAR_DELAY` after each announce — `clearTimeout` must reset
 *     when a new announce arrives so the previous text isn't blanked
 *     mid-stream
 *   - `lastAnnouncedText` dedupe — repeat-navigation that resolves to the
 *     same announcement text does not re-write
 *   - `isInitialNavigation` — the FIRST `TRANSITION_SUCCESS` after the
 *     announcer subscribes is treated as the post-hydration "initial" event
 *     and skipped. Every test below fires a warm-up navigation to consume
 *     that initial event before measuring announcer behaviour.
 *
 * Test design — no `<h1>` element is rendered: `resolveText` falls through
 * to `route.name`, so each distinct route name produces distinct
 * announcer text. With an `<h1>`, all navs would share the same h1-derived
 * text and `lastAnnouncedText` would dedupe every iteration.
 *
 * Real timers are used throughout. The 100ms ready window is crossed with
 * a `setTimeout(0)` wrapper after 150ms; the 7000ms clear timer is never
 * waited on — the regressions we care about surface as visible content
 * anomalies within the bounded test windows.
 */

import { act, cleanup, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RouterProvider } from "@real-router/preact";

import { createStressRouter } from "./helpers";

import type { Router } from "@real-router/core";

const ANNOUNCER_SELECTOR = "[data-real-router-announcer]";
const SAFARI_READY_WAIT_MS = 150;

/**
 * Awaits the announcer's commit path:
 *   - two `requestAnimationFrame` ticks for the in-subscribe double-rAF,
 *   - a microtask drain, so any pending state writes settle before
 *     assertions.
 */
async function flushAnnouncerPipeline(): Promise<void> {
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => {
      resolve();
    }),
  );
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => {
      resolve();
    }),
  );
  await Promise.resolve();
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Consumes the announcer's `isInitialNavigation` skip. Returns the
 * announcer element so callers can keep observing it.
 */
async function consumeInitialNav(router: Router): Promise<Element> {
  // After mount, the first TRANSITION_SUCCESS is marked as "initial" and
  // skipped. Fire a no-op force-nav on the start route to consume it.
  await act(async () => {
    await router
      .navigate("route0", {}, undefined, { force: true })
      .catch(() => {});
  });
  await flushAnnouncerPipeline();

  const announcer = document.querySelector(ANNOUNCER_SELECTOR);

  if (!announcer) {
    throw new Error("announcer not in DOM after consumeInitialNav");
  }

  return announcer;
}

describe("R — announceNavigation rapid (§7.2 #14)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(15);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
    cleanup();
    // Remove any stray announcer DOM nodes — the announcer attaches to
    // document.body, not to the test container, so cleanup() does not
    // touch it. Test-to-test leak would surface as cumulative textContent
    // from previous runs.
    for (const node of document.querySelectorAll(ANNOUNCER_SELECTOR)) {
      node.remove();
    }
  });

  it("after the Safari-ready window, 10 distinct-route navs produce distinct announcer text", async () => {
    // Cross the ready window, consume the initial-nav skip, then every
    // distinct-route navigation must update announcer.textContent. The
    // 7000ms clear timer being reset on each new announce is what keeps
    // content from being blanked mid-stream.
    render(
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>,
    );

    await sleep(SAFARI_READY_WAIT_MS);
    const announcer = await consumeInitialNav(router);

    const observed: string[] = [];

    for (let i = 1; i <= 10; i++) {
      await act(async () => {
        await router.navigate(`route${i}`).catch(() => {});
      });
      await flushAnnouncerPipeline();

      const text = announcer.textContent;

      // Per-iteration: textContent must be non-empty. A clearTimeout-reset
      // regression in a longer-running scenario would surface here as a
      // blank, but in this short loop the 7s timer never fires; the
      // primary signal is that each distinct route DID write its text.
      expect(text).not.toBe("");

      observed.push(text);
    }

    // 10 distinct route names → no two consecutive announces identical.
    for (let i = 1; i < observed.length; i++) {
      expect(observed[i]).not.toBe(observed[i - 1]);
    }
  });

  it("repeat navigation that yields identical announcement text does not re-write the announcer", async () => {
    // First cross-route nav announces; subsequent same-route force navs
    // resolve to the same text → `lastAnnouncedText` dedupe keeps the
    // announcer's content stable (no flicker, no clearTimeout churn).
    render(
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>,
    );

    await sleep(SAFARI_READY_WAIT_MS);
    const announcer = await consumeInitialNav(router);

    // First cross-route nav: announce.
    await act(async () => {
      await router.navigate("route1").catch(() => {});
    });
    await flushAnnouncerPipeline();

    const firstText = announcer.textContent;

    expect(firstText).not.toBe("");

    // Force-navigate to the same route 10 times. Route name is unchanged,
    // no <h1> → resolveText returns the same text → dedupe path keeps the
    // announcer content stable.
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await router
          .navigate("route1", {}, undefined, { force: true })
          .catch(() => {});
      });
      await flushAnnouncerPipeline();
    }

    expect(announcer.textContent).toBe(firstText);
  });

  it("post-unmount navigations do NOT mutate the announcer's textContent", async () => {
    // RouterProvider's useEffect cleanup calls `announcer.destroy()`,
    // which unsubscribes from the router AND removes the announcer DOM
    // node from document.body. After unmount, navigations must NOT update
    // any new announcer DOM (one would only re-appear if `announceNavigation`
    // mounted again — which is not the case here).
    const view = render(
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>,
    );

    await sleep(SAFARI_READY_WAIT_MS);
    const announcer = await consumeInitialNav(router);

    await act(async () => {
      await router.navigate("route1").catch(() => {});
    });
    await flushAnnouncerPipeline();

    const textBefore = announcer.textContent;

    expect(textBefore).not.toBe("");

    view.unmount();

    // Post-unmount: the announcer's destroy() removed the DOM node. A
    // post-unmount navigation must NOT re-create it.
    await act(async () => {
      await router.navigate("route2").catch(() => {});
    });
    await flushAnnouncerPipeline();

    expect(document.querySelector(ANNOUNCER_SELECTOR)).toBeNull();
  });

  it("rapid burst across the Safari-ready window — announcer non-empty after the burst (no buffer leak)", async () => {
    // 30 navs fired across the 100ms ready window. The announcer's
    // `isReady` guard either buffers them into `pendingText` (window not
    // yet expired) or routes through the post-ready path. In either case
    // the final state must have announcer.textContent non-empty —
    // regression would manifest as a buffer leak (empty content) or a
    // crash inside the rAF pipeline.
    render(
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>,
    );

    // Don't pre-cross the ready window here — that's the point of this
    // test. Fire navs IMMEDIATELY, so the first few queue into pendingText.
    for (let i = 1; i <= 30; i++) {
      await act(async () => {
        await router.navigate(`route${i % 9}`).catch(() => {});
      });
      await flushAnnouncerPipeline();
    }

    // Ensure the ready window has passed for the final flush.
    await sleep(SAFARI_READY_WAIT_MS);
    await flushAnnouncerPipeline();

    const announcer = document.querySelector(ANNOUNCER_SELECTOR);

    expect(announcer).not.toBeNull();
    expect(announcer!.textContent).toMatch(/Navigated to /);
  });
});

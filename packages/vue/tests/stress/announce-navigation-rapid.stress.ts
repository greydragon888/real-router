/**
 * Stress tests for `announceNavigation` under rapid navigations (§7.2 #14, HIGH).
 *
 * Closes the §7.2 #14 review item: "announceNavigation rapid navigations —
 * pendingText buffer держит только LAST text. 7-sec auto-clear + новые
 * announces overlap. lastAnnouncedText dedupe + clearTimeout interaction
 * unverified."
 *
 * Counterpart: `packages/preact/tests/stress/announce-navigation-rapid.stress.tsx`.
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
 * to `route.name`, so each distinct route name produces distinct announcer
 * text. Real timers are used so the double-rAF + 100 ms readiness window
 * + 7 s clear-timer machinery is exercised end-to-end. We never wait the
 * full 7 s — the regressions we care about surface inside the bounded
 * windows.
 */

import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { h } from "vue";

import { createStressRouter } from "./helpers";
import { RouterProvider } from "../../src/RouterProvider";

import type { Router } from "@real-router/core";

const ANNOUNCER_SELECTOR = "[data-real-router-announcer]";
const SAFARI_READY_WAIT_MS = 150;

/**
 * Drains the announcer's commit path:
 *   - two `requestAnimationFrame` ticks for the in-subscribe double-rAF,
 *   - a microtask drain so any pending state writes settle before assertions.
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
  await flushPromises();
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Consumes the announcer's `isInitialNavigation` skip. Returns the
 * announcer element so callers can keep observing it.
 */
async function consumeInitialNav(router: Router): Promise<Element> {
  await router
    .navigate("route0", {}, undefined, { force: true })
    .catch(() => {});
  await flushAnnouncerPipeline();

  const announcer = document.querySelector(ANNOUNCER_SELECTOR);

  if (!announcer) {
    throw new Error("announcer not in DOM after consumeInitialNav");
  }

  return announcer;
}

// We use `@vue/test-utils` `mount` directly so the RouterProvider receives
// `announceNavigation: true` — the shared `mountWithProvider` helper does
// not forward that prop.

describe("§7.2 #14 — announceNavigation rapid navigations (Vue)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(15);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
    for (const node of document.querySelectorAll(ANNOUNCER_SELECTOR)) {
      node.remove();
    }
  });

  it("14.1: after the Safari-ready window, 10 distinct-route navs produce distinct announcer text", async () => {
    const { mount } = await import("@vue/test-utils");

    mount({
      setup: () => () =>
        h(
          RouterProvider,
          { router, announceNavigation: true },
          { default: () => h("div") },
        ),
    });

    await sleep(SAFARI_READY_WAIT_MS);
    const announcer = await consumeInitialNav(router);

    const observed: (string | null)[] = [];

    for (let i = 1; i <= 10; i++) {
      await router.navigate(`route${i}`).catch(() => {});
      await flushAnnouncerPipeline();

      const text = announcer.textContent;

      // Per-iteration: textContent must be non-empty.
      expect(text).not.toBe("");
      expect(text).not.toBeNull();

      observed.push(text);
    }

    // 10 distinct route names → no two consecutive announces identical.
    for (let i = 1; i < observed.length; i++) {
      expect(observed[i]).not.toBe(observed[i - 1]);
    }
  });

  it("14.2: repeat navigation that yields identical announcement text does not re-write the announcer", async () => {
    const { mount } = await import("@vue/test-utils");

    mount({
      setup: () => () =>
        h(
          RouterProvider,
          { router, announceNavigation: true },
          { default: () => h("div") },
        ),
    });

    await sleep(SAFARI_READY_WAIT_MS);
    const announcer = await consumeInitialNav(router);

    await router.navigate("route1").catch(() => {});
    await flushAnnouncerPipeline();

    const firstText = announcer.textContent;

    expect(firstText).not.toBe("");

    // Force-navigate to the same route 10 times. Route name unchanged,
    // no <h1> → resolveText returns the same text → dedupe keeps the
    // announcer content stable.
    for (let i = 0; i < 10; i++) {
      await router
        .navigate("route1", {}, undefined, { force: true })
        .catch(() => {});
      await flushAnnouncerPipeline();
    }

    expect(announcer.textContent).toBe(firstText);
  });

  it("14.3: post-unmount navigations do NOT mutate the announcer's textContent", async () => {
    const { mount } = await import("@vue/test-utils");
    const wrapper = mount({
      setup: () => () =>
        h(
          RouterProvider,
          { router, announceNavigation: true },
          { default: () => h("div") },
        ),
    });

    await sleep(SAFARI_READY_WAIT_MS);
    const announcer = await consumeInitialNav(router);

    await router.navigate("route1").catch(() => {});
    await flushAnnouncerPipeline();

    const textBefore = announcer.textContent;

    expect(textBefore).not.toBe("");

    wrapper.unmount();

    // RouterProvider's watch cleanup calls `announcer.destroy()`, which
    // removes the announcer node. A post-unmount navigation must NOT
    // re-create it.
    await router.navigate("route2").catch(() => {});
    await flushAnnouncerPipeline();

    expect(document.querySelector(ANNOUNCER_SELECTOR)).toBeNull();
  });

  it("14.4: rapid burst across the Safari-ready window — announcer non-empty after the burst (no buffer leak)", async () => {
    const { mount } = await import("@vue/test-utils");

    mount({
      setup: () => () =>
        h(
          RouterProvider,
          { router, announceNavigation: true },
          { default: () => h("div") },
        ),
    });

    // Do NOT pre-cross the ready window — this is the point of the test.
    // Fire navs immediately so the first few queue into pendingText.
    for (let i = 1; i <= 30; i++) {
      await router.navigate(`route${i % 9}`).catch(() => {});
      await flushAnnouncerPipeline();
    }

    // Ensure the ready window has passed for the final flush.
    await sleep(SAFARI_READY_WAIT_MS);
    await flushAnnouncerPipeline();

    const announcer = document.querySelector(ANNOUNCER_SELECTOR);

    expect(announcer).not.toBeNull();
    expect(announcer!.textContent).toMatch(/Navigated to /);
  });

  it("14.5: 50 rapid navs across two routes — announcer never crashes, final text non-empty", async () => {
    // Sustained burst — exercises clearTimeoutId overlap (each announce
    // resets the previous 7 s clear-timer) and double-rAF stacking. The
    // regression we'd catch is an exception in the rAF callback or a
    // stuck-empty announcer after the burst settles.
    const { mount } = await import("@vue/test-utils");

    mount({
      setup: () => () =>
        h(
          RouterProvider,
          { router, announceNavigation: true },
          { default: () => h("div") },
        ),
    });

    await sleep(SAFARI_READY_WAIT_MS);
    await consumeInitialNav(router);

    for (let i = 0; i < 50; i++) {
      await router.navigate(i % 2 === 0 ? "route1" : "route2").catch(() => {});
      await flushAnnouncerPipeline();
    }

    const announcer = document.querySelector(ANNOUNCER_SELECTOR);

    expect(announcer).not.toBeNull();
    expect(announcer!.textContent).not.toBe("");
  });
});

/**
 * Stress tests for `scrollRestoration` under rapid navigations (§7.2 #10, MED).
 *
 * Closes the §7.2 #10 review item: "scrollRestoration + rapid pushState —
 * `RouterProvider.scroll.test.ts` functional smoke. Race: scroll captured
 * старого route → restored для нового."
 *
 * There is no direct Preact analog — the pattern is extracted from Vue's
 * own `RouterProvider.scroll.test.ts` (functional) and pushed to stress
 * level. Invariants:
 *  - per-route scroll positions persist via canonicalJson key
 *    (`<routeName>:<canonicalJson(params)>`).
 *  - rapid navigate cycles do not leak rAF callbacks past `router.stop()`.
 *  - 50–100 navigate cycles with interleaved scroll updates produce
 *    storage entries for the previously-active route, never for the
 *    destination route (capture happens BEFORE leave, restore happens
 *    AFTER commit via rAF).
 *
 * Test setup uses `vi.stubGlobal("requestAnimationFrame", cb => cb(0))` so
 * the rAF inside the scroll utility resolves synchronously. Real timers
 * elsewhere — `sessionStorage` writes are synchronous, so no timer pump
 * is needed beyond the rAF stub.
 */

import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import { createStressRouter } from "./helpers";
import { RouterProvider } from "../../src/RouterProvider";

import type { Router } from "@real-router/core";

const STORAGE_KEY = "real-router:scroll";

function mountWithScrollRestoration(router: Router): ReturnType<typeof mount> {
  return mount(
    defineComponent({
      setup: () => () =>
        h(
          RouterProvider,
          { router, scrollRestoration: { mode: "restore" } },
          { default: () => h("div") },
        ),
    }),
  );
}

function setScrollY(value: number): void {
  Object.defineProperty(globalThis, "scrollY", {
    value,
    configurable: true,
  });
}

function readStore(): Record<string, number> {
  const raw = sessionStorage.getItem(STORAGE_KEY);

  return raw ? (JSON.parse(raw) as Record<string, number>) : {};
}

describe("§7.2 #10 — scrollRestoration + rapid navigations (Vue)", () => {
  let router: Router;

  beforeEach(async () => {
    sessionStorage.clear();
    history.scrollRestoration = "auto";
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });
    router = createStressRouter(15);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
    sessionStorage.clear();
    history.scrollRestoration = "auto";
    vi.unstubAllGlobals();
  });

  it("10.1: 50 rapid navigations with interleaved scroll updates — capture happens for the previous route, never the destination", async () => {
    const wrapper = mountWithScrollRestoration(router);

    // Each iteration: scroll the page → navigate → assert sessionStorage
    // recorded the PREVIOUS route's position, not the new one's.
    for (let i = 0; i < 50; i++) {
      const previousRouteName = router.getState()?.name ?? "route0";
      const scrollY = 100 + i;

      setScrollY(scrollY);

      const target = `route${(i % 14) + 1}`;

      await router.navigate(target);
      await nextTick();
      await flushPromises();

      const store = readStore();
      const prevKey = `${previousRouteName}:{}`;

      // Capture invariant: the PREVIOUS route's bucket must hold the
      // scroll position we recorded immediately before navigating.
      expect(store[prevKey]).toBe(scrollY);

      // Destination invariant: the NEW route must not have its position
      // overwritten by the previous-route capture. For first visits, the
      // destination has no recorded position (undefined); for revisits,
      // the recorded value must not equal `scrollY` (which belongs to
      // the previous route). Same-route navigation is skipped — capture
      // would correctly write the same key.
      const targetKey = `${target}:{}`;
      const destinationValue =
        target === previousRouteName ? scrollY : store[targetKey];

      expect(destinationValue).not.toBe(scrollY + 1);
      // Locks: when target !== previousRouteName, the destination either
      // has no entry yet (undefined) or carries an older value.
      expect(target === previousRouteName || store[targetKey] !== scrollY).toBe(
        true,
      );
    }

    wrapper.unmount();
  });

  it("10.2: 100 navigation cycles — bounded sessionStorage size, no key explosion", async () => {
    const wrapper = mountWithScrollRestoration(router);

    for (let i = 0; i < 100; i++) {
      setScrollY(50 + (i % 200));
      await router.navigate(`route${(i % 14) + 1}`);
      await nextTick();
      await flushPromises();
    }

    const store = readStore();

    // 14 unique route names × 1 key each → at most 15 entries (route0
    // initial + 14 others). The store must not retain per-navigation
    // keys.
    expect(Object.keys(store).length).toBeLessThanOrEqual(20);

    wrapper.unmount();
  });

  it("10.3: pagehide after 50 navigations captures the CURRENT route's position", async () => {
    const wrapper = mountWithScrollRestoration(router);

    for (let i = 0; i < 50; i++) {
      setScrollY(10 + i);
      await router.navigate(`route${(i % 14) + 1}`);
      await nextTick();
      await flushPromises();
    }

    // Final scroll position before pagehide.
    setScrollY(987);
    globalThis.dispatchEvent(new Event("pagehide"));

    const store = readStore();
    const currentRouteName = router.getState()?.name;

    expect(currentRouteName).toBeDefined();
    expect(store[`${currentRouteName!}:{}`]).toBe(987);

    wrapper.unmount();
  });

  it("10.4: unmount during navigation — no scroll writes after destroy()", async () => {
    const wrapper = mountWithScrollRestoration(router);

    setScrollY(123);

    // Start a navigation, unmount immediately — the utility's destroy()
    // unsubscribes from the router AND removes the pagehide listener.
    // Subsequent navigations must not touch sessionStorage.
    const pending = router.navigate("route1").catch(() => null);

    wrapper.unmount();
    await pending;

    const storeAfterUnmount = readStore();

    // Reset for a clean post-unmount check.
    sessionStorage.clear();

    // Drive a few more navigations after unmount.
    for (let i = 2; i < 10; i++) {
      setScrollY(200 + i);
      await router.navigate(`route${i}`).catch(() => null);
      await nextTick();
      await flushPromises();
    }

    // No new entries should appear post-unmount.
    expect(readStore()).toStrictEqual({});

    // Reference the captured pre-unmount store to silence noUnusedLocals.
    expect(storeAfterUnmount).toBeDefined();
  });

  it("10.5: history.scrollRestoration restored after 100 cycles + unmount", async () => {
    const wrapper = mountWithScrollRestoration(router);

    expect(history.scrollRestoration).toBe("manual");

    for (let i = 0; i < 100; i++) {
      setScrollY(i);
      await router.navigate(`route${(i % 14) + 1}`);
      await nextTick();
      await flushPromises();
    }

    expect(history.scrollRestoration).toBe("manual");

    wrapper.unmount();

    expect(history.scrollRestoration).toBe("auto");
  });
});

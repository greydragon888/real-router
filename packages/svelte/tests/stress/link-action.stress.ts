import { tick } from "svelte";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import ManyLinkActions from "./components/ManyLinkActions.svelte";
import StressLinkAction from "./components/StressLinkAction.svelte";

import {
  createStressRouter,
  renderWithRouter,
  takeHeapSnapshot,
  MB,
} from "./helpers";

import type { Router } from "@real-router/core";

describe("link-action stress tests (Svelte)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(50);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("4.1: 50 createLinkAction elements mount — all receive a11y attributes", async () => {
    const { container, unmount } = renderWithRouter(router, ManyLinkActions, {
      count: 50,
    });

    await tick();

    for (let i = 0; i < 50; i++) {
      const el = container.querySelector(
        `[data-testid='action-${i}']`,
      ) as HTMLElement;

      expect(el).toBeTruthy();
      expect(el.getAttribute("role")).toBe("link");
      expect(el.getAttribute("tabindex")).toBe("0");
    }

    unmount();
  });

  it("4.2: mount/unmount 50 createLinkAction × 50 cycles — bounded heap, destroy cleanup", () => {
    const heapBefore = takeHeapSnapshot();

    for (let cycle = 0; cycle < 50; cycle++) {
      const { unmount } = renderWithRouter(router, ManyLinkActions, {
        count: 50,
      });

      unmount();
    }

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(200 * MB);
  });

  it("4.3: createLinkAction click navigates correctly after mass mount", async () => {
    const { container, unmount } = renderWithRouter(router, ManyLinkActions, {
      count: 50,
    });

    await tick();

    const el5 = container.querySelector(
      "[data-testid='action-5']",
    ) as HTMLElement;

    el5.click();
    await tick();

    expect(router.getState()?.name).toBe("route5");

    const el10 = container.querySelector(
      "[data-testid='action-10']",
    ) as HTMLElement;

    el10.click();
    await tick();

    expect(router.getState()?.name).toBe("route10");

    unmount();
  });

  it("4.4: single createLinkAction update 50 times — no crashes", async () => {
    let errorThrown: unknown = null;

    const { unmount } = renderWithRouter(router, StressLinkAction, {
      routeName: "route0",
      testId: "dynamic-action",
    });

    await tick();

    try {
      for (let i = 0; i < 50; i++) {
        const { unmount: u } = renderWithRouter(router, StressLinkAction, {
          routeName: `route${(i + 1) % 50}`,
          testId: `action-iter-${i}`,
        });

        await tick();
        u();
      }
    } catch (error) {
      errorThrown = error;
    }

    expect(errorThrown).toBeNull();

    unmount();
  });
});

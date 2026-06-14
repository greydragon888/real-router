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
      const element = container.querySelector(`[data-testid='action-${i}']`);

      expect(element).not.toBeNull();
      expect(element?.getAttribute("role")).toBe("link");
      expect(element?.getAttribute("tabindex")).toBe("0");
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

    // Throughput guard (GC-masked): 50 createLinkAction elements mounted then
    // unmounted per cycle, refs dropped — a per-cycle destroy-cleanup leak is
    // reclaimed by GC and invisible here. Per-cycle a11y/destroy cleanup is
    // proven functionally by 4.1/4.3/4.4. Threshold = ~8x measured healthy
    // (~2.99MB over 50 cycles); was 200MB (~67x — extreme theatre).
    expect(heapAfter - heapBefore).toBeLessThan(25 * MB);
  });

  it("4.3: createLinkAction click navigates correctly after mass mount", async () => {
    const { container, unmount } = renderWithRouter(router, ManyLinkActions, {
      count: 50,
    });

    await tick();

    const element5 = container.querySelector("[data-testid='action-5']");

    expect(element5).not.toBeNull();
    expect(element5).toBeInstanceOf(HTMLElement);

    (element5 as HTMLElement).click();

    await tick();

    expect(router.getState()?.name).toBe("route5");

    const element10 = container.querySelector("[data-testid='action-10']");

    expect(element10).not.toBeNull();
    expect(element10).toBeInstanceOf(HTMLElement);

    (element10 as HTMLElement).click();

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

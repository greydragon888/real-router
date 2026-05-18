import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createStressRouter, noop, waitForTransitions } from "./helpers";

import type { StressRouterResult } from "./helpers";
import type { MockNavigation } from "../helpers/mockNavigation";
import type { Router } from "@real-router/core";

describe("N3 — Navigate Event/Router Interleave Stress", () => {
  let router: Router;
  let mockNav: MockNavigation;
  let unsubscribe: StressRouterResult["unsubscribe"];

  beforeEach(async () => {
    const result = createStressRouter();

    ({ router, mockNav, unsubscribe } = result);
    await router.start();
  });

  afterEach(() => {
    router.stop();
    unsubscribe();
  });

  it("3.1 — navigate event then router.navigate: 100 pairs, final state consistent", async () => {
    for (let i = 0; i < 100; i++) {
      mockNav.navigate(`http://localhost/users/view/${i}`);
      router.navigate("users.list").catch(noop);
    }

    await waitForTransitions();

    const finalState = router.getState();

    expect(finalState).toBeDefined();

    const currentUrl = new URL(mockNav.currentUrl);

    expect(currentUrl.pathname).toMatch(/^\//);
    // State ↔ URL consistency: router state path must match browser URL pathname
    expect(currentUrl.pathname).toBe(finalState!.path);
  });

  it("3.2 — router.navigate then navigate event: 100 pairs", async () => {
    for (let i = 0; i < 100; i++) {
      router.navigate("users.list").catch(noop);
      mockNav.navigate("http://localhost/home");
    }

    await waitForTransitions();

    const finalState = router.getState();

    expect(finalState).toBeDefined();
    // Route name must be non-empty (not a typeof tautology)
    expect(finalState!.name.length).toBeGreaterThan(0);

    // State ↔ URL consistency
    const finalUrl = new URL(mockNav.currentUrl);

    expect(finalUrl.pathname).toBe(finalState!.path);
  });

  it("3.3 — alternating event/navigate × 50: state consistent", async () => {
    for (let i = 0; i < 50; i++) {
      mockNav.navigate(`http://localhost/users/view/${i}`);
      router.navigate("users.list").catch(noop);
      mockNav.navigate("http://localhost/home");
      router.navigate("users.view", { id: String(i) }).catch(noop);
    }

    await waitForTransitions();

    const finalState = router.getState();

    expect(finalState).toBeDefined();

    const currentUrl = new URL(mockNav.currentUrl);

    expect(currentUrl.pathname).toMatch(/^\//);
    // State ↔ URL consistency
    expect(currentUrl.pathname).toBe(finalState!.path);
  });

  it("3.4 — fire-and-forget concurrent: no unhandled rejections", async () => {
    for (let i = 0; i < 50; i++) {
      const routeName = i % 2 === 0 ? "users.list" : "home";
      const targetUrl =
        i % 3 === 0
          ? `http://localhost/users/view/${i}`
          : "http://localhost/home";

      router.navigate(routeName).catch(noop);
      mockNav.navigate(targetUrl);
    }

    await waitForTransitions();

    const state = router.getState();

    expect(state).toBeDefined();
    expect(state!.name.length).toBeGreaterThan(0);
  });
});

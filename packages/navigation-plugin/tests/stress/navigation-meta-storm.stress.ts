import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

import { createStressRouter, waitForTransitions, noop } from "./helpers";

describe("N8: Navigation meta storm", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("N8.1: 500 programmatic navigations — every State has meta", async () => {
    const { router, unsubscribe } = createStressRouter();

    await router.start();

    const routes = ["home", "users.list", "users.view"];
    const states: ReturnType<typeof router.getState>[] = [];

    for (let i = 0; i < 500; i++) {
      const name = routes[i % routes.length];
      const params = name === "users.view" ? { id: String(i) } : {};
      const state = await router.navigate(name, params).catch(noop);

      if (state) {
        states.push(state);
      }
    }

    for (const state of states) {
      const meta = state!.context.navigation;

      expect(meta).toBeDefined();
      expect(meta!.userInitiated).toBe(false);
    }

    router.stop();
    unsubscribe();
  });

  it("N8.2: 100 programmatic + 50 browser-initiated (back) — meta type correct", async () => {
    const { router, mockNav, unsubscribe } = createStressRouter();

    await router.start();

    const routes = ["home", "users.list", "users.view"];

    for (let i = 0; i < 100; i++) {
      const name = routes[i % routes.length];
      const params = name === "users.view" ? { id: String(i) } : {};

      await router.navigate(name, params).catch(noop);
    }

    for (let i = 0; i < 50; i++) {
      await mockNav.goBack();
      await waitForTransitions();

      const state = router.getState();

      expect(state).toBeDefined();

      const meta = state?.context.navigation;

      expect(meta).toBeDefined();
      expect(meta!.navigationType).toBe("traverse");
      expect(meta!.userInitiated).toBe(true);
    }

    router.stop();
    unsubscribe();
  });

  it("N8.3: 200 mixed navigation types — deriveNavigationType always correct", async () => {
    const { router, unsubscribe } = createStressRouter();

    await router.start();

    const routes = ["home", "users.list", "users.view"];
    const results: {
      state: ReturnType<typeof router.getState> | undefined;
      type: number;
    }[] = [];

    for (let i = 0; i < 200; i++) {
      const name = routes[i % routes.length];
      const params = name === "users.view" ? { id: String(i) } : {};
      const navigationType = i % 3;

      const state = await navigateByType(router, name, params, navigationType);

      results.push({ state, type: navigationType });
    }

    for (const { state, type } of results) {
      expect(state).toBeDefined();

      const meta = state?.context.navigation;

      expect(meta).toBeDefined();

      assertNavigationType(meta!, type);
    }

    router.stop();
    unsubscribe();
  });

  async function navigateByType(
    router: ReturnType<typeof createStressRouter>["router"],
    name: string,
    params: Record<string, string>,
    navigationType: number,
  ): Promise<ReturnType<typeof router.getState> | undefined> {
    try {
      if (navigationType === 0) {
        return await router.navigate(name, params);
      } else if (navigationType === 1) {
        return await router.navigate(name, params, { replace: true });
      } else {
        return await router.navigate(name, params, { reload: true });
      }
    } catch {
      return undefined;
    }
  }

  function assertNavigationType(meta: any, type: number): void {
    if (type === 0) {
      expect(meta.navigationType).toBe("push");
    } else if (type === 1) {
      expect(meta.navigationType).toBe("replace");
    } else {
      expect(["push", "reload"]).toContain(meta.navigationType);
    }
  }
});

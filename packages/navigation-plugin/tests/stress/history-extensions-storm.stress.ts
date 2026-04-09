import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

import { createStressRouter, waitForTransitions, noop } from "./helpers";

describe("N6: History extensions storm", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("N6.1: 500 navigations — peekBack/hasVisited/getVisitedRoutes consistent at checkpoints", async () => {
    const { router, unsubscribe } = createStressRouter();

    await router.start();

    const navigatedRoutes: string[] = [];
    const routes = ["home", "users.list", "users.view"];

    for (let i = 0; i < 500; i++) {
      const name = routes[i % routes.length];
      const params = name === "users.view" ? { id: String(i) } : {};

      await router.navigate(name, params).catch(noop);
      navigatedRoutes.push(name);
    }

    // Checkpoint assertions after loop
    const prev = router.peekBack();

    expect(prev?.name).toBe(navigatedRoutes.at(-2));

    for (const r of ["home", "users.list", "users.view"]) {
      expect(router.hasVisited(r)).toBe(true);
    }

    const visited = router.getVisitedRoutes();

    expect(visited).toContain("home");
    expect(visited).toContain("users.list");
    expect(visited).toContain("users.view");

    router.stop();
    unsubscribe();
  });

  it("N6.2: 100 navigate + 50 back/forward — canGoBack/canGoForward always correct", async () => {
    const { router, mockNav, unsubscribe } = createStressRouter();

    await router.start();

    const routes = ["home", "users.list", "users.view"];

    for (let i = 0; i < 100; i++) {
      const name = routes[i % routes.length];
      const params = name === "users.view" ? { id: String(i) } : {};

      await router.navigate(name, params).catch(noop);
    }

    for (let i = 0; i < 50; i++) {
      expect(router.canGoBack()).toBe(true);
      expect(router.canGoForward()).toBe(i > 0);

      await mockNav.goBack();
      await waitForTransitions();
    }

    expect(router.canGoForward()).toBe(true);

    router.stop();
    unsubscribe();
  });

  it("N6.3: traverseToLast under rapid navigation — pendingTraverseKey cleanup", async () => {
    const { router, unsubscribe } = createStressRouter();

    await router.start();

    await router.navigate("home");
    await router.navigate("users.list");
    await router.navigate("home");
    await router.navigate("users.view", { id: "1" });
    await router.navigate("users.list");
    await router.navigate("home");
    await router.navigate("users.view", { id: "2" });

    const state = await router.traverseToLast("home");

    expect(state.name).toBe("home");

    await router.navigate("users.list");
    await router.navigate("users.view", { id: "3" });

    const state2 = await router.traverseToLast("home");

    expect(state2.name).toBe("home");

    router.stop();
    unsubscribe();
  });
});

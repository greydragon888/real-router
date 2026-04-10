import { describe, it, expect, afterEach } from "vitest";

import { createStressRouter, noop } from "./helpers";

import type { MockNavigation } from "../helpers/mockNavigation";
import type { Router, Unsubscribe } from "@real-router/core";

let router: Router;
let mockNav: MockNavigation;
let unsubscribe: Unsubscribe;

describe("N2 — Entry Accumulation", () => {
  afterEach(() => {
    router.stop();
    unsubscribe();
  });

  it("2.1 — 500 navigate() calls: entries grow to 501 (initial + 500)", async () => {
    const result = createStressRouter();

    router = result.router;
    mockNav = result.mockNav;
    unsubscribe = result.unsubscribe;

    await router.start();

    for (let i = 0; i < 500; i++) {
      const name = i % 2 === 0 ? "home" : "users.list";

      await router.navigate(name).catch(noop);
    }

    expect(mockNav.entries()).toHaveLength(501);
    expect(router.getState()?.name).toBe("users.list");
  });

  it("2.2 — 500 navigate({ replace: true }) calls: entries stay at 1", async () => {
    const result = createStressRouter();

    router = result.router;
    mockNav = result.mockNav;
    unsubscribe = result.unsubscribe;

    await router.start();

    for (let i = 0; i < 500; i++) {
      const name = i % 2 === 0 ? "home" : "users.list";

      await router.navigate(name, {}, { replace: true }).catch(noop);
    }

    expect(mockNav.entries()).toHaveLength(1);
    expect(router.getState()?.name).toBe("users.list");
  });

  it("2.3 — 500 mixed push/replace: correct entry count", async () => {
    const result = createStressRouter();

    router = result.router;
    mockNav = result.mockNav;
    unsubscribe = result.unsubscribe;

    await router.start();

    for (let i = 0; i < 500; i++) {
      const name = i % 2 === 0 ? "home" : "users.list";

      await router
        .navigate(name, {}, i % 2 === 0 ? { replace: true } : {})
        .catch(noop);
    }

    // Even indices: replace (250), odd indices: push (250)
    // entries = 1 (initial) + 250 (pushes) = 251
    expect(mockNav.entries()).toHaveLength(251);
  });

  it("2.4 — 500 navigate with hash fragment preservation: hash preserved in entry URLs", async () => {
    const result = createStressRouter();

    router = result.router;
    mockNav = result.mockNav;
    unsubscribe = result.unsubscribe;

    mockNav.navigate("http://localhost/home#section", { history: "replace" });
    await router.start();

    for (let i = 0; i < 500; i++) {
      await router.navigate("home", {}, { reload: true }).catch(noop);
    }

    const entries = mockNav.entries();

    for (const entry of entries) {
      expect(entry.url).toContain("#section");
    }
  });

  it("2.5 — 200 navigate with base path '/app': all entry URLs prefixed", async () => {
    const result = createStressRouter({ base: "/app" });

    router = result.router;
    mockNav = result.mockNav;
    unsubscribe = result.unsubscribe;

    await router.start();

    for (let i = 0; i < 200; i++) {
      const name = i % 2 === 0 ? "home" : "users.list";

      await router.navigate(name).catch(noop);
    }

    const entries = mockNav.entries();

    for (const entry of entries) {
      const url = new URL(entry.url);

      expect(url.pathname).toMatch(/^\/app/);
    }
  });

  it("2.6 — 200 replaceHistoryState() calls: entries unchanged, state correct", async () => {
    const result = createStressRouter();

    router = result.router;
    mockNav = result.mockNav;
    unsubscribe = result.unsubscribe;

    await router.start();

    const initialState = router.getState();
    const initialEntriesCount = mockNav.entries().length;

    for (let i = 0; i < 200; i++) {
      const name = i % 2 === 0 ? "home" : "users.list";

      router.replaceHistoryState(name);
    }

    expect(mockNav.entries()).toHaveLength(initialEntriesCount);
    expect(router.getState()).toStrictEqual(initialState);
  });
});

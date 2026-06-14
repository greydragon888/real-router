import { createRouter } from "@real-router/core";
import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import { hashPluginFactory } from "@real-router/hash-plugin";

import { createStressRouter, noop, routeConfig } from "./helpers";

import type { Unsubscribe } from "@real-router/core";

describe("Hash Prefix Switching Under Load", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(() => {
    globalThis.history.replaceState({}, "", "/");
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("50 cycles with hashPrefix '!': all URLs use #!/ format", async () => {
    const result = createStressRouter({ hashPrefix: "!" });

    const { router, browser, unsubscribe } = result;

    await router.start();

    const pushStateSpy = vi.spyOn(browser, "pushState");

    for (let i = 0; i < 50; i++) {
      const name = i % 2 === 0 ? "home" : "users.list";

      await router.navigate(name).catch(noop);
    }

    expect(pushStateSpy).toHaveBeenCalledTimes(50);

    for (const [, url] of pushStateSpy.mock.calls) {
      expect(url).toMatch(/^#!/);
    }

    router.stop();
    unsubscribe();
  });

  it("20 router instances with different prefixes: each produces correct URL format", async () => {
    const prefixes = ["", "!", "~", ".", "@"];
    let completed = 0;

    for (const prefix of prefixes) {
      // Escape the prefix for the regex assertion (".", etc. are regex-special).
      const escapedPrefix = prefix.replaceAll(
        /[.*+?^${}()|[\]\\]/g,
        String.raw`\$&`,
      );
      const expectedHashFormat = new RegExp(`^#${escapedPrefix}/`);

      for (let i = 0; i < 4; i++) {
        const { router, browser, unsubscribe } = createStressRouter({
          hashPrefix: prefix,
        });

        await router.start("/home");

        const state = router.getState();

        expect(state?.name).toBe("home");

        const pushStateSpy = vi.spyOn(browser, "pushState");

        await router.navigate("users.list").catch(noop);

        expect(router.getState()?.name).toBe("users.list");

        // The navigation must have pushed exactly one URL, in the expected
        // #<prefix>/ format for this router's prefix.
        expect(pushStateSpy).toHaveBeenCalledTimes(1);

        for (const [, url] of pushStateSpy.mock.calls) {
          expect(url).toMatch(expectedHashFormat);
        }

        pushStateSpy.mockRestore();
        router.stop();
        unsubscribe();
        completed++;
      }
    }

    expect(completed).toBe(20);
  });

  it("100 navigate with base + hashPrefix combo: URLs always formatted correctly", async () => {
    const result = createStressRouter({ base: "/app", hashPrefix: "!" });

    const { router, browser, unsubscribe } = result;

    await router.start();

    const pushStateSpy = vi.spyOn(browser, "pushState");

    for (let i = 0; i < 100; i++) {
      await router.navigate("users.view", { id: String(i) }).catch(noop);
    }

    expect(pushStateSpy).toHaveBeenCalledTimes(100);

    for (const [, url] of pushStateSpy.mock.calls) {
      expect(url).toMatch(/^\/app#!/);
    }

    expect(router.getState()?.params).toStrictEqual({ id: "99" });

    router.stop();
    unsubscribe();
  });

  it("rapid factory creation with different prefixes: 50 factories, no leaks or errors", async () => {
    const addSpy = vi.spyOn(globalThis, "addEventListener");
    const removeSpy = vi.spyOn(globalThis, "removeEventListener");

    const unsubscribes: Unsubscribe[] = [];
    let completed = 0;

    for (let i = 0; i < 50; i++) {
      const prefixes = ["!", "", "~"];
      const prefix = prefixes[i % 3];
      const router = createRouter(routeConfig, { defaultRoute: "home" });
      const unsub = router.usePlugin(hashPluginFactory({ hashPrefix: prefix }));

      await router.start("/home");
      await router.navigate("users.list").catch(noop);

      expect(router.getState()?.name).toBe("users.list");

      router.stop();
      unsub();
      unsubscribes.push(unsub);
      completed++;
    }

    expect(completed).toBe(50);

    // Listener balance: every popstate listener added across the 50 factories
    // must have been removed on teardown (no leaked browser listeners).
    const added = addSpy.mock.calls.filter(
      ([event]) => event === "popstate",
    ).length;
    const removed = removeSpy.mock.calls.filter(
      ([event]) => event === "popstate",
    ).length;

    expect(added).toBe(50);
    expect(removed).toBe(added);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

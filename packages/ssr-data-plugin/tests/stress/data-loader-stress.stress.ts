import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { ssrDataPluginFactory } from "../../src";

import type { DataLoaderFactoryMap } from "../../src";
import type { Router } from "@real-router/core";

const noop = (): void => undefined;

const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [
      { name: "list", path: "/" },
      { name: "profile", path: "/:id" },
    ],
  },
  { name: "about", path: "/about" },
];

describe("Data Loader Stress", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("200 sequential start() calls with loader: each returns correct data", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderFactoryMap = {
      "users.profile": () => (params) =>
        Promise.resolve({ userId: params.id, ts: Date.now() }),
    };

    for (let i = 0; i < 200; i++) {
      const clone = cloneRouter(base);

      clone.usePlugin(ssrDataPluginFactory(loaders));
      const state = await clone.start(`/users/${i}`);

      const data = state.context.data as { userId: string };

      expect(data.userId).toBe(String(i));

      clone.dispose();
    }
  });

  it("500 concurrent clone+start+dispose: per-request isolation preserved", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderFactoryMap = {
      "users.profile": () => (params) => Promise.resolve({ id: params.id }),
    };

    const results = await Promise.all(
      Array.from({ length: 500 }, async (_, i) => {
        const clone = cloneRouter(base);

        clone.usePlugin(ssrDataPluginFactory(loaders));
        const state = await clone.start(`/users/${i}`);
        const data = state.context.data;

        clone.dispose();

        return data;
      }),
    );

    for (let i = 0; i < 500; i++) {
      expect(results[i]).toStrictEqual({ id: String(i) });
    }
  });

  it("200 start() with multiple loaders: correct loader invoked per route", async () => {
    const homeLoader = vi.fn().mockResolvedValue({ page: "home" });
    const profileLoader = vi
      .fn()
      .mockImplementation((params: { id: string }) =>
        Promise.resolve({ user: params.id }),
      );
    const aboutLoader = vi.fn().mockResolvedValue({ page: "about" });

    const loaders: DataLoaderFactoryMap = {
      home: () => homeLoader,
      "users.profile": () => profileLoader,
      about: () => aboutLoader,
    };

    const base = createRouter(routes, { defaultRoute: "home" });

    const startPaths = ["/", "/users/42", "/about"];

    for (let i = 0; i < 200; i++) {
      const path = startPaths[i % startPaths.length];
      const clone = cloneRouter(base);

      clone.usePlugin(ssrDataPluginFactory(loaders));
      const state = await clone.start(path);

      const data = state.context.data;

      const expectedByPath: Record<string, unknown> = {
        "/": { page: "home" },
        "/users/42": { user: "42" },
        "/about": { page: "about" },
      };

      expect(data).toStrictEqual(expectedByPath[path]);

      clone.dispose();
    }

    // Each loader called roughly 200/3 times (66-67)
    expect(homeLoader.mock.calls.length).toBeGreaterThanOrEqual(66);
    expect(profileLoader.mock.calls.length).toBeGreaterThanOrEqual(66);
    expect(aboutLoader.mock.calls.length).toBeGreaterThanOrEqual(66);
  });

  it("100 usePlugin/unsubscribe cycles: unsubscribe completes without error", async () => {
    const router: Router = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderFactoryMap = {
      home: () => () => Promise.resolve("data"),
    };

    for (let i = 0; i < 100; i++) {
      const unsub = router.usePlugin(ssrDataPluginFactory(loaders));

      const state = await router.start("/");

      expect(state.context.data).toBe("data");

      router.stop();
      unsub();
    }
  });

  it("1000 clone+start+dispose cycles: no memory leak via WeakRef", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderFactoryMap = {
      "users.profile": () => (params) => Promise.resolve({ id: params.id }),
    };

    const refs: WeakRef<object>[] = [];

    for (let i = 0; i < 1000; i++) {
      const clone = cloneRouter(base);

      clone.usePlugin(ssrDataPluginFactory(loaders));
      const state = await clone.start(`/users/${i}`);

      refs.push(new WeakRef(state));

      clone.dispose();
    }

    globalThis.gc?.();

    // Allow some time for GC
    await new Promise((r) => {
      setTimeout(r, 50);
    });
    globalThis.gc?.();

    const alive = refs.filter((r) => r.deref() !== undefined).length;

    // At least 80% should be collected (GC is non-deterministic)
    expect(alive).toBeLessThan(200);
  });

  it("200 rapid usePlugin/unsubscribe without start: no errors", async () => {
    const router: Router = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderFactoryMap = {
      home: () => () => Promise.resolve("data"),
    };

    for (let i = 0; i < 200; i++) {
      const unsub = router.usePlugin(ssrDataPluginFactory(loaders));

      unsub();
    }

    // Verify router still works after rapid plugin churn
    router.usePlugin(ssrDataPluginFactory(loaders));
    const state = await router.start("/");

    expect(state.context.data).toBe("data");

    router.stop();
  });
});

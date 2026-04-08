import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { ssrDataPluginFactory } from "../../src";

import type { DataLoaderMap } from "../../src";
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

describe("D1 -- Data Loader Stress", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("D1.1 -- 200 sequential start() calls with loader: each returns correct data", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderMap = {
      "users.profile": (params) =>
        Promise.resolve({ userId: params.id, ts: Date.now() }),
    };

    for (let i = 0; i < 200; i++) {
      const clone = cloneRouter(base);

      clone.usePlugin(ssrDataPluginFactory(loaders));
      await clone.start(`/users/${i}`);

      const data = clone.getRouteData() as { userId: string };

      expect(data).toBeDefined();
      expect(data.userId).toBe(String(i));

      clone.dispose();
    }
  });

  it("D1.2 -- 500 concurrent clone+start+dispose: per-request isolation preserved", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderMap = {
      "users.profile": (params) => Promise.resolve({ id: params.id }),
    };

    const results = await Promise.all(
      Array.from({ length: 500 }, async (_, i) => {
        const clone = cloneRouter(base);

        clone.usePlugin(ssrDataPluginFactory(loaders));
        await clone.start(`/users/${i}`);
        const data = clone.getRouteData();

        clone.dispose();

        return data;
      }),
    );

    for (let i = 0; i < 500; i++) {
      expect(results[i]).toStrictEqual({ id: String(i) });
    }
  });

  it("D1.3 -- 200 start() with multiple loaders: correct loader invoked per route", async () => {
    const homeLoader = vi.fn().mockResolvedValue({ page: "home" });
    const profileLoader = vi
      .fn()
      .mockImplementation((params: { id: string }) =>
        Promise.resolve({ user: params.id }),
      );
    const aboutLoader = vi.fn().mockResolvedValue({ page: "about" });

    const loaders: DataLoaderMap = {
      home: homeLoader,
      "users.profile": profileLoader,
      about: aboutLoader,
    };

    const base = createRouter(routes, { defaultRoute: "home" });

    const startPaths = ["/", "/users/42", "/about"];

    for (let i = 0; i < 200; i++) {
      const path = startPaths[i % startPaths.length];
      const clone = cloneRouter(base);

      clone.usePlugin(ssrDataPluginFactory(loaders));
      await clone.start(path);

      const data = clone.getRouteData();

      expect(data).toBeDefined();

      clone.dispose();
    }

    // Each loader called roughly 200/3 times (66-67)
    expect(homeLoader.mock.calls.length).toBeGreaterThanOrEqual(66);
    expect(profileLoader.mock.calls.length).toBeGreaterThanOrEqual(66);
    expect(aboutLoader.mock.calls.length).toBeGreaterThanOrEqual(66);
  });

  it("D1.4 -- 100 usePlugin/unsubscribe cycles: getRouteData removed after each unsubscribe", async () => {
    const router: Router = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderMap = {
      home: () => Promise.resolve("data"),
    };

    for (let i = 0; i < 100; i++) {
      const unsub = router.usePlugin(ssrDataPluginFactory(loaders));

      await router.start("/");

      expect(router.getRouteData()).toBe("data");

      router.stop();
      unsub();

      expect(router).not.toHaveProperty("getRouteData");
    }
  });
});

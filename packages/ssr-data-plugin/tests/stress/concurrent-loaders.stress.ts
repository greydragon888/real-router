import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { ssrDataPluginFactory } from "../../src";

import type { DataLoaderMap } from "../../src";

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
  { name: "settings", path: "/settings" },
];

describe("D3 -- Concurrent Loaders Stress", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("D3.1 -- 200 concurrent starts across 4 different routes: each gets correct data", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderMap = {
      home: () => Promise.resolve({ page: "home" }),
      "users.profile": (params) => Promise.resolve({ userId: params.id }),
      about: () => Promise.resolve({ page: "about" }),
      settings: () => Promise.resolve({ page: "settings" }),
    };

    const paths = ["/", "/users/42", "/about", "/settings"];
    const expectedData = [
      { page: "home" },
      { userId: "42" },
      { page: "about" },
      { page: "settings" },
    ];

    const results = await Promise.all(
      Array.from({ length: 200 }, async (_, i) => {
        const pathIndex = i % paths.length;
        const clone = cloneRouter(base);

        clone.usePlugin(ssrDataPluginFactory(loaders));
        await clone.start(paths[pathIndex]);
        const data = clone.getRouteData();

        clone.dispose();

        return { data, pathIndex };
      }),
    );

    for (const { data, pathIndex } of results) {
      expect(data).toStrictEqual(expectedData[pathIndex]);
    }
  });

  it("D3.2 -- 100 concurrent starts with shared loader state: no cross-contamination", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    let callCount = 0;

    const loaders: DataLoaderMap = {
      "users.profile": (params) => {
        callCount++;

        return Promise.resolve({
          id: params.id,
          order: callCount,
        });
      },
    };

    const results = await Promise.all(
      Array.from({ length: 100 }, async (_, i) => {
        const clone = cloneRouter(base);

        clone.usePlugin(ssrDataPluginFactory(loaders));
        await clone.start(`/users/${i}`);
        const data = clone.getRouteData() as { id: string; order: number };

        clone.dispose();

        return data;
      }),
    );

    // Each result has the correct id (no cross-contamination)
    for (let i = 0; i < 100; i++) {
      expect(results[i].id).toBe(String(i));
    }

    // Loader was called exactly 100 times
    expect(callCount).toBe(100);
  });

  it("D3.3 -- 100 concurrent starts with routes having no loader: getRouteData returns null", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderMap = {
      // Only profile has a loader
      "users.profile": (params) => Promise.resolve({ id: params.id }),
    };

    const results = await Promise.all(
      Array.from({ length: 100 }, async (_, i) => {
        const clone = cloneRouter(base);

        clone.usePlugin(ssrDataPluginFactory(loaders));

        // Half go to home (no loader), half to profile (has loader)
        const path = i % 2 === 0 ? "/" : `/users/${i}`;

        await clone.start(path);
        const data = clone.getRouteData();

        clone.dispose();

        return { data, hasLoader: i % 2 !== 0 };
      }),
    );

    const withLoader = results.filter((r) => r.hasLoader);
    const withoutLoader = results.filter((r) => !r.hasLoader);

    expect(
      withLoader.every((r) => r.data !== null && r.data !== undefined),
    ).toBe(true);
    expect(withoutLoader.every((r) => r.data === null)).toBe(true);
  });

  it("D3.4 -- 50 factories with different loaders on same base router: isolation maintained", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });

    const results = await Promise.all(
      Array.from({ length: 50 }, async (_, i) => {
        const loaders: DataLoaderMap = {
          home: () => Promise.resolve({ factoryId: i }),
        };

        const clone = cloneRouter(base);

        clone.usePlugin(ssrDataPluginFactory(loaders));
        await clone.start("/");
        const data = clone.getRouteData() as { factoryId: number };

        clone.dispose();

        return data;
      }),
    );

    for (let i = 0; i < 50; i++) {
      expect(results[i].factoryId).toBe(i);
    }
  });
});

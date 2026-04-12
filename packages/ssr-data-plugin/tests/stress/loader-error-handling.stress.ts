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
];

describe("D2 -- Loader Error Handling Under Stress", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("D2.1 -- 100 starts with failing loader: each rejects with loader error", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderMap = {
      home: () => Promise.reject(new Error("loader failed")),
    };

    let errorCount = 0;

    for (let i = 0; i < 100; i++) {
      const clone = cloneRouter(base);

      clone.usePlugin(ssrDataPluginFactory(loaders));

      await expect(clone.start("/")).rejects.toThrow("loader failed");

      errorCount++;

      clone.dispose();
    }

    expect(errorCount).toBe(100);
  });

  it("D2.2 -- 100 concurrent starts with mixed success/failure: each resolves correctly", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderMap = {
      "users.profile": (params) => {
        const id = Number(params.id);

        if (id % 3 === 0) {
          return Promise.reject(new Error(`loader failed for ${id}`));
        }

        return Promise.resolve({ id: params.id });
      },
    };

    const results = await Promise.allSettled(
      Array.from({ length: 100 }, async (_, i) => {
        const clone = cloneRouter(base);

        clone.usePlugin(ssrDataPluginFactory(loaders));
        const state = await clone.start(`/users/${i}`);
        const data = state.context.data;

        clone.dispose();

        return data;
      }),
    );

    const rejected = results.filter((r) => r.status === "rejected");
    const fulfilled = results.filter((r) => r.status === "fulfilled");

    expect(rejected).toHaveLength(34); // 0,3,6,...,99
    expect(fulfilled).toHaveLength(66);
    expect(fulfilled.every((r) => typeof r.value === "object")).toBe(true);
  });

  it("D2.3 -- 50 starts with slow loaders: all resolve within timeout", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderMap = {
      home: () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({ slow: true });
          }, 10);
        }),
    };

    const results = await Promise.all(
      Array.from({ length: 50 }, async () => {
        const clone = cloneRouter(base);

        clone.usePlugin(ssrDataPluginFactory(loaders));
        const state = await clone.start("/");
        const data = state.context.data;

        clone.dispose();

        return data;
      }),
    );

    for (const data of results) {
      expect(data).toStrictEqual({ slow: true });
    }
  });

  it("D2.4 -- 100 starts where loader throws synchronously: error propagates correctly", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderMap = {
      home: () => {
        throw new TypeError("sync loader error");
      },
    };

    let errorCount = 0;

    for (let i = 0; i < 100; i++) {
      const clone = cloneRouter(base);

      clone.usePlugin(ssrDataPluginFactory(loaders));

      await expect(clone.start("/")).rejects.toThrow("sync loader error");

      errorCount++;

      clone.dispose();
    }

    expect(errorCount).toBe(100);
  });
});

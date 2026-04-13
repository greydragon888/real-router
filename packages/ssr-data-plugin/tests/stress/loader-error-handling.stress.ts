import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { ssrDataPluginFactory } from "../../src";

import type { DataLoaderFactoryMap } from "../../src";

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

describe("Loader Error Handling Under Stress", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("100 starts with failing loader: each rejects with loader error", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderFactoryMap = {
      home: () => () => Promise.reject(new Error("loader failed")),
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

  it("100 concurrent starts with mixed success/failure: each resolves correctly", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderFactoryMap = {
      "users.profile": () => (params) => {
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

    for (const r of fulfilled) {
      expect(r.value).toStrictEqual({ id: expect.any(String) });
    }
  });

  it("50 starts with slow loaders: all resolve within timeout", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderFactoryMap = {
      home: () => () =>
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

  it("100 starts where loader throws synchronously: error propagates correctly", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderFactoryMap = {
      home: () => () => {
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

  it("100 iterations with throwing factory: claim released each time", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });

    for (let i = 0; i < 100; i++) {
      const clone = cloneRouter(base);

      const badFactory = ssrDataPluginFactory({
        home: () => {
          throw new Error(`factory crash ${i}`);
        },
      });

      expect(() => clone.usePlugin(badFactory)).toThrow(`factory crash ${i}`);

      // Verify claim was released by registering a good plugin
      const goodFactory = ssrDataPluginFactory({
        home: () => () => Promise.resolve({ ok: true }),
      });

      clone.usePlugin(goodFactory);
      const state = await clone.start("/");

      expect(state.context.data).toStrictEqual({ ok: true });

      clone.dispose();
    }
  });

  it("100 concurrent clones with every 5th failing: error isolation", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });

    const results = await Promise.allSettled(
      Array.from({ length: 100 }, async (_, i) => {
        const clone = cloneRouter(base);
        const loaders: DataLoaderFactoryMap = {
          home:
            i % 5 === 0
              ? () => () => Promise.reject(new Error(`fail ${i}`))
              : () => () => Promise.resolve({ index: i }),
        };

        clone.usePlugin(ssrDataPluginFactory(loaders));
        const state = await clone.start("/");
        const data = state.context.data;

        clone.dispose();

        return data;
      }),
    );

    const rejected = results.filter((r) => r.status === "rejected");
    const fulfilled = results.filter((r) => r.status === "fulfilled");

    expect(rejected).toHaveLength(20);
    expect(fulfilled).toHaveLength(80);

    for (const r of fulfilled) {
      expect(r.value).toStrictEqual({ index: expect.any(Number) });
    }
  });

  it("stop() during slow loader: no crash", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });

    for (let i = 0; i < 50; i++) {
      const clone = cloneRouter(base);
      const loaders: DataLoaderFactoryMap = {
        home: () => () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({ slow: true });
            }, 10);
          }),
      };

      clone.usePlugin(ssrDataPluginFactory(loaders));
      const promise = clone.start("/");

      // stop while loader is pending
      clone.stop();

      await Promise.allSettled([promise]);

      clone.dispose();
    }

    // If loop completed without crash/timeout — all 50 iterations survived
    expect(true).toBe(true);
  });
});

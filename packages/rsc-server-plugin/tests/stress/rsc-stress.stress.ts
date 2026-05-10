import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { invalidate, rscServerPluginFactory } from "../../src";

import type { RscLoaderFactoryMap } from "../../src";
import type { Router } from "@real-router/core";
import type { ReactNode } from "react";

const noop = (): void => undefined;

const node = (kind: string, props: Record<string, unknown> = {}): ReactNode =>
  ({
    type: kind,
    props,
    key: null,
    $$typeof: Symbol.for("react.element"),
  }) as unknown as ReactNode;

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

describe("RSC Loader Stress", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("500 concurrent clone+start+dispose: per-request isolation preserved", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: RscLoaderFactoryMap = {
      "users.profile": () => (params) =>
        Promise.resolve(node("Profile", { id: params.id })),
    };

    const results = await Promise.all(
      Array.from({ length: 500 }, async (_, i) => {
        const clone = cloneRouter(base);

        clone.usePlugin(rscServerPluginFactory(loaders));
        const state = await clone.start(`/users/${i}`);
        const rsc = state.context.rsc;

        clone.dispose();

        return rsc;
      }),
    );

    for (let i = 0; i < 500; i++) {
      expect(results[i]).toStrictEqual(node("Profile", { id: String(i) }));
    }
  });

  it("100 starts with failing loader: each rejects with loader error", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: RscLoaderFactoryMap = {
      home: () => () => Promise.reject(new Error("rsc render failed")),
    };

    let errorCount = 0;

    for (let i = 0; i < 100; i++) {
      const clone = cloneRouter(base);

      clone.usePlugin(rscServerPluginFactory(loaders));

      await expect(clone.start("/")).rejects.toThrow("rsc render failed");

      errorCount++;

      clone.dispose();
    }

    expect(errorCount).toBe(100);
  });

  it("100 concurrent starts with mixed success/failure: each resolves correctly", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: RscLoaderFactoryMap = {
      "users.profile": () => (params) => {
        const id = Number(params.id);

        if (id % 3 === 0) {
          return Promise.reject(new Error(`rsc fail for ${id}`));
        }

        return Promise.resolve(node("Profile", { id: params.id }));
      },
    };

    const results = await Promise.allSettled(
      Array.from({ length: 100 }, async (_, i) => {
        const clone = cloneRouter(base);

        clone.usePlugin(rscServerPluginFactory(loaders));
        const state = await clone.start(`/users/${i}`);
        const rsc = state.context.rsc;

        clone.dispose();

        return rsc;
      }),
    );

    const rejected = results.filter((r) => r.status === "rejected");
    const fulfilled = results.filter((r) => r.status === "fulfilled");

    expect(rejected).toHaveLength(34); // 0,3,6,...,99
    expect(fulfilled).toHaveLength(66);
  });

  it("50 starts with slow loaders: all resolve within timeout", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: RscLoaderFactoryMap = {
      home: () => () =>
        new Promise<ReactNode>((resolve) => {
          setTimeout(() => {
            resolve(node("Home", { slow: true }));
          }, 10);
        }),
    };

    const results = await Promise.all(
      Array.from({ length: 50 }, async () => {
        const clone = cloneRouter(base);

        clone.usePlugin(rscServerPluginFactory(loaders));
        const state = await clone.start("/");
        const rsc = state.context.rsc;

        clone.dispose();

        return rsc;
      }),
    );

    for (const rsc of results) {
      expect(rsc).toStrictEqual(node("Home", { slow: true }));
    }
  });

  it("100 iterations with throwing factory: claim released each time", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });

    for (let i = 0; i < 100; i++) {
      const clone = cloneRouter(base);

      const badFactory = rscServerPluginFactory({
        home: () => {
          throw new Error(`factory crash ${i}`);
        },
      });

      expect(() => clone.usePlugin(badFactory)).toThrow(`factory crash ${i}`);

      // Verify claim was released by registering a good plugin
      const goodFactory = rscServerPluginFactory({
        home: () => () => Promise.resolve(node("Home")),
      });

      clone.usePlugin(goodFactory);
      const state = await clone.start("/");

      expect(state.context.rsc).toStrictEqual(node("Home"));

      clone.dispose();
    }
  });

  it("200 concurrent starts across 4 different routes: each gets correct rsc", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: RscLoaderFactoryMap = {
      home: () => () => Promise.resolve(node("Home")),
      "users.profile": () => (params) =>
        Promise.resolve(node("Profile", { userId: params.id })),
      about: () => () => Promise.resolve(node("About")),
      settings: () => () => Promise.resolve(node("Settings")),
    };

    const paths = ["/", "/users/42", "/about", "/settings"];
    const expected = [
      node("Home"),
      node("Profile", { userId: "42" }),
      node("About"),
      node("Settings"),
    ];

    const results = await Promise.all(
      Array.from({ length: 200 }, async (_, i) => {
        const pathIndex = i % paths.length;
        const clone = cloneRouter(base);

        clone.usePlugin(rscServerPluginFactory(loaders));
        const state = await clone.start(paths[pathIndex]);
        const rsc = state.context.rsc;

        clone.dispose();

        return { rsc, pathIndex };
      }),
    );

    for (const { rsc, pathIndex } of results) {
      expect(rsc).toStrictEqual(expected[pathIndex]);
    }
  });

  it("100 usePlugin/unsubscribe cycles: unsubscribe completes without error", async () => {
    const router: Router = createRouter(routes, { defaultRoute: "home" });
    const loaders: RscLoaderFactoryMap = {
      home: () => () => Promise.resolve(node("Home")),
    };

    for (let i = 0; i < 100; i++) {
      const unsub = router.usePlugin(rscServerPluginFactory(loaders));

      const state = await router.start("/");

      expect(state.context.rsc).toStrictEqual(node("Home"));

      router.stop();
      unsub();
    }
  });

  it("100 iterations of navigate-during-teardown: subscribeLeave race does not crash", async () => {
    // Race contract: invalidate(...) marks the namespace stale, the next
    // navigate triggers the leave handler which awaits the loader, and
    // unsubscribe() removes the listener. If teardown lands while the
    // handler is mid-await, the post-await `claim.write` could land on
    // a released claim. The handler must either complete cleanly or fail
    // in a way the navigate() promise can settle — never crash the loop.
    const base = createRouter(routes, { defaultRoute: "home" });
    let crashes = 0;
    let releaseSlowLoader: (() => void) | undefined;

    for (let i = 0; i < 100; i++) {
      const clone = cloneRouter(base);
      const slowPromise = new Promise<ReactNode>((resolve) => {
        releaseSlowLoader = (): void => {
          resolve(node("Slow", { i }));
        };
      });

      const unsub = clone.usePlugin(
        rscServerPluginFactory({
          home: () => () => Promise.resolve(node("Home", { i })),
          "users.profile": () => () => slowPromise,
        }),
      );

      try {
        await clone.start("/"); // home — primes the leave-handler path

        invalidate(clone, "rsc");
        const navPromise = clone.navigate("users.profile", { id: String(i) });

        // Yield enough microtasks to land inside `await loader(…)` of the
        // leave handler.
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        // Tear down WHILE the handler is awaiting the loader. The handler
        // continues to completion; its post-await `claim.write` may throw
        // if core enforces release strictly, in which case navPromise
        // rejects — that's allowed, just not a process crash.
        unsub();
        releaseSlowLoader?.();

        await Promise.allSettled([navPromise]);
      } catch {
        crashes++;
      } finally {
        clone.dispose();
      }
    }

    expect(crashes).toBe(0);
  });

  it("1000 cycles with WeakRef on rsc payload: no leak past GC", async () => {
    // RSC payloads carry closures, so leaks can be more memorable than for
    // plain JSON. Mirrors ssr-data-plugin's data-loader-stress.stress.ts:144
    // with a ReactNode-shaped payload.
    const base = createRouter(routes, { defaultRoute: "home" });
    const refs: WeakRef<object>[] = [];

    for (let i = 0; i < 1000; i++) {
      const clone = cloneRouter(base);

      clone.usePlugin(
        rscServerPluginFactory({
          "users.profile": () => (params) =>
            // Build a fresh payload object each call so WeakRef can observe
            // collection — a constant payload would be retained module-side.
            Promise.resolve(node("Profile", { id: params.id, capture: i })),
        }),
      );

      const state = await clone.start(`/users/${i}`);
      const rsc = state.context.rsc as object | undefined;

      if (rsc !== undefined) {
        refs.push(new WeakRef(rsc));
      }

      clone.dispose();
    }

    // Two-pass GC + breathing room — V8 is non-deterministic, so we tolerate
    // a small residue. Threshold mirrors ssr-data-plugin's 200/1000.
    globalThis.gc?.();

    await new Promise((r) => {
      setTimeout(r, 50);
    });
    globalThis.gc?.();

    const alive = refs.filter((r) => r.deref() !== undefined).length;

    expect(alive).toBeLessThan(200);
  });

  it("stop() during slow loader: no crash", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });

    for (let i = 0; i < 50; i++) {
      const clone = cloneRouter(base);
      const loaders: RscLoaderFactoryMap = {
        home: () => () =>
          new Promise<ReactNode>((resolve) => {
            setTimeout(() => {
              resolve(node("Home", { slow: true }));
            }, 10);
          }),
      };

      clone.usePlugin(rscServerPluginFactory(loaders));
      const promise = clone.start("/");

      // stop while loader is pending
      clone.stop();

      await Promise.allSettled([promise]);

      clone.dispose();
    }

    expect(true).toBe(true);
  });
});

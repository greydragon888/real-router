import { ApplicationInitStatus, REQUEST } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MB, takeHeapSnapshot } from "./helpers";
import { ROUTER } from "../../src/providers";
import { provideRealRouterFactory } from "../../src/providersFactory";

import type { PluginFactory, Router } from "@real-router/core";

/**
 * Closes review-2026-05-16 §7.4 Test 5 (MED).
 *
 * `provideRealRouterFactory` registers `DestroyRef.onDestroy(() =>
 * router.dispose())` per request — `router.dispose()` must actually run when
 * the application injector is destroyed (TestBed.resetTestingModule), and it
 * must release all plugin-owned subscriptions, interceptors, and namespace
 * claims.
 *
 * What we pin:
 *
 *   1. **Dispose actually fires.** A plugin records its own start + dispose
 *      count; after 100 cycles both equal 100 (no orphaned plugin instances).
 *
 *   2. **baseRouter survives the churn.** After 100 request-scoped clones are
 *      created, started, and disposed, `baseRouter` is still usable and its
 *      own state machine hasn't been touched.
 *
 *   3. **Heap stays bounded.** Disposed routers must be GC'able — heap delta
 *      after 100 cycles should be well under 50MB.
 *
 *   4. **Symmetric start ↔ teardown count.** No plugin instance starts without
 *      a matching teardown (would indicate a leaked router) and no teardown
 *      fires without a prior start (would indicate double-dispose).
 */
const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
];

describe("provideRealRouterFactory dispose vs stop (Angular)", () => {
  let baseRouter: Router;

  beforeEach(() => {
    baseRouter = createRouter(routes);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    baseRouter.dispose();
  });

  it("(a) 100 cycles — start and teardown call counts are symmetric; baseRouter unaffected", async () => {
    const starts: number[] = [];
    const teardowns: number[] = [];

    const trackingFactory: PluginFactory = (router) => {
      const id = starts.length;

      starts.push(id);

      const api = getPluginApi(router);
      const unsubInterceptor = api.addInterceptor("start", async (next, path) =>
        next(path),
      );

      return {
        teardown: () => {
          teardowns.push(id);
          unsubInterceptor();
        },
      };
    };

    for (let i = 0; i < 100; i++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          {
            provide: REQUEST,
            useValue: new Request(`http://localhost/users/${i}`),
          },
          provideRealRouterFactory({
            baseRouter,
            plugins: () => [trackingFactory],
          }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      const router = TestBed.inject(ROUTER);

      expect(router).not.toBe(baseRouter);
      expect(router.getState()?.name).toBe("users.profile");
    }

    // Trigger the final dispose by resetting the module.
    TestBed.resetTestingModule();

    expect(starts).toHaveLength(100);
    expect(teardowns).toHaveLength(100);

    // Order: plugin n starts before plugin n+1 (sequential request scopes);
    // teardown order matches start order (FIFO).
    for (let i = 0; i < 100; i++) {
      expect(starts[i]).toBe(i);
      expect(teardowns[i]).toBe(i);
    }

    // baseRouter is still untouched and usable.
    await baseRouter.start("/");

    expect(baseRouter.getState()?.name).toBe("home");

    await baseRouter.navigate("users.profile", { id: "999" });

    expect(baseRouter.getState()?.params).toStrictEqual({ id: "999" });
  }, 90_000);

  it("(b) 100 cycles — heap delta stays well under 50MB", async () => {
    const heapBefore = takeHeapSnapshot();

    const noopFactory: PluginFactory = (router) => {
      const api = getPluginApi(router);
      const unsub = api.addInterceptor("start", async (next, path) =>
        next(path),
      );

      return {
        teardown: () => {
          unsub();
        },
      };
    };

    for (let i = 0; i < 100; i++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          {
            provide: REQUEST,
            useValue: new Request(`http://localhost/users/${i}`),
          },
          provideRealRouterFactory({
            baseRouter,
            plugins: () => [noopFactory],
          }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;
      TestBed.inject(ROUTER);
    }

    TestBed.resetTestingModule();
    const heapAfter = takeHeapSnapshot();

    // THROUGHPUT GUARD (GC-masked). 100 per-request router-clone cycles, each
    // disposed via resetTestingModule — a per-cycle leak is reclaimed before the
    // snapshot. Measured healthy: ~0 MB (3 runs: -38/-42/-44 KB — clones fully
    // collected). Threshold 4 MB. FIFO start/teardown ordering in test (a) is
    // the real discriminator for dispose correctness.
    expect(heapAfter - heapBefore).toBeLessThan(4 * MB);
  }, 90_000);

  it("(c) plugin teardown observed via context-namespace claim — claim is released on dispose", async () => {
    const claims: string[] = [];

    const namespaceFactory: PluginFactory = (router) => {
      const api = getPluginApi(router);
      const claim = api.claimContextNamespace("test-ns");

      claims.push("claimed");

      return {
        teardown: () => {
          claims.push("released");
          claim.release();
        },
      };
    };

    const cycles = 20;

    for (let i = 0; i < cycles; i++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          {
            provide: REQUEST,
            useValue: new Request(`http://localhost/users/${i}`),
          },
          provideRealRouterFactory({
            baseRouter,
            plugins: () => [namespaceFactory],
          }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;
    }

    TestBed.resetTestingModule();

    // Each cycle: one claim, one release. Two claims on the same router (if
    // teardowns didn't run) would throw `Cannot claim context namespace`.
    const claimed = claims.filter((s) => s === "claimed").length;
    const released = claims.filter((s) => s === "released").length;

    expect(claimed).toBe(cycles);
    expect(released).toBe(cycles);

    // baseRouter still has no claim on it — fresh clone with the same
    // namespace plugin can succeed.
    TestBed.configureTestingModule({
      providers: [
        {
          provide: REQUEST,
          useValue: new Request("http://localhost/"),
        },
        provideRealRouterFactory({
          baseRouter,
          plugins: () => [namespaceFactory],
        }),
      ],
    });

    await TestBed.inject(ApplicationInitStatus).donePromise;

    expect(claims.filter((s) => s === "claimed")).toHaveLength(cycles + 1);
  }, 60_000);
});

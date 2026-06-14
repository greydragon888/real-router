import {
  ApplicationInitStatus,
  REQUEST,
  TransferState,
  inject,
  makeStateKey,
  provideAppInitializer,
} from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MB, takeHeapSnapshot } from "./helpers";
import { ROUTER } from "../../src/providers";
import { provideRealRouterFactory } from "../../src/providersFactory";

import type { Router } from "@real-router/core";

const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
];

/**
 * Closes review-2026-05-10 §10 Phase 2 #12 (last remaining stress gap that
 * can be exercised in JIT): TransferState client read (`hydrateRouter`) at
 * scale. The functional pin-test in `providersFactory.test.ts` ("client-side
 * hydration: pre-seeded TransferState → hydrateRouter consumes + removes
 * entry") covers the one-shot contract. This stress harness drives the
 * same pattern 100× to verify:
 *
 *   1. Each iteration's seeded payload is consumed exactly once and the
 *      `TransferState` entry is removed (one-shot semantics — parity with
 *      `delete window.__SSR_STATE__` in the other 5 adapters).
 *   2. Router state matches the seeded payload (not a CSR-derived path) —
 *      `hydrateRouter` actually fed the scratchpad into `router.start()`.
 *   3. Heap stays bounded under 100 cycles — no leak from per-request
 *      EnvironmentInjector + cloned router accumulation.
 *
 * Approach: seeding requires running BEFORE the factory's `provideAppInitializer`
 * fires. Initializers run in registration order, so we register a `provideAppInitializer`
 * BEFORE `provideRealRouterFactory(...)` in the providers array — the seeding
 * initializer writes to TransferState; the factory's initializer then reads
 * it and consumes via `hydrateRouter`. Same pattern as the functional test.
 */

const ROUTER_STATE_KEY_NAME = "@real-router/angular:ssrState";

describe("provideRealRouterFactory TransferState hydration stress", () => {
  let baseRouter: ReturnType<typeof createRouter>;

  beforeEach(() => {
    baseRouter = createRouter(routes);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    baseRouter.dispose();
  });

  it("(a) 100 client-side hydration cycles — each consumes the seed and removes the TransferState entry", async () => {
    const heapBefore = takeHeapSnapshot();
    const observedNames: string[] = [];

    for (let i = 0; i < 100; i++) {
      const seededState = JSON.stringify({
        name: "users.profile",
        params: { id: String(i) },
        path: `/users/${i}`,
        context: {},
      });

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: REQUEST, useValue: null },
          // Seed initializer — runs first (registration order).
          provideAppInitializer(() => {
            const ts = inject(TransferState);

            ts.set(makeStateKey<string>(ROUTER_STATE_KEY_NAME), seededState);
          }),
          // Factory initializer reads the seed and consumes via hydrateRouter.
          provideRealRouterFactory({ baseRouter }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      const router = TestBed.inject(ROUTER);
      const state = router.getState();

      observedNames.push(state?.name ?? "");

      // (1) one-shot: entry removed after consumption.
      const ts = TestBed.inject(TransferState);
      const stillStored = ts.get(
        makeStateKey<string>(ROUTER_STATE_KEY_NAME),
        null,
      );

      expect(stillStored).toBeNull();

      // (2) state matches seeded payload — params.id reflects iteration index.
      expect(state?.name).toBe("users.profile");
      expect(state?.params).toStrictEqual({ id: String(i) });
    }

    // All 100 iterations hydrated to users.profile (not a CSR-derived path).
    expect(observedNames.every((n) => n === "users.profile")).toBe(true);

    TestBed.resetTestingModule();
    const heapAfter = takeHeapSnapshot();

    // (3) bounded heap — 100 EnvironmentInjector + cloned router lifecycle cycles.
    // THROUGHPUT GUARD (GC-masked). 100 hydration cycles via resetTestingModule.
    // Measured healthy: ~1.72 MB (3 runs: 1756/1765/1752 KB). Threshold 8 MB ≈
    // 4.5× healthy max. The genuine invariants (one-shot TransferState removal,
    // per-cycle distinct params) are discriminated by the assertions inside the
    // loop, not by heap.
    expect(heapAfter - heapBefore).toBeLessThan(8 * MB);
  }, 120_000);

  it("(b) hydration cycles preserve isolation — distinct router instance per cycle", async () => {
    const seenRouters: Router[] = [];

    for (let i = 0; i < 50; i++) {
      const seededState = JSON.stringify({
        name: "home",
        params: {},
        path: "/",
        context: {},
      });

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: REQUEST, useValue: null },
          provideAppInitializer(() => {
            inject(TransferState).set(
              makeStateKey<string>(ROUTER_STATE_KEY_NAME),
              seededState,
            );
          }),
          provideRealRouterFactory({ baseRouter }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      const router = TestBed.inject(ROUTER);

      seenRouters.push(router);

      // Each clone is independent — never the baseRouter, never a prior clone.
      expect(router).not.toBe(baseRouter);

      for (let j = 0; j < seenRouters.length - 1; j++) {
        expect(router).not.toBe(seenRouters[j]);
      }
    }

    // 50 distinct router instances after 50 hydration cycles.
    expect(new Set(seenRouters).size).toBe(50);
  }, 90_000);

  it("(c) mixed hydration + CSR fallback cycles — no cross-talk between branches", async () => {
    // Alternating pattern: 50 cycles where odd iterations have TransferState seed,
    // even iterations have NO seed (pure CSR fallback). Verifies both branches
    // of `provideAppInitializer` (in factory) work correctly when interleaved.
    for (let i = 0; i < 50; i++) {
      const hasSeed = i % 2 === 1;
      const expectedName = hasSeed ? "users.profile" : "home";

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: REQUEST, useValue: null },
          // Conditional seed — only register the initializer on odd iterations.
          ...(hasSeed
            ? [
                provideAppInitializer(() => {
                  inject(TransferState).set(
                    makeStateKey<string>(ROUTER_STATE_KEY_NAME),
                    JSON.stringify({
                      name: "users.profile",
                      params: { id: String(i) },
                      path: `/users/${i}`,
                      context: {},
                    }),
                  );
                }),
              ]
            : []),
          provideRealRouterFactory({ baseRouter }),
        ],
      });

      await TestBed.inject(ApplicationInitStatus).donePromise;

      const router = TestBed.inject(ROUTER);

      expect(router.getState()?.name).toBe(expectedName);
      // Seeded iterations carry `id: String(i)`; CSR fallbacks have no
      // params on "home". Use ternary expected to avoid a conditional
      // `expect` (vitest/no-conditional-expect).
      expect(router.getState()?.params).toStrictEqual(
        hasSeed ? { id: String(i) } : {},
      );
    }
  }, 90_000);
});

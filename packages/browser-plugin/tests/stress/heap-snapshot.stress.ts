import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import {
  createStressRouter,
  expectedStressError,
  noop,
  waitForTransitions,
} from "./helpers";

/**
 * B7.3 — 10 000 navigation cycles + heap snapshot
 *
 * Listener leaks, context-claim accumulation, and unfreed router
 * extensions are invisible until the app runs for hours. This test
 * compresses that timeline into one process: it forces a GC, snapshots
 * `process.memoryUsage().heapUsed`, runs 10 000 navigations, forces GC
 * again, and re-snapshots.
 *
 * The threshold is intentionally loose (50 MiB) — we are not catching a
 * tight allocation regression, we are catching obvious unbounded growth
 * (forgot to `removeEventListener`, `claim.release()` skipped, etc.).
 *
 * Requires `--expose-gc` (already enabled in `vitest.config.stress.mts`
 * via `execArgv`).
 */
describe("B7.3 — heap stability across 10 000 navigations", () => {
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

  it("heapUsed delta stays within a generous threshold", async () => {
    // `globalThis.gc` is exposed by `--expose-gc` (see vitest.config.stress
    // execArgv). Outside the stress runner the function is absent — skip
    // the body but keep the test recorded so the runner reports it.
    // eslint-disable-next-line vitest/no-conditional-in-test -- env-gated skip; runtime check is intentional, not a flaky branch
    if (typeof globalThis.gc !== "function") {
      return;
    }

    const { router } = createStressRouter();

    try {
      await router.start();

      const ITER = 10_000;
      const ROUTES = ["users.list", "home", "users.view"] as const;

      // Warm-up: 100 navigations + GC to stabilize the JIT and clear
      // initial allocations.
      for (let i = 0; i < 100; i++) {
        await router
          .navigate(ROUTES[i % ROUTES.length], { id: String(i) })
          .catch(expectedStressError);
      }

      await waitForTransitions(20);

      globalThis.gc();
      globalThis.gc();
      const heapBefore = process.memoryUsage().heapUsed;

      for (let i = 0; i < ITER; i++) {
        await router
          .navigate(ROUTES[i % ROUTES.length], { id: String(i) })
          .catch(expectedStressError);
      }

      await waitForTransitions(20);
      globalThis.gc();
      globalThis.gc();
      const heapAfter = process.memoryUsage().heapUsed;

      const deltaMB = (heapAfter - heapBefore) / (1024 * 1024);

      // 50 MiB is loose enough to absorb V8's own background overhead
      // and any reasonable per-state allocation, but tight enough to
      // catch a true listener / claim leak (which would grow O(N) over
      // 10K iterations and easily exceed this).
      expect(deltaMB).toBeLessThan(50);
    } finally {
      router.stop();
    }
  });
});

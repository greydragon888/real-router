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
 * B7.3 — 40 000 navigation cycles + heap snapshot
 *
 * Listener leaks, context-claim accumulation, and unfreed router
 * extensions are invisible until the app runs for hours. This test
 * compresses that timeline into one process: it forces a GC, snapshots
 * `process.memoryUsage().heapUsed`, runs 40 000 navigations, forces GC
 * again, and re-snapshots.
 *
 * Navigations use `{ replace: true }` ON PURPOSE. With `pushState`, jsdom
 * retains every entry in its session history, so the "healthy" delta grew
 * O(N) (~16 MiB at 40K) and entirely swamped any real per-navigation router
 * leak — no absolute threshold could discriminate (healthy and leak were
 * within ~1.4x). `replace: true` keeps jsdom's history at one entry, so the
 * baseline goes FLAT in N and the only O(N) growth left is a genuine router
 * leak (listener/claim accumulation on the live router).
 *
 * Discrimination (measured at N = 40 000, replace mode, `--expose-gc`, fork):
 *   - healthy delta:  ~0.85 MiB (flat in N — router retains nothing per nav)
 *   - simulated leak: ~23.2 MiB (retain every resolved State in a sink array,
 *     i.e. a claim/extension never released)
 *   - chosen threshold: 5.0 MiB → 5.9x above healthy, 4.6x below the leak.
 *     Both margins are >=3x. The old 50 MiB ceiling sat ~2x ABOVE even the
 *     leak signal AND below the inflated push-mode healthy floor — it was
 *     pure theatre, passing on a real leak.
 *
 * Requires `--expose-gc` (already enabled in `vitest.config.stress.mts`
 * via `execArgv`).
 */
describe("B7.3 — heap stability across 40 000 navigations", () => {
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

  it("heapUsed delta stays within a generous threshold", async ({ skip }) => {
    // `globalThis.gc` is exposed by `--expose-gc` (see vitest.config.stress
    // execArgv). Outside the stress runner it is absent — `skip()` reports this
    // as skipped instead of a silent pass; the following `return` both stops
    // execution and narrows `globalThis.gc` to a function below.
    // eslint-disable-next-line vitest/no-conditional-in-test -- env-gated skip
    if (typeof globalThis.gc !== "function") {
      skip("requires --expose-gc (stress runner only)");

      return;
    }

    const { router } = createStressRouter();

    try {
      await router.start();

      const ITER = 40_000;
      const ROUTES = ["users.list", "home", "users.view"] as const;

      // Warm-up: 100 navigations + GC to stabilize the JIT and clear
      // initial allocations. `replace: true` to match the measured loop.
      for (let i = 0; i < 100; i++) {
        await router
          .navigate(
            ROUTES[i % ROUTES.length],
            { id: String(i) },
            { replace: true },
          )
          .catch(expectedStressError);
      }

      await waitForTransitions(20);

      globalThis.gc();
      globalThis.gc();
      const heapBefore = process.memoryUsage().heapUsed;

      // `replace: true` — see file header: keeps jsdom session history flat so
      // the healthy baseline does not grow O(N) and mask a real router leak.
      for (let i = 0; i < ITER; i++) {
        await router
          .navigate(
            ROUTES[i % ROUTES.length],
            { id: String(i) },
            { replace: true },
          )
          .catch(expectedStressError);
      }

      await waitForTransitions(20);
      globalThis.gc();
      globalThis.gc();
      const heapAfter = process.memoryUsage().heapUsed;

      const deltaMB = (heapAfter - heapBefore) / (1024 * 1024);

      // measured healthy ~0.85 MiB (flat in N), simulated per-nav leak ~23 MiB.
      expect(deltaMB).toBeLessThan(5);
    } finally {
      router.stop();
    }
  });
});

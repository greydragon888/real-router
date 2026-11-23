import { fc, test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";

import { LoaderTimeout, withTimeout } from "@real-router/ssr-utils";

import { NUM_RUNS } from "./helpers";

// =============================================================================
// withTimeout: race semantics (#598)
// =============================================================================
//
// Hot-path contract for cancellation-aware loaders. Properties pinned:
//
//   1. Fast-path: when the loader resolves before the deadline, the
//      returned value is the loader's resolved value (any T).
//   2. Deadline-path: when the loader never settles, the rejection is a
//      `LoaderTimeout` carrying the supplied `route` + `ms` for HTTP
//      mapping at the consumer layer.
//   3. Pre-aborted upstream short-circuit: when `upstreamSignal` is already
//      aborted, the loader is NEVER invoked and the rejection is the
//      upstream's `Error` reason — regardless of route name and timeout.
//      Locks the "no work after client disconnect" guarantee that
//      `withTimeout` documents.

describe("withTimeout: race semantics", () => {
  const arbRouteName = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9._-]{0,20}$/);

  // `fc.anything()` here is the loader's resolved value, NOT a foreign
  // input — withTimeout is parametric over T, so any value must pass
  // through to the consumer unmolested.
  test.prop([arbRouteName, fc.integer({ min: 50, max: 500 }), fc.anything()], {
    numRuns: NUM_RUNS.fast,
  })(
    "fast-path: loader resolving before deadline returns the resolved value",
    async (route, ms, value) => {
      const result = await withTimeout(route, ms, () => Promise.resolve(value));

      // `toStrictEqual` (not `toBe`) — `fc.anything()` produces objects,
      // arrays, NaN. Structural equality is the right contract: the
      // function returns the loader value, identity isn't guaranteed
      // across the `Promise.race` wrapper.
      expect(result).toStrictEqual(value);
    },
  );

  test.prop([arbRouteName, fc.integer({ min: 1, max: 20 })], {
    numRuns: NUM_RUNS.fast,
  })(
    "deadline-path: rejects with LoaderTimeout carrying route + ms",
    async (route, ms) => {
      // Loader that never settles — only the deadline can resolve the
      // race. `route` and `ms` flow through to the error fields so HTTP
      // middleware can render a 504 with the right context.
      const promise = withTimeout(
        route,
        ms,
        () => new Promise<never>(() => {}),
      );

      await expect(promise).rejects.toBeInstanceOf(LoaderTimeout);
      await expect(promise).rejects.toMatchObject({
        name: "LoaderTimeout",
        code: "LOADER_TIMEOUT",
        route,
        ms,
      });
    },
  );

  test.prop([arbRouteName, fc.integer({ min: 50, max: 1000 })], {
    numRuns: NUM_RUNS.fast,
  })(
    "pre-aborted upstream: loader is NEVER invoked, regardless of route + ms",
    async (route, ms) => {
      const upstream = new AbortController();
      const reason = new Error("client-disconnected");

      upstream.abort(reason);

      const loaderSpy = vi.fn();

      await expect(
        withTimeout(route, ms, loaderSpy, { upstreamSignal: upstream.signal }),
      ).rejects.toBe(reason);

      expect(loaderSpy).not.toHaveBeenCalled();
    },
  );
});

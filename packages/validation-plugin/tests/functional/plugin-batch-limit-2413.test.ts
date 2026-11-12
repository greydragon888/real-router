import { createRouter } from "@real-router/core";
import { describe, it, expect, vi } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Router } from "@real-router/core";

/**
 * `usePlugin` judges a call by everything it would register (#2413).
 *
 * Core asks once per call, before the first factory runs, and hands the plugin
 * the number of distinct factories the call carries — so a batch the limit
 * cannot hold is refused whole, with nothing registered, exactly as a single
 * registration at the limit is.
 *
 * ⚠ The plugin limit is opt-in — bare core does not enforce it
 * (`packages/validation-plugin/CLAUDE.md` › "Every declared limit is OPT-IN"),
 * and the last control holds that.
 */
function routerWithLimit(maxPlugins: number): Router {
  const router = createRouter([], { limits: { maxPlugins } });

  router.usePlugin(validationPlugin());

  return router;
}

function factories(count: number) {
  return Array.from({ length: count }, () => vi.fn(() => ({})));
}

describe("usePlugin judges a batch by what it would register (#2413)", () => {
  // Both arms in one cell: a check made per call refuses the single arm and
  // admits the batch arm, so a cell holding either arm alone cannot tell it
  // from a check made per plugin.
  it("refuses the single arm and the batch arm at the same limit", () => {
    const single = routerWithLimit(3);

    single.usePlugin(...factories(1));
    single.usePlugin(...factories(1));

    expect(() => {
      single.usePlugin(...factories(1));
    }).toThrow(
      /Plugin limit exceeded \(3\)\. Current: 3, Attempting to add: 1\./,
    );

    const batch = routerWithLimit(3);

    expect(() => {
      batch.usePlugin(...factories(4));
    }).toThrow(
      /^\[router\.usePlugin\] Plugin limit exceeded \(3\)\. Current: 1, Attempting to add: 4\./,
    );
  });

  it("refuses before the first factory of the batch runs", () => {
    const router = routerWithLimit(3);
    const batch = factories(4);

    expect(() => {
      router.usePlugin(...batch);
    }).toThrow(RangeError);

    for (const factory of batch) {
      expect(factory).not.toHaveBeenCalled();
    }

    // Nothing of the refused batch is registered: the router still holds the
    // validation plugin alone, so two more fill it and a third is refused.
    router.usePlugin(...factories(2));

    expect(() => {
      router.usePlugin(...factories(1));
    }).toThrow(/Current: 3, Attempting to add: 1\./);
  });

  // CONTROL — without it every cell above is satisfied by a door that refuses
  // every batch.
  it("CONTROL — a batch that fills the limit exactly lands whole", () => {
    const router = routerWithLimit(3);
    const batch = factories(2);

    router.usePlugin(...batch);

    for (const factory of batch) {
      expect(factory).toHaveBeenCalledTimes(1);
    }

    expect(() => {
      router.usePlugin(...factories(1));
    }).toThrow(/Current: 3, Attempting to add: 1\./);
  });

  // CONTROL — a factory repeated in one batch is registered once, so it takes
  // one slot; counting the arguments would refuse an install that fits.
  it("CONTROL — a factory repeated in the batch takes one slot", () => {
    const router = routerWithLimit(3);
    const repeated = vi.fn(() => ({}));

    router.usePlugin(...factories(1));

    expect(() => {
      router.usePlugin(repeated, repeated);
    }).not.toThrow();

    expect(repeated).toHaveBeenCalledTimes(1);

    expect(() => {
      router.usePlugin(...factories(1));
    }).toThrow(/Current: 3, Attempting to add: 1\./);
  });

  // CONTROL — `false`, `null` and `undefined` are skipped before the count, the
  // `usePlugin(__DEV__ && validationPlugin(), …)` shape.
  it("CONTROL — a skipped entry takes no slot", () => {
    const router = routerWithLimit(3);
    const [first, second] = factories(2);

    expect(() => {
      router.usePlugin(first, false, null, undefined, second);
    }).not.toThrow();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  // CONTROL — `0` is the documented "no limit", and a batch must not reinvent
  // a ceiling where the configuration removed one.
  it("CONTROL — maxPlugins 0 means no limit", () => {
    const router = routerWithLimit(0);
    const batch = factories(10);

    router.usePlugin(...batch);

    for (const factory of batch) {
      expect(factory).toHaveBeenCalledTimes(1);
    }
  });

  it("CONTROL — bare core enforces no plugin limit, batch or single", () => {
    const router = createRouter([], { limits: { maxPlugins: 3 } });
    const batch = factories(5);

    router.usePlugin(...batch);

    for (const factory of batch) {
      expect(factory).toHaveBeenCalledTimes(1);
    }

    expect(() => {
      router.usePlugin(...factories(1));
    }).not.toThrow();
  });
});

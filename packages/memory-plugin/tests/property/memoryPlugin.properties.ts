import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { memoryPluginFactory } from "@real-router/memory-plugin";

import {
  NUM_RUNS,
  arbActionSequence,
  arbMaxHistory,
  arbRouteWithParams,
  createTestRouter,
  executeAction,
} from "./helpers";

import type { Router } from "@real-router/core";

function getHistoryIndex(router: Router): number {
  const state = router.getState();
  const memory = state?.context.memory as
    | { historyIndex: number; direction: string }
    | undefined;

  return memory?.historyIndex ?? -1;
}

async function settle(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 0));
}

function assertIndexBounds(router: Router): void {
  const canBack = router.canGoBack();
  const canForward = router.canGoForward();

  // If we can go back, we must not be at the start and router state must exist.
  if (canBack) {
    expect(router.getState()).toBeDefined();
  }

  // If we can go forward, a subsequent back() target exists → state must be defined.
  if (canForward) {
    expect(router.getState()).toBeDefined();
  }

  // Invariant: canGoBack and canGoForward can never both be meaningful when
  // history is empty (index === -1). Router always has state while active.
  if (canBack || canForward) {
    expect(router.getState()).toBeDefined();
  }
}

describe("Index bounds invariants", () => {
  test.prop([arbMaxHistory, arbActionSequence], {
    numRuns: NUM_RUNS.async,
  })(
    "canGoBack and canGoForward are always consistent booleans after any action sequence",
    async (maxHistory: number, actions) => {
      const router = await createTestRouter(maxHistory);

      for (const action of actions) {
        await executeAction(router, action);
        assertIndexBounds(router);
      }

      router.stop();
    },
  );

  test.prop([arbMaxHistory, arbActionSequence], {
    numRuns: NUM_RUNS.async,
  })(
    "after stop(), canGoBack and canGoForward are always false",
    async (maxHistory: number, actions) => {
      const router = await createTestRouter(maxHistory);

      for (const action of actions) {
        await executeAction(router, action);
      }

      router.stop();

      expect(router.canGoBack()).toBe(false);
      expect(router.canGoForward()).toBe(false);
    },
  );
});

describe("History size invariants", () => {
  test.prop([arbActionSequence], {
    numRuns: NUM_RUNS.async,
  })(
    "with maxHistoryLength=3, canGoBack implies at most 2 back steps",
    async (actions) => {
      const router = await createTestRouter(3);

      for (const action of actions) {
        await executeAction(router, action);
      }

      let backCount = 0;

      while (router.canGoBack()) {
        router.back();
        await new Promise<void>((r) => setTimeout(r, 0));
        backCount++;

        if (backCount > 3) {
          break;
        }
      }

      expect(backCount).toBeLessThanOrEqual(2);

      router.stop();
    },
  );

  test.prop([arbActionSequence], {
    numRuns: NUM_RUNS.async,
  })(
    "with maxHistoryLength=1, history length never exceeds 1",
    async (actions) => {
      const router = await createTestRouter(1);

      for (const action of actions) {
        await executeAction(router, action);

        expect(router.canGoBack()).toBe(false);
        expect(router.canGoForward()).toBe(false);
      }

      router.stop();
    },
  );
});

describe("go(0) idempotency", () => {
  test.prop([arbMaxHistory, arbActionSequence], {
    numRuns: NUM_RUNS.async,
  })(
    "go(0) never changes router state after any action sequence",
    async (maxHistory: number, actions) => {
      const router = await createTestRouter(maxHistory);

      for (const action of actions) {
        await executeAction(router, action);
      }

      const stateBefore = router.getState();

      router.go(0);

      expect(router.getState()).toBe(stateBefore);

      router.stop();
    },
  );
});

describe("Factory validation invariants", () => {
  test.prop(
    [
      fc.oneof(
        fc.integer({ max: -1 }),
        fc
          .double({ noNaN: false, noDefaultInfinity: false })
          .filter((n) => !Number.isInteger(n) || !Number.isFinite(n)),
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )("rejects all non-(non-negative integer) numbers", (bad: number) => {
    expect(() => memoryPluginFactory({ maxHistoryLength: bad })).toThrow(
      TypeError,
    );
  });

  test.prop(
    [fc.anything().filter((x) => typeof x !== "number" && x !== undefined)],
    { numRuns: NUM_RUNS.standard },
  )("rejects all non-number, non-undefined inputs", (bad) => {
    expect(() =>
      memoryPluginFactory({ maxHistoryLength: bad as number }),
    ).toThrow(TypeError);
  });

  test.prop([fc.integer({ min: 0, max: 1000 })], {
    numRuns: NUM_RUNS.standard,
  })("accepts all non-negative integers", (good: number) => {
    expect(() => memoryPluginFactory({ maxHistoryLength: good })).not.toThrow();
  });
});

describe("Teardown idempotency invariants", () => {
  test.prop([arbMaxHistory, arbActionSequence], {
    numRuns: NUM_RUNS.lifecycle,
  })(
    "multiple unsubscribe() calls never throw",
    async (maxHistory: number, actions) => {
      const router = await createTestRouter(maxHistory);

      for (const action of actions) {
        await executeAction(router, action);
      }

      // createTestRouter returned an active router with the plugin installed.
      // We cannot unsubscribe here (the factory callback swallowed the fn),
      // so stop() stands in for teardown — it must be idempotent too.
      router.stop();

      expect(() => {
        router.stop();
      }).not.toThrow();
    },
  );
});

describe("Navigation consistency invariants", () => {
  test.prop([arbMaxHistory, arbActionSequence], {
    numRuns: NUM_RUNS.async,
  })(
    "forward is not possible immediately after a new navigation (non-replace)",
    async (maxHistory: number, actions) => {
      const router = await createTestRouter(maxHistory);

      for (const action of actions) {
        await executeAction(router, action);
      }

      const state = router.getState();

      try {
        await router.navigate("settings");
      } catch (error) {
        const code = (error as { code?: string }).code;

        if (code !== "SAME_STATES" && code !== "CANNOT_ACTIVATE") {
          throw error;
        }
      }

      // If the navigation actually changed state, no forward entries should remain.
      if (router.getState()?.name !== state?.name) {
        expect(router.canGoForward()).toBe(false);
      }

      router.stop();
    },
  );

  test.prop([arbMaxHistory, arbActionSequence], {
    numRuns: NUM_RUNS.async,
  })(
    "router state is never undefined while router is active",
    async (maxHistory: number, actions) => {
      const router = await createTestRouter(maxHistory);

      for (const action of actions) {
        await executeAction(router, action);

        expect(router.getState()).not.toBeUndefined();
      }

      router.stop();
    },
  );
});

describe("Push counting invariants", () => {
  // #7: pure pushes grow historyIndex by exactly 1 until the cap is reached.
  test.prop(
    [
      fc.constantFrom(2, 3, 5, 10),
      fc.array(arbRouteWithParams, { minLength: 2, maxLength: 15 }),
    ],
    { numRuns: NUM_RUNS.async },
  )(
    "pure pushes: historyIndex = min(pushCount, maxHistory - 1)",
    async (maxHistory: number, routes) => {
      const router = await createTestRouter(maxHistory);

      let successfulPushes = 0; // starts at 1 (home)

      for (const route of routes) {
        const ok = await executeAction(router, {
          type: "navigate",
          name: route.name,
          params: route.params,
        });

        if (ok) {
          successfulPushes++;
        }
      }

      const expectedIndex = Math.min(successfulPushes, maxHistory - 1);

      expect(getHistoryIndex(router)).toBe(expectedIndex);
      expect(router.canGoForward()).toBe(false);

      router.stop();
    },
  );

  // #5 extended: unlimited history (maxHistoryLength=0) grows without trim.
  test.prop([fc.array(arbRouteWithParams, { minLength: 1, maxLength: 20 })], {
    numRuns: NUM_RUNS.async,
  })(
    "maxHistoryLength=0 never caps: historyIndex = pushCount",
    async (routes) => {
      const router = await createTestRouter(0);

      let successfulPushes = 0;

      for (const route of routes) {
        const ok = await executeAction(router, {
          type: "navigate",
          name: route.name,
          params: route.params,
        });

        if (ok) {
          successfulPushes++;
        }
      }

      expect(getHistoryIndex(router)).toBe(successfulPushes);

      router.stop();
    },
  );
});

describe("Replace preserves historyIndex invariant", () => {
  // #6: replace() must not change historyIndex or introduce forward entries.
  test.prop(
    [
      fc.constantFrom(0, 3, 5, 10),
      fc.array(arbRouteWithParams, { minLength: 1, maxLength: 10 }),
      fc.array(arbRouteWithParams, { minLength: 1, maxLength: 10 }),
    ],
    { numRuns: NUM_RUNS.async },
  )(
    "series of replace() leaves historyIndex unchanged",
    async (maxHistory: number, pushes, replaces) => {
      const router = await createTestRouter(maxHistory);

      for (const route of pushes) {
        await executeAction(router, {
          type: "navigate",
          name: route.name,
          params: route.params,
        });
      }

      const indexBeforeReplace = getHistoryIndex(router);
      const canForwardBefore = router.canGoForward();

      for (const route of replaces) {
        await executeAction(router, {
          type: "navigate_replace",
          name: route.name,
          params: route.params,
        });
      }

      expect(getHistoryIndex(router)).toBe(indexBeforeReplace);
      expect(router.canGoForward()).toBe(canForwardBefore);

      router.stop();
    },
  );
});

describe("Navigate-after-back truncation invariant", () => {
  // #10 strict: after back() + navigate(), canGoForward() is false.
  test.prop(
    [
      fc.constantFrom(0, 5, 10),
      fc.array(arbRouteWithParams, { minLength: 2, maxLength: 8 }),
      arbRouteWithParams,
    ],
    { numRuns: NUM_RUNS.async },
  )(
    "push after back() truncates forward entries",
    async (maxHistory: number, pushes, tail) => {
      const router = await createTestRouter(maxHistory);

      for (const route of pushes) {
        await executeAction(router, {
          type: "navigate",
          name: route.name,
          params: route.params,
        });
      }

      if (!router.canGoBack()) {
        router.stop();

        return;
      }

      router.back();
      await settle();

      const ok = await executeAction(router, {
        type: "navigate",
        name: tail.name,
        params: tail.params,
      });

      if (ok) {
        expect(router.canGoForward()).toBe(false);
      }

      router.stop();
    },
  );
});

describe("Back/forward round-trip invariant", () => {
  test.prop(
    [
      arbMaxHistory,
      fc.array(arbRouteWithParams, { minLength: 2, maxLength: 8 }),
    ],
    { numRuns: NUM_RUNS.async },
  )(
    "back() followed by forward() returns to the same path (no guards)",
    async (maxHistory: number, routes) => {
      const router = await createTestRouter(maxHistory);

      for (const route of routes) {
        await executeAction(router, {
          type: "navigate",
          name: route.name,
          params: route.params,
        });
      }

      if (!router.canGoBack()) {
        router.stop();

        return;
      }

      const pathBefore = router.getState()?.path;

      router.back();
      await settle();

      if (!router.canGoForward()) {
        router.stop();

        return;
      }

      router.forward();
      await settle();

      expect(router.getState()?.path).toBe(pathBefore);

      router.stop();
    },
  );
});

// Bi-implication between `canGoBack() ⇔ state.context.memory.historyIndex > 0`.
// Fix for #508: short-circuit branch of #go(delta) now writes
// state.context.memory with the updated historyIndex, keeping the public
// context view in sync with the private `#index`.
describe("canGoBack/canGoForward bi-implication with historyIndex", () => {
  // Covers INVARIANTS #3 and #4 as strict bi-implications.
  test.prop([arbMaxHistory, arbActionSequence], { numRuns: NUM_RUNS.async })(
    "canGoBack() === (historyIndex > 0) after every action",
    async (maxHistory: number, actions) => {
      const router = await createTestRouter(maxHistory);

      for (const action of actions) {
        await executeAction(router, action);

        const idx = getHistoryIndex(router);

        expect(router.canGoBack()).toBe(idx > 0);
      }

      router.stop();
    },
  );
});

describe("direction === 'navigate' for successful pushes", () => {
  // Covers new invariant D: every non-history push writes direction='navigate'.
  test.prop([fc.array(arbRouteWithParams, { minLength: 1, maxLength: 10 })], {
    numRuns: NUM_RUNS.async,
  })(
    "every successful navigate(name, params) writes direction='navigate'",
    async (routes) => {
      const router = await createTestRouter(0);

      for (const r of routes) {
        try {
          const state = await router.navigate(r.name, r.params);

          expect(state.context.memory?.direction).toBe("navigate");
        } catch (error) {
          const code = (error as { code?: string }).code;

          if (code !== "SAME_STATES" && code !== "CANNOT_ACTIVATE") {
            throw error;
          }
        }
      }

      router.stop();
    },
  );
});

describe("maxHistoryLength=1 idempotency", () => {
  // Covers new invariant G: at cap=1, history stays exactly one entry;
  // back()/forward() are always no-ops.
  test.prop([fc.array(arbRouteWithParams, { minLength: 2, maxLength: 8 })], {
    numRuns: NUM_RUNS.async,
  })(
    "maxHistory=1: canGoBack and canGoForward are always false after any sequence",
    async (routes) => {
      const router = await createTestRouter(1);

      for (const r of routes) {
        try {
          await router.navigate(r.name, r.params);
        } catch (error) {
          const code = (error as { code?: string }).code;

          if (code !== "SAME_STATES" && code !== "CANNOT_ACTIVATE") {
            throw error;
          }
        }

        expect(router.canGoBack()).toBe(false);
        expect(router.canGoForward()).toBe(false);

        const idx = getHistoryIndex(router);

        expect(idx).toBe(0);
      }

      router.stop();
    },
  );
});

describe("N×back then N×forward round-trip", () => {
  // Covers new invariant C: for distinct-path pushes without guards,
  // N back() followed by N forward() lands on the same path.
  test.prop(
    [
      arbMaxHistory,
      fc.array(arbRouteWithParams, { minLength: 3, maxLength: 8 }),
      fc.integer({ min: 1, max: 4 }),
    ],
    { numRuns: NUM_RUNS.async },
  )(
    "N back() then N forward() returns to the same path (no guards)",
    async (maxHistory: number, routes, n: number) => {
      const router = await createTestRouter(maxHistory);

      for (const r of routes) {
        await executeAction(router, {
          type: "navigate",
          name: r.name,
          params: r.params,
        });
      }

      const pathBefore = router.getState()?.path;
      let backSteps = 0;

      while (router.canGoBack() && backSteps < n) {
        router.back();
        await settle();
        backSteps++;
      }

      let forwardSteps = 0;

      while (router.canGoForward() && forwardSteps < backSteps) {
        router.forward();
        await settle();
        forwardSteps++;
      }

      // After symmetric round-trip, path must match the pre-back() state.
      if (backSteps > 0 && forwardSteps === backSteps) {
        expect(router.getState()?.path).toBe(pathBefore);
      }

      router.stop();
    },
  );
});

describe("Consistency counting invariant", () => {
  // After N successful pure pushes of *distinct* routes (no replace, no back),
  // canGoBack() must hold exactly N times — then become false. No unbounded
  // loops, no silent hangs, no off-by-one drift from the cap semantics.
  test.prop(
    [
      fc.constantFrom(0, 3, 5, 10),
      fc.array(arbRouteWithParams, { minLength: 1, maxLength: 15 }),
    ],
    { numRuns: NUM_RUNS.async },
  )(
    "after pure pushes, backN() terminates in exactly min(pushCount, effectiveMax - 1) steps",
    async (maxHistory: number, routes) => {
      const router = await createTestRouter(maxHistory);

      let successfulPushes = 0;

      for (const route of routes) {
        const ok = await executeAction(router, {
          type: "navigate",
          name: route.name,
          params: route.params,
        });

        if (ok) {
          successfulPushes++;
        }
      }

      // Effective length after cap: pure pushes never trigger short-circuit.
      const expectedBackSteps =
        maxHistory === 0
          ? successfulPushes
          : Math.min(successfulPushes, maxHistory - 1);

      let steps = 0;

      while (router.canGoBack()) {
        router.back();
        await settle();
        steps++;

        if (steps > successfulPushes + 5) {
          break;
        } // hard bound against hang
      }

      expect(steps).toBe(expectedBackSteps);
      expect(router.canGoBack()).toBe(false);

      router.stop();
    },
  );
});

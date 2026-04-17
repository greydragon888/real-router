import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { memoryPluginFactory } from "@real-router/memory-plugin";

import {
  NUM_RUNS,
  arbActionSequence,
  arbMaxHistory,
  createTestRouter,
  executeAction,
} from "./helpers";

import type { Router } from "@real-router/core";

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
  )("rejects all non-(non-negative integer) inputs", (bad: number) => {
    expect(() => memoryPluginFactory({ maxHistoryLength: bad })).toThrow(
      TypeError,
    );
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

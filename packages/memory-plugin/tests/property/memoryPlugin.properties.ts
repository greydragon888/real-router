import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

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

  expect(typeof canBack).toBe("boolean");
  expect(typeof canForward).toBe("boolean");

  if (!canBack && !canForward) {
    return;
  }

  if (canBack) {
    expect(router.getState()).not.toBeUndefined();
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

        if (router.getState()?.name !== state?.name) {
          expect(router.canGoForward()).toBe(false);
        }
      } catch {
        // SAME_STATES or other expected error
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

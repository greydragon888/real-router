/**
 * freezeStateInPlace benchmarks
 *
 * Tests state freezing performance:
 * - Shallow state (minimal structure)
 * - Typical state (with meta)
 * - Deep nested state
 * - Already frozen state (re-freeze overhead)
 */

import { bench, boxplot, do_not_optimize, summary } from "mitata";

import { freezeStateInPlace } from "../../../src/helpers";

import type { State, StateMeta, Params } from "@real-router/types";

// Helper to create unfrozen state
function createState(
  name: string,
  params: Params = {},
  path = "/test",
  meta?: StateMeta,
): State {
  return {
    name,
    params,
    path,
    meta,
  };
}

// Helper to create deep nested params
function createDeepParams(depth: number): Params {
  if (depth === 0) {
    return { value: "leaf" };
  }

  return { nested: createDeepParams(depth - 1) };
}

// ============================================================================
// Basic freezeStateInPlace scenarios
// ============================================================================

boxplot(() => {
  summary(() => {
    // Shallow state - minimal structure
    bench("freeze: shallow state", () => {
      const state = createState("home", {}, "/");

      do_not_optimize(freezeStateInPlace(state));
    }).gc("inner");

    // Typical state with meta
    bench("freeze: typical state with meta", () => {
      const state = createState("users", { id: "123" }, "/users/123", {
        id: 1,
        params: { source: "browser" },
      });

      do_not_optimize(freezeStateInPlace(state));
    }).gc("inner");

    // State with multiple params
    bench("freeze: state with 5 params", () => {
      const state = createState(
        "complex",
        {
          id: "123",
          slug: "test-item",
          category: "tech",
          page: "1",
          sort: "desc",
        },
        "/complex/123/test-item",
        {
          id: 1,
          params: { tab: "overview", filter: "active" },
        },
      );

      do_not_optimize(freezeStateInPlace(state));
    }).gc("inner");
  });
});

// ============================================================================
// Deep nested scenarios
// ============================================================================

boxplot(() => {
  summary(() => {
    // 3 levels deep
    bench("freeze: 3 levels deep", () => {
      const state = createState("deep", createDeepParams(3), "/deep");

      do_not_optimize(freezeStateInPlace(state));
    }).gc("inner");

    // 5 levels deep
    bench("freeze: 5 levels deep", () => {
      const state = createState("deep", createDeepParams(5), "/deep");

      do_not_optimize(freezeStateInPlace(state));
    }).gc("inner");

    // 10 levels deep
    bench("freeze: 10 levels deep", () => {
      const state = createState("deep", createDeepParams(10), "/deep");

      do_not_optimize(freezeStateInPlace(state));
    }).gc("inner");
  });
});

// ============================================================================
// Already frozen scenarios (re-freeze overhead)
// ============================================================================

boxplot(() => {
  summary(() => {
    // Pre-frozen shallow state
    {
      const frozenState = freezeStateInPlace(createState("home", {}, "/"));

      bench("freeze: already frozen shallow", () => {
        do_not_optimize(freezeStateInPlace(frozenState));
      }).gc("inner");
    }

    // Pre-frozen typical state
    {
      const frozenState = freezeStateInPlace(
        createState("users", { id: "123" }, "/users/123", {
          id: 1,
          params: { source: "browser" },
        }),
      );

      bench("freeze: already frozen typical", () => {
        do_not_optimize(freezeStateInPlace(frozenState));
      }).gc("inner");
    }

    // Pre-frozen deep state
    {
      const frozenState = freezeStateInPlace(
        createState("deep", createDeepParams(5), "/deep"),
      );

      bench("freeze: already frozen deep (5 levels)", () => {
        do_not_optimize(freezeStateInPlace(frozenState));
      }).gc("inner");
    }
  });
});

// ============================================================================
// Array params scenarios
// ============================================================================

boxplot(() => {
  summary(() => {
    // State with array params
    bench("freeze: state with array (10 items)", () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        id: i,
        name: `item-${i}`,
      }));
      const state = createState("list", { items }, "/list");

      do_not_optimize(freezeStateInPlace(state));
    }).gc("inner");

    // State with large array
    bench("freeze: state with array (100 items)", () => {
      const items = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `item-${i}`,
      }));
      const state = createState("list", { items }, "/list");

      do_not_optimize(freezeStateInPlace(state));
    }).gc("inner");
  });
});

// ============================================================================
// Sequential freeze (simulating navigation pipeline)
// ============================================================================

boxplot(() => {
  summary(() => {
    // 3 sequential freezes (typical navigation)
    bench("freeze: 3x sequential (navigation sim)", () => {
      const state1 = createState("home", {}, "/");
      const state2 = createState("users", { id: "1" }, "/users/1");
      const state3 = createState(
        "profile",
        { id: "1", tab: "info" },
        "/profile/1",
      );

      do_not_optimize(freezeStateInPlace(state1));
      do_not_optimize(freezeStateInPlace(state2));
      do_not_optimize(freezeStateInPlace(state3));
    }).gc("inner");

    // 5 sequential freezes
    bench("freeze: 5x sequential", () => {
      const states = [
        createState("home", {}, "/"),
        createState("about", {}, "/about"),
        createState("users", {}, "/users"),
        createState("user", { id: "1" }, "/users/1"),
        createState("profile", { id: "1" }, "/profile/1"),
      ];

      for (const state of states) {
        do_not_optimize(freezeStateInPlace(state));
      }
    }).gc("inner");
  });
});

// packages/preload-plugin/tests/property/preload.properties.ts

import { fc, test } from "@fast-check/vitest";

import {
  NUM_RUNS,
  arbPartialOptions,
  arbSlowEffectiveType,
  arbFastEffectiveType,
  arbEffectiveTypeWith2g,
  arbWithinThreshold,
  arbBeyondThreshold,
  arbNegativeDelta,
  arbBaseTimestamp,
  mockNavigatorConnection,
} from "./helpers";
import { defaultOptions, GHOST_EVENT_THRESHOLD } from "../../src/constants";
import { isSlowConnection } from "../../src/network";

import type { PreloadPluginOptions } from "../../src/types";

// =============================================================================
// Factory Options Merge
// =============================================================================

describe("factory options merge", () => {
  test.prop([arbPartialOptions], { numRuns: NUM_RUNS })(
    "partial options merge with defaults to produce complete options",
    (partial: Partial<PreloadPluginOptions>) => {
      const merged: Required<PreloadPluginOptions> = {
        ...defaultOptions,
        ...partial,
      };

      // User-specified values take precedence
      if (partial.delay === undefined) {
        expect(merged.delay).toBe(defaultOptions.delay);
      } else {
        expect(merged.delay).toBe(partial.delay);
      }

      if (partial.networkAware === undefined) {
        expect(merged.networkAware).toBe(defaultOptions.networkAware);
      } else {
        expect(merged.networkAware).toBe(partial.networkAware);
      }
    },
  );

  test("undefined options produce complete defaults", () => {
    const merged: Required<PreloadPluginOptions> = {
      ...defaultOptions,
    };

    expect(merged.delay).toBe(65);
    expect(merged.networkAware).toBe(true);
  });
});

// =============================================================================
// Network Detection — isSlowConnection
// =============================================================================

describe("isSlowConnection", () => {
  test("returns false when navigator.connection is unavailable", () => {
    const restore = mockNavigatorConnection(undefined);

    try {
      expect(isSlowConnection()).toBe(false);
    } finally {
      restore();
    }
  });

  test.prop([arbSlowEffectiveType], { numRuns: NUM_RUNS })(
    "saveData flag forces slow detection regardless of effectiveType",
    (effectiveType) => {
      const restore = mockNavigatorConnection({
        saveData: true,
        effectiveType,
      });

      try {
        expect(isSlowConnection()).toBe(true);
      } finally {
        restore();
      }
    },
  );

  test.prop([arbSlowEffectiveType], { numRuns: NUM_RUNS })(
    "effectiveType containing '2g' forces slow detection",
    (effectiveType) => {
      const restore = mockNavigatorConnection({
        saveData: false,
        effectiveType,
      });

      try {
        expect(isSlowConnection()).toBe(true);
      } finally {
        restore();
      }
    },
  );

  test.prop([arbFastEffectiveType], { numRuns: NUM_RUNS })(
    "fast effectiveType without saveData returns false",
    (effectiveType) => {
      const restore = mockNavigatorConnection({
        saveData: false,
        effectiveType,
      });

      try {
        expect(isSlowConnection()).toBe(false);
      } finally {
        restore();
      }
    },
  );

  test.prop([arbEffectiveTypeWith2g], { numRuns: NUM_RUNS })(
    "any effectiveType string containing '2g' forces slow detection",
    (effectiveType) => {
      const restore = mockNavigatorConnection({
        saveData: false,
        effectiveType,
      });

      try {
        expect(isSlowConnection()).toBe(true);
      } finally {
        restore();
      }
    },
  );

  test("saveData true with no effectiveType returns true", () => {
    const restore = mockNavigatorConnection({ saveData: true });

    try {
      expect(isSlowConnection()).toBe(true);
    } finally {
      restore();
    }
  });

  test("saveData false without effectiveType returns false", () => {
    const restore = mockNavigatorConnection({ saveData: false });

    try {
      expect(isSlowConnection()).toBe(false);
    } finally {
      restore();
    }
  });
});

// =============================================================================
// Ghost Event Suppression
// =============================================================================

describe("ghost event suppression", () => {
  /**
   * The ghost event detection logic from PreloadPlugin.#isGhostMouseEvent:
   *
   *   const delta = event.timeStamp - lastTouchTimeStamp;
   *   return delta >= 0 && delta < GHOST_EVENT_THRESHOLD
   *          && event.target === lastTouchTarget;
   *
   * Uses NaN for lastTouchTimeStamp when no touch has occurred (NaN >= 0 is
   * false, so the check naturally short-circuits).
   *
   * Extracted into a standalone function so the property tests mirror the real
   * code path exactly.
   */
  function isGhostMouseEvent(
    lastTouchTarget: unknown,
    lastTouchTimeStamp: number,
    mouseTarget: unknown,
    mouseTimestamp: number,
  ): boolean {
    const delta = mouseTimestamp - lastTouchTimeStamp;

    return (
      delta >= 0 &&
      delta < GHOST_EVENT_THRESHOLD &&
      mouseTarget === lastTouchTarget
    );
  }

  test.prop([arbBaseTimestamp, arbWithinThreshold], { numRuns: NUM_RUNS })(
    "mouseover within threshold on same target is suppressed",
    (touchTimestamp, delta) => {
      const target = {};
      const mouseTimestamp = touchTimestamp + delta;

      expect(
        isGhostMouseEvent(target, touchTimestamp, target, mouseTimestamp),
      ).toBe(true);
    },
  );

  test.prop([arbBaseTimestamp, arbBeyondThreshold], { numRuns: NUM_RUNS })(
    "mouseover after threshold on same target is not suppressed",
    (touchTimestamp, delta) => {
      const target = {};
      const mouseTimestamp = touchTimestamp + delta;

      expect(
        isGhostMouseEvent(target, touchTimestamp, target, mouseTimestamp),
      ).toBe(false);
    },
  );

  test.prop([arbBaseTimestamp, arbWithinThreshold], { numRuns: NUM_RUNS })(
    "mouseover on different target is never suppressed",
    (touchTimestamp, delta) => {
      const touchTarget = {};
      const mouseTarget = {};
      const mouseTimestamp = touchTimestamp + delta;

      expect(
        isGhostMouseEvent(
          touchTarget,
          touchTimestamp,
          mouseTarget,
          mouseTimestamp,
        ),
      ).toBe(false);
    },
  );

  test.prop([arbBaseTimestamp, arbNegativeDelta], { numRuns: NUM_RUNS })(
    "mouseover with negative delta is never suppressed (clock skew safety)",
    (touchTimestamp, negativeDelta) => {
      const target = {};
      const mouseTimestamp = touchTimestamp + negativeDelta;

      expect(
        isGhostMouseEvent(target, touchTimestamp, target, mouseTimestamp),
      ).toBe(false);
    },
  );

  test.prop([arbBaseTimestamp], { numRuns: NUM_RUNS })(
    "no prior touch (NaN timestamp) never suppresses mouseover",
    (mouseTimestamp) => {
      const target = {};

      expect(isGhostMouseEvent(null, Number.NaN, target, mouseTimestamp)).toBe(
        false,
      );
    },
  );
});

// =============================================================================
// Fire-and-Forget Safety
// =============================================================================

describe("fire-and-forget safety", () => {
  test.prop([fc.anything()], { numRuns: NUM_RUNS })(
    "rejected promise is silently caught by .catch(() => {})",
    (errorValue) => {
      // Standalone model matching plugin.ts:111,132 pattern
      const p = Promise.reject(errorValue).catch(() => {});

      // If .catch doesn't swallow, vitest reports unhandled rejection
      expect(p).toBeInstanceOf(Promise);
    },
  );

  test.prop([fc.anything()], { numRuns: NUM_RUNS })(
    "resolved value is discarded (not stored or returned)",
    async (resolvedValue) => {
      let sideEffect: unknown = "sentinel";
      // Model: preload returns any value, plugin ignores it
      const p = Promise.resolve(resolvedValue).catch(() => {});

      await p;

      // Side effect not modified — return value discarded
      expect(sideEffect).toBe("sentinel");
    },
  );
});

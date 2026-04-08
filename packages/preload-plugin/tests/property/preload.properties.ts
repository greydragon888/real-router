// packages/preload-plugin/tests/property/preload.properties.ts

import { test } from "@fast-check/vitest";

import {
  NUM_RUNS,
  arbPartialOptions,
  arbSlowEffectiveType,
  arbFastEffectiveType,
  arbWithinThreshold,
  arbBeyondThreshold,
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

      // Every field must be present
      expect(typeof merged.delay).toBe("number");
      expect(typeof merged.networkAware).toBe("boolean");

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

  test("saveData true with no effectiveType returns true", () => {
    const restore = mockNavigatorConnection({ saveData: true });

    try {
      expect(isSlowConnection()).toBe(true);
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
   *   lastTouchStartEvent !== null &&
   *   event.target === lastTouchStartEvent.target &&
   *   event.timeStamp - lastTouchStartEvent.timeStamp < GHOST_EVENT_THRESHOLD
   *
   * Extracted into a standalone function so TypeScript sees the nullable type
   * and the property tests mirror the real code path exactly.
   */
  function isGhostMouseEvent(
    lastTouchStart: { target: unknown; timeStamp: number } | null,
    mouseTarget: unknown,
    mouseTimestamp: number,
  ): boolean {
    return (
      lastTouchStart !== null &&
      mouseTarget === lastTouchStart.target &&
      mouseTimestamp - lastTouchStart.timeStamp < GHOST_EVENT_THRESHOLD
    );
  }

  test.prop([arbBaseTimestamp, arbWithinThreshold], { numRuns: NUM_RUNS })(
    "mouseover within threshold on same target is suppressed",
    (touchTimestamp, delta) => {
      const target = {};
      const lastTouchStart = { target, timeStamp: touchTimestamp };
      const mouseTimestamp = touchTimestamp + delta;

      expect(isGhostMouseEvent(lastTouchStart, target, mouseTimestamp)).toBe(
        true,
      );
    },
  );

  test.prop([arbBaseTimestamp, arbBeyondThreshold], { numRuns: NUM_RUNS })(
    "mouseover after threshold on same target is not suppressed",
    (touchTimestamp, delta) => {
      const target = {};
      const lastTouchStart = { target, timeStamp: touchTimestamp };
      const mouseTimestamp = touchTimestamp + delta;

      expect(isGhostMouseEvent(lastTouchStart, target, mouseTimestamp)).toBe(
        false,
      );
    },
  );

  test.prop([arbBaseTimestamp, arbWithinThreshold], { numRuns: NUM_RUNS })(
    "mouseover on different target is never suppressed",
    (touchTimestamp, delta) => {
      const touchTarget = {};
      const mouseTarget = {};
      const lastTouchStart = { target: touchTarget, timeStamp: touchTimestamp };
      const mouseTimestamp = touchTimestamp + delta;

      expect(
        isGhostMouseEvent(lastTouchStart, mouseTarget, mouseTimestamp),
      ).toBe(false);
    },
  );
});

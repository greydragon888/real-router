/**
 * isNavigationOptions benchmarks
 *
 * Tests validation performance:
 * - Empty options (most common case)
 * - Single field
 * - All fields
 * - Invalid values (early exit)
 * - Sequential calls (navigation simulation)
 */

import { bench, boxplot, do_not_optimize, summary } from "mitata";
import { isNavigationOptions } from "type-guards";

// ============================================================================
// Basic scenarios
// ============================================================================

boxplot(() => {
  summary(() => {
    // Empty options - most common case
    bench("isNavigationOptions: empty {}", () => {
      do_not_optimize(isNavigationOptions({}));
    }).gc("inner");

    // Single field - typical usage
    bench("isNavigationOptions: { replace: true }", () => {
      do_not_optimize(isNavigationOptions({ replace: true }));
    }).gc("inner");

    // Two fields
    bench("isNavigationOptions: { replace, reload }", () => {
      do_not_optimize(isNavigationOptions({ replace: true, reload: false }));
    }).gc("inner");

    // All fields
    bench("isNavigationOptions: all 6 fields", () => {
      do_not_optimize(
        isNavigationOptions({
          replace: true,
          reload: false,
          skipTransition: true,
          force: false,
          forceDeactivate: true,
          redirected: false,
        }),
      );
    }).gc("inner");
  });
});

// ============================================================================
// Invalid values (early exit)
// ============================================================================

boxplot(() => {
  summary(() => {
    // null - immediate exit
    bench("isNavigationOptions: null (invalid)", () => {
      do_not_optimize(isNavigationOptions(null));
    }).gc("inner");

    // array - immediate exit
    bench("isNavigationOptions: [] (invalid)", () => {
      do_not_optimize(isNavigationOptions([]));
    }).gc("inner");

    // Invalid field type - should exit on first invalid
    bench("isNavigationOptions: { replace: 'true' } (invalid)", () => {
      do_not_optimize(isNavigationOptions({ replace: "true" }));
    }).gc("inner");

    // Invalid field in middle
    bench("isNavigationOptions: { force: 123 } (invalid)", () => {
      do_not_optimize(isNavigationOptions({ force: 123 }));
    }).gc("inner");
  });
});

// ============================================================================
// Sequential calls (navigation simulation)
// ============================================================================

boxplot(() => {
  summary(() => {
    // 3 sequential calls (typical navigation)
    bench("isNavigationOptions: 3x sequential", () => {
      const opts1 = {};
      const opts2 = { replace: true };
      const opts3 = { reload: true, force: false };

      do_not_optimize(isNavigationOptions(opts1));
      do_not_optimize(isNavigationOptions(opts2));
      do_not_optimize(isNavigationOptions(opts3));
    }).gc("inner");

    // 5 sequential calls
    bench("isNavigationOptions: 5x sequential", () => {
      const opts = [
        {},
        { replace: true },
        { reload: true },
        { skipTransition: true, force: false },
        { replace: true, reload: false, force: true },
      ];

      for (const opt of opts) {
        do_not_optimize(isNavigationOptions(opt));
      }
    }).gc("inner");
  });
});

// ============================================================================
// Extra fields (should still validate)
// ============================================================================

boxplot(() => {
  summary(() => {
    // Object with extra fields
    bench("isNavigationOptions: with extra fields", () => {
      do_not_optimize(
        isNavigationOptions({
          replace: true,
          customField: "value",
          anotherField: 123,
        }),
      );
    }).gc("inner");

    // Large object with many extra fields
    bench("isNavigationOptions: 20 extra fields", () => {
      const opts: Record<string, unknown> = { replace: true };

      for (let i = 0; i < 20; i++) {
        opts[`extra${i}`] = i;
      }

      do_not_optimize(isNavigationOptions(opts));
    }).gc("inner");
  });
});

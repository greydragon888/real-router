/**
 * isNavigationOptions benchmarks
 *
 * Tests navigation options validation performance:
 * - Accepting valid NavigationOptions
 * - Rejecting invalid NavigationOptions
 * - Edge cases
 */

import { bench, boxplot, summary } from "mitata";

import { isNavigationOptions } from "type-guards";

// Successful cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isNavigationOptions: empty object", () => {
      isNavigationOptions({});
    });

    bench("isNavigationOptions: with replace", () => {
      isNavigationOptions({ replace: true });
    });

    bench("isNavigationOptions: with reload", () => {
      isNavigationOptions({ reload: true });
    });

    bench("isNavigationOptions: with force", () => {
      isNavigationOptions({ force: true });
    });

    bench("isNavigationOptions: with forceDeactivate", () => {
      isNavigationOptions({ forceDeactivate: true });
    });

    bench("isNavigationOptions: with redirected", () => {
      isNavigationOptions({ redirected: true });
    });

    bench("isNavigationOptions: all options true", () => {
      isNavigationOptions({
        replace: true,
        reload: true,
        force: true,
        forceDeactivate: true,
        redirected: true,
      });
    });

    bench("isNavigationOptions: all options false", () => {
      isNavigationOptions({
        replace: false,
        reload: false,
        force: false,
        forceDeactivate: false,
        redirected: false,
      });
    });

    bench("isNavigationOptions: mixed boolean values", () => {
      isNavigationOptions({
        replace: true,
        reload: false,
        force: true,
      });
    });

    bench("isNavigationOptions: partial options", () => {
      isNavigationOptions({ replace: true, reload: true });
    });
  });
});

// Rejection cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isNavigationOptions: reject null", () => {
      isNavigationOptions(null);
    });

    bench("isNavigationOptions: reject undefined", () => {
      isNavigationOptions(undefined);
    });

    bench("isNavigationOptions: reject string replace", () => {
      isNavigationOptions({ replace: "true" } as any);
    });

    bench("isNavigationOptions: reject number reload", () => {
      isNavigationOptions({ reload: 1 } as any);
    });

    bench("isNavigationOptions: reject object force", () => {
      isNavigationOptions({ force: {} } as any);
    });

    bench("isNavigationOptions: reject array forceDeactivate", () => {
      isNavigationOptions({ forceDeactivate: [] } as any);
    });

    bench("isNavigationOptions: reject function redirected", () => {
      isNavigationOptions({ redirected: (() => {}) as any });
    });

    bench("isNavigationOptions: reject mixed valid and invalid", () => {
      isNavigationOptions({
        replace: true,
        reload: "false",
      } as any);
    });

    bench("isNavigationOptions: reject number", () => {
      isNavigationOptions(123 as any);
    });

    bench("isNavigationOptions: reject string", () => {
      isNavigationOptions("options" as any);
    });

    bench("isNavigationOptions: reject array", () => {
      isNavigationOptions([] as any);
    });
  });
});

// Edge cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isNavigationOptions: extra properties", () => {
      isNavigationOptions({
        replace: true,
        extra: "ignored",
      } as any);
    });

    bench("isNavigationOptions: undefined values", () => {
      isNavigationOptions({
        replace: undefined,
        reload: undefined,
      });
    });

    bench("isNavigationOptions: single option", () => {
      isNavigationOptions({ replace: false });
    });
  });
});

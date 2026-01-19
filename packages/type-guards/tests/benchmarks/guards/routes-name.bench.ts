/**
 * validateRouteName benchmarks
 *
 * Tests route name validation performance:
 * - Accepting valid route names
 * - Rejecting invalid route names (throws errors)
 * - Edge cases
 */

/* eslint-disable no-empty */
import { bench, boxplot, summary } from "mitata";

import { validateRouteName } from "type-guards";

const methodName = "testMethod";

// Successful cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("validateRouteName: simple name", () => {
      validateRouteName("home", methodName);
    });

    bench("validateRouteName: with underscore", () => {
      validateRouteName("user_profile", methodName);
    });

    bench("validateRouteName: with hyphen", () => {
      validateRouteName("admin-panel", methodName);
    });

    bench("validateRouteName: with number", () => {
      validateRouteName("route123", methodName);
    });

    bench("validateRouteName: dotted path", () => {
      validateRouteName("users.profile", methodName);
    });

    bench("validateRouteName: deep nested", () => {
      validateRouteName("admin.users.profile.edit", methodName);
    });

    bench("validateRouteName: uppercase start", () => {
      validateRouteName("HomePage", methodName);
    });

    bench("validateRouteName: mixed case", () => {
      validateRouteName("userProfile", methodName);
    });

    bench("validateRouteName: system route", () => {
      validateRouteName("@@router6/UNKNOWN_ROUTE", methodName);
    });

    bench("validateRouteName: long name", () => {
      validateRouteName("a".repeat(100), methodName);
    });

    bench("validateRouteName: complex valid name", () => {
      validateRouteName("API_v2.users.get-by-id", methodName);
    });
  });
});

// Rejection cases - should throw - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("validateRouteName: reject non-string (catches error)", () => {
      try {
        validateRouteName(123 as any, methodName);
      } catch {}
    });

    bench("validateRouteName: reject empty string (catches error)", () => {
      try {
        validateRouteName("", methodName);
      } catch {}
    });

    bench("validateRouteName: reject whitespace only (catches error)", () => {
      try {
        validateRouteName("   ", methodName);
      } catch {}
    });

    bench("validateRouteName: reject starts with dot (catches error)", () => {
      try {
        validateRouteName(".users", methodName);
      } catch {}
    });

    bench("validateRouteName: reject ends with dot (catches error)", () => {
      try {
        validateRouteName("users.", methodName);
      } catch {}
    });

    bench("validateRouteName: reject consecutive dots (catches error)", () => {
      try {
        validateRouteName("users..profile", methodName);
      } catch {}
    });

    bench(
      "validateRouteName: reject starts with number (catches error)",
      () => {
        try {
          validateRouteName("123route", methodName);
        } catch {}
      },
    );

    bench(
      "validateRouteName: reject starts with hyphen (catches error)",
      () => {
        try {
          validateRouteName("-route", methodName);
        } catch {}
      },
    );

    bench("validateRouteName: reject with space (catches error)", () => {
      try {
        validateRouteName("user profile", methodName);
      } catch {}
    });

    bench("validateRouteName: reject with special char (catches error)", () => {
      try {
        validateRouteName("user@profile", methodName);
      } catch {}
    });

    bench("validateRouteName: reject too long (catches error)", () => {
      try {
        validateRouteName("a".repeat(10_001), methodName);
      } catch {}
    });

    bench("validateRouteName: reject unicode (catches error)", () => {
      try {
        validateRouteName("пользователь", methodName);
      } catch {}
    });
  });
});

// Edge cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("validateRouteName: single character", () => {
      validateRouteName("a", methodName);
    });

    bench("validateRouteName: single underscore", () => {
      validateRouteName("_", methodName);
    });

    bench("validateRouteName: at max length", () => {
      validateRouteName("a".repeat(10_000), methodName);
    });

    bench("validateRouteName: many segments", () => {
      validateRouteName("a.b.c.d.e.f.g.h.i.j", methodName);
    });

    bench("validateRouteName: numbers after letters", () => {
      validateRouteName("route123.path456", methodName);
    });

    bench("validateRouteName: mixed separators", () => {
      validateRouteName("user_profile.edit-form", methodName);
    });
  });
});

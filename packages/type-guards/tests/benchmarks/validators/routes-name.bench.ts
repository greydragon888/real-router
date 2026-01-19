/**
 * validateRouteName benchmarks
 *
 * Tests route name validation performance:
 * - Accepting valid route names (alphanumeric, dotted paths, system routes)
 * - Rejecting invalid names and throwing errors
 * - Edge cases with special characters and length limits
 */

/* eslint-disable no-empty */
import { bench, boxplot, summary } from "mitata";

import { validateRouteName } from "type-guards";

const methodName = "addRoute";

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

    bench("validateRouteName: dotted path (2 segments)", () => {
      validateRouteName("users.profile", methodName);
    });

    bench("validateRouteName: dotted path (3 segments)", () => {
      validateRouteName("admin.users.edit", methodName);
    });

    bench("validateRouteName: deep nested (4 segments)", () => {
      validateRouteName("admin.users.profile.edit", methodName);
    });

    bench("validateRouteName: very deep nested (8 segments)", () => {
      validateRouteName("a.b.c.d.e.f.g.h", methodName);
    });

    bench("validateRouteName: uppercase start", () => {
      validateRouteName("HomePage", methodName);
    });

    bench("validateRouteName: mixed case", () => {
      validateRouteName("userProfile", methodName);
    });

    bench("validateRouteName: camelCase", () => {
      validateRouteName("getUserById", methodName);
    });

    bench("validateRouteName: snake_case", () => {
      validateRouteName("get_user_by_id", methodName);
    });

    bench("validateRouteName: kebab-case", () => {
      validateRouteName("get-user-by-id", methodName);
    });

    bench("validateRouteName: system route", () => {
      validateRouteName("@@router6/UNKNOWN_ROUTE", methodName);
    });

    bench("validateRouteName: system route (short)", () => {
      validateRouteName("@@error", methodName);
    });

    bench("validateRouteName: long name (100 chars)", () => {
      validateRouteName("a".repeat(100), methodName);
    });

    bench("validateRouteName: long name (1000 chars)", () => {
      validateRouteName("a".repeat(1000), methodName);
    });

    bench("validateRouteName: at max length (10000 chars)", () => {
      validateRouteName("a".repeat(10_000), methodName);
    });

    bench("validateRouteName: complex valid name", () => {
      validateRouteName("API_v2.users.get-by-id", methodName);
    });

    bench("validateRouteName: with mixed separators", () => {
      validateRouteName("user_profile.edit-form.save_action", methodName);
    });

    bench("validateRouteName: numbers and letters", () => {
      validateRouteName("route123.path456.item789", methodName);
    });

    bench("validateRouteName: single character", () => {
      validateRouteName("a", methodName);
    });

    bench("validateRouteName: single underscore", () => {
      validateRouteName("_", methodName);
    });

    bench("validateRouteName: starts with underscore", () => {
      validateRouteName("_private", methodName);
    });

    bench("validateRouteName: double underscore prefix", () => {
      validateRouteName("__internal", methodName);
    });

    bench("validateRouteName: all uppercase", () => {
      validateRouteName("API_ENDPOINT", methodName);
    });
  });
});

// Rejection cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("validateRouteName: non-string number (catches error)", () => {
      try {
        validateRouteName(123 as any, methodName);
      } catch {}
    });

    bench("validateRouteName: non-string null (catches error)", () => {
      try {
        validateRouteName(null as any, methodName);
      } catch {}
    });

    bench("validateRouteName: non-string undefined (catches error)", () => {
      try {
        validateRouteName(undefined as any, methodName);
      } catch {}
    });

    bench("validateRouteName: non-string object (catches error)", () => {
      try {
        validateRouteName({} as any, methodName);
      } catch {}
    });

    bench("validateRouteName: non-string array (catches error)", () => {
      try {
        validateRouteName([] as any, methodName);
      } catch {}
    });

    bench("validateRouteName: empty string (catches error)", () => {
      try {
        validateRouteName("", methodName);
      } catch {}
    });

    bench("validateRouteName: whitespace only (catches error)", () => {
      try {
        validateRouteName("   ", methodName);
      } catch {}
    });

    bench("validateRouteName: starts with dot (catches error)", () => {
      try {
        validateRouteName(".users", methodName);
      } catch {}
    });

    bench("validateRouteName: ends with dot (catches error)", () => {
      try {
        validateRouteName("users.", methodName);
      } catch {}
    });

    bench("validateRouteName: consecutive dots (catches error)", () => {
      try {
        validateRouteName("users..profile", methodName);
      } catch {}
    });

    bench("validateRouteName: starts with number (catches error)", () => {
      try {
        validateRouteName("123route", methodName);
      } catch {}
    });

    bench("validateRouteName: starts with hyphen (catches error)", () => {
      try {
        validateRouteName("-route", methodName);
      } catch {}
    });

    bench("validateRouteName: with space (catches error)", () => {
      try {
        validateRouteName("user profile", methodName);
      } catch {}
    });

    bench("validateRouteName: with @ symbol (catches error)", () => {
      try {
        validateRouteName("user@profile", methodName);
      } catch {}
    });

    bench("validateRouteName: with # symbol (catches error)", () => {
      try {
        validateRouteName("user#profile", methodName);
      } catch {}
    });

    bench("validateRouteName: too long (10001 chars) (catches error)", () => {
      try {
        validateRouteName("a".repeat(10_001), methodName);
      } catch {}
    });

    bench("validateRouteName: unicode cyrillic (catches error)", () => {
      try {
        validateRouteName("пользователь", methodName);
      } catch {}
    });

    bench("validateRouteName: emoji (catches error)", () => {
      try {
        validateRouteName("🚀", methodName);
      } catch {}
    });

    bench(
      "validateRouteName: invalid segment in dotted path (catches error)",
      () => {
        try {
          validateRouteName("users.123profile", methodName);
        } catch {}
      },
    );
  });
});

// Edge cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("validateRouteName: single character a", () => {
      validateRouteName("a", methodName);
    });

    bench("validateRouteName: single character Z", () => {
      validateRouteName("Z", methodName);
    });

    bench("validateRouteName: many segments (10)", () => {
      validateRouteName("a.b.c.d.e.f.g.h.i.j", methodName);
    });

    bench("validateRouteName: many segments (20)", () => {
      validateRouteName("a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q.r.s.t", methodName);
    });

    bench("validateRouteName: numbers after letters", () => {
      validateRouteName("route123.path456", methodName);
    });

    bench("validateRouteName: mixed separators", () => {
      validateRouteName("user_profile.edit-form", methodName);
    });

    bench("validateRouteName: all valid special chars", () => {
      validateRouteName("user_123-test.path_456-route", methodName);
    });

    bench("validateRouteName: different method names", () => {
      validateRouteName("home", "customMethod");
    });

    bench("validateRouteName: system route edge case", () => {
      validateRouteName("@@..invalid..normally", methodName);
    });

    bench("validateRouteName: system route with special chars", () => {
      validateRouteName("@@has spaces and special chars!@#$%", methodName);
    });
  });
});

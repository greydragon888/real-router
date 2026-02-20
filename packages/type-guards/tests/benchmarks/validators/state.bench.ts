/**
 * validateState benchmarks
 *
 * Tests state validation performance:
 * - Accepting valid state objects
 * - Rejecting invalid states and throwing errors
 * - Edge cases with nested params and meta fields
 */

/* eslint-disable no-empty */
import { bench, boxplot, summary } from "mitata";

import { validateState } from "type-guards";

const methodName = "navigate";

// Successful cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("validateState: minimal state", () => {
      validateState({ name: "home", params: {}, path: "/" }, methodName);
    });

    bench("validateState: with simple params", () => {
      validateState(
        {
          name: "user",
          params: { id: "123" },
          path: "/users/123",
        },
        methodName,
      );
    });

    bench("validateState: with meta", () => {
      validateState(
        {
          name: "profile",
          params: { userId: "456" },
          path: "/profile/456",
          meta: { id: 1 },
        },
        methodName,
      );
    });

    bench("validateState: with complex params", () => {
      validateState(
        {
          name: "search",
          params: {
            query: "test",
            filters: ["active", "recent"],
            page: 1,
          },
          path: "/search",
        },
        methodName,
      );
    });

    bench("validateState: nested route", () => {
      validateState(
        {
          name: "admin.users.edit",
          params: { userId: "789" },
          path: "/admin/users/789/edit",
        },
        methodName,
      );
    });

    bench("validateState: with all meta fields", () => {
      validateState(
        {
          name: "dashboard",
          params: {},
          path: "/dashboard",
          meta: {
            id: 42,
            params: {},
            options: { reload: true },
          },
        },
        methodName,
      );
    });

    bench("validateState: with nested params", () => {
      validateState(
        {
          name: "api.v2.users",
          params: {
            filters: {
              status: "active",
              role: "admin",
            },
            pagination: {
              page: 1,
              limit: 20,
            },
          },
          path: "/api/v2/users",
        },
        methodName,
      );
    });

    bench("validateState: with array params", () => {
      validateState(
        {
          name: "products.list",
          params: {
            categories: ["electronics", "computers", "laptops"],
            tags: ["sale", "new"],
          },
          path: "/products",
        },
        methodName,
      );
    });

    bench("validateState: with history state meta", () => {
      validateState(
        {
          name: "checkout",
          params: { cartId: "abc123" },
          path: "/checkout",
          meta: {
            id: 99,
            params: { cartId: "abc123" },
            options: {
              replace: false,
              reload: false,
              force: false,
            },
          },
        },
        methodName,
      );
    });

    bench("validateState: long route name", () => {
      validateState(
        {
          name: "a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p",
          params: {},
          path: "/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p",
        },
        methodName,
      );
    });
  });
});

// Rejection cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("validateState: null (catches error)", () => {
      try {
        validateState(null, methodName);
      } catch {}
    });

    bench("validateState: undefined (catches error)", () => {
      try {
        validateState(undefined, methodName);
      } catch {}
    });

    bench("validateState: missing name (catches error)", () => {
      try {
        validateState({ params: {}, path: "/" } as any, methodName);
      } catch {}
    });

    bench("validateState: missing params (catches error)", () => {
      try {
        validateState({ name: "home", path: "/" } as any, methodName);
      } catch {}
    });

    bench("validateState: missing path (catches error)", () => {
      try {
        validateState({ name: "home", params: {} } as any, methodName);
      } catch {}
    });

    bench("validateState: number (catches error)", () => {
      try {
        validateState(123, methodName);
      } catch {}
    });

    bench("validateState: string (catches error)", () => {
      try {
        validateState("state", methodName);
      } catch {}
    });

    bench("validateState: array (catches error)", () => {
      try {
        validateState([], methodName);
      } catch {}
    });

    bench("validateState: function (catches error)", () => {
      try {
        validateState(() => {}, methodName);
      } catch {}
    });

    bench("validateState: invalid name type (catches error)", () => {
      try {
        validateState(
          {
            name: 123,
            params: {},
            path: "/",
          } as any,
          methodName,
        );
      } catch {}
    });

    bench("validateState: invalid params type (catches error)", () => {
      try {
        validateState(
          {
            name: "home",
            params: "invalid",
            path: "/",
          } as any,
          methodName,
        );
      } catch {}
    });

    bench("validateState: invalid path type (catches error)", () => {
      try {
        validateState(
          {
            name: "home",
            params: {},
            path: 123,
          } as any,
          methodName,
        );
      } catch {}
    });

    bench("validateState: empty object (catches error)", () => {
      try {
        validateState({}, methodName);
      } catch {}
    });

    bench("validateState: invalid route name (catches error)", () => {
      try {
        validateState(
          {
            name: "123invalid",
            params: {},
            path: "/",
          },
          methodName,
        );
      } catch {}
    });

    bench("validateState: invalid route path (catches error)", () => {
      try {
        validateState(
          {
            name: "home",
            params: {},
            path: "//invalid",
          },
          methodName,
        );
      } catch {}
    });
  });
});

// Edge cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("validateState: empty name (catches error)", () => {
      try {
        validateState({ name: "", params: {}, path: "/" }, methodName);
      } catch {}
    });

    bench("validateState: empty path", () => {
      validateState({ name: "root", params: {}, path: "" }, methodName);
    });

    bench("validateState: empty params", () => {
      validateState({ name: "home", params: {}, path: "/" }, methodName);
    });

    bench("validateState: extra properties", () => {
      validateState(
        {
          name: "test",
          params: {},
          path: "/test",
          extra: "ignored",
          another: 42,
        } as any,
        methodName,
      );
    });

    bench("validateState: single char name", () => {
      validateState({ name: "a", params: {}, path: "/" }, methodName);
    });

    bench("validateState: system route", () => {
      validateState(
        {
          name: "@@router/UNKNOWN_ROUTE",
          params: {},
          path: "/unknown",
        },
        methodName,
      );
    });

    bench("validateState: with null meta (catches error)", () => {
      try {
        validateState(
          {
            name: "test",
            params: {},
            path: "/test",
            meta: null,
          } as any,
          methodName,
        );
      } catch {}
    });

    bench("validateState: very long route name", () => {
      validateState(
        {
          name: "a".repeat(1000),
          params: {},
          path: "/",
        },
        methodName,
      );
    });

    bench("validateState: many params", () => {
      validateState(
        {
          name: "api",
          params: {
            p1: "v1",
            p2: "v2",
            p3: "v3",
            p4: "v4",
            p5: "v5",
            p6: "v6",
            p7: "v7",
            p8: "v8",
            p9: "v9",
            p10: "v10",
          },
          path: "/api",
        },
        methodName,
      );
    });

    bench("validateState: different method names", () => {
      validateState({ name: "home", params: {}, path: "/" }, "customMethod");
    });
  });
});

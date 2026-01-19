/**
 * isStateStrict benchmarks
 *
 * Tests strict state validation performance:
 * - Accepting valid strict state objects (primitives and arrays only in params)
 * - Rejecting nested objects in params
 * - Edge cases with meta and optional fields
 */

import { bench, boxplot, summary } from "mitata";

import { isStateStrict } from "type-guards";

// Successful cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isStateStrict: minimal state", () => {
      isStateStrict({ name: "home", params: {}, path: "/" });
    });

    bench("isStateStrict: with simple params", () => {
      isStateStrict({
        name: "user",
        params: { id: "123", active: true },
        path: "/users/123",
      });
    });

    bench("isStateStrict: with meta", () => {
      isStateStrict({
        name: "profile",
        params: { userId: "456" },
        path: "/profile/456",
        meta: { id: 1, redirected: false },
      });
    });

    bench("isStateStrict: with array params", () => {
      isStateStrict({
        name: "search",
        params: { tags: ["typescript", "testing"] },
        path: "/search",
      });
    });

    bench("isStateStrict: with all meta fields", () => {
      isStateStrict({
        name: "dashboard",
        params: { view: "grid" },
        path: "/dashboard",
        meta: {
          id: 42,
          params: { previous: "home" },
          options: { reload: true },
          redirected: false,
          source: "navigation",
        },
      });
    });

    bench("isStateStrict: nested route name", () => {
      isStateStrict({
        name: "admin.users.list",
        params: { page: 1 },
        path: "/admin/users",
      });
    });
  });
});

// Rejection cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isStateStrict: reject null", () => {
      isStateStrict(null);
    });

    bench("isStateStrict: reject undefined", () => {
      isStateStrict(undefined);
    });

    bench("isStateStrict: reject wrong name type", () => {
      isStateStrict({ name: 123, params: {}, path: "/" } as any);
    });

    bench("isStateStrict: reject wrong path type", () => {
      isStateStrict({ name: "home", params: {}, path: 123 } as any);
    });

    bench("isStateStrict: reject wrong params type", () => {
      isStateStrict({ name: "home", params: "invalid", path: "/" } as any);
    });

    bench("isStateStrict: reject nested object in params", () => {
      isStateStrict({
        name: "test",
        params: { nested: { value: 1 } },
        path: "/test",
      });
    });

    bench("isStateStrict: reject function in params", () => {
      isStateStrict({
        name: "test",
        params: { callback: () => {} },
        path: "/test",
      } as any);
    });

    bench("isStateStrict: reject invalid meta type", () => {
      isStateStrict({
        name: "test",
        params: {},
        path: "/test",
        meta: "invalid",
      } as any);
    });

    bench("isStateStrict: reject invalid meta.id type", () => {
      isStateStrict({
        name: "test",
        params: {},
        path: "/test",
        meta: { id: "not-a-number" },
      } as any);
    });

    bench("isStateStrict: reject invalid meta.params type", () => {
      isStateStrict({
        name: "test",
        params: {},
        path: "/test",
        meta: { params: { nested: { invalid: true } } },
      } as any);
    });
  });
});

// Edge cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isStateStrict: empty strings", () => {
      isStateStrict({ name: "", params: {}, path: "" });
    });

    bench("isStateStrict: null in params", () => {
      isStateStrict({
        name: "test",
        params: { optional: null },
        path: "/test",
      });
    });

    bench("isStateStrict: undefined in params", () => {
      isStateStrict({
        name: "test",
        params: { missing: undefined },
        path: "/test",
      });
    });

    bench("isStateStrict: empty meta", () => {
      isStateStrict({
        name: "test",
        params: {},
        path: "/test",
        meta: {},
      });
    });
  });
});

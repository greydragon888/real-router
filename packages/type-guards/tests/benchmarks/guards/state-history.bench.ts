/**
 * isHistoryState benchmarks
 *
 * Tests history state validation performance:
 * - Accepting valid HistoryState objects with meta
 * - Rejecting invalid states or meta fields
 * - Edge cases with optional meta properties
 */

import { bench, boxplot, summary } from "mitata";

import { isHistoryState } from "type-guards";

// Successful cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isHistoryState: minimal history state", () => {
      isHistoryState({
        name: "home",
        params: {},
        path: "/",
        meta: {},
      });
    });

    bench("isHistoryState: with id", () => {
      isHistoryState({
        name: "user",
        params: { id: "123" },
        path: "/users/123",
        meta: { id: 1 },
      });
    });

    bench("isHistoryState: with params in meta", () => {
      isHistoryState({
        name: "search",
        params: { query: "test" },
        path: "/search",
        meta: { params: { previous: "home" } },
      });
    });

    bench("isHistoryState: with options", () => {
      isHistoryState({
        name: "profile",
        params: {},
        path: "/profile",
        meta: { options: { reload: true } },
      });
    });

    bench("isHistoryState: with redirected", () => {
      isHistoryState({
        name: "login",
        params: {},
        path: "/login",
        meta: { redirected: true, source: "/protected" },
      });
    });

    bench("isHistoryState: with all meta fields", () => {
      isHistoryState({
        name: "dashboard",
        params: { view: "grid" },
        path: "/dashboard",
        meta: {
          id: 42,
          params: { from: "home" },
          options: { replace: true },
          redirected: false,
          source: "navigation",
        },
      });
    });

    bench("isHistoryState: nested route", () => {
      isHistoryState({
        name: "admin.users.edit",
        params: { userId: "789" },
        path: "/admin/users/789/edit",
        meta: { id: 10, source: "edit-button" },
      });
    });
  });
});

// Rejection cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isHistoryState: reject null", () => {
      isHistoryState(null);
    });

    bench("isHistoryState: reject undefined", () => {
      isHistoryState(undefined);
    });

    bench("isHistoryState: reject missing meta", () => {
      isHistoryState({
        name: "home",
        params: {},
        path: "/",
      } as any);
    });

    bench("isHistoryState: reject null meta", () => {
      isHistoryState({
        name: "home",
        params: {},
        path: "/",
        meta: null,
      } as any);
    });

    bench("isHistoryState: reject wrong name type", () => {
      isHistoryState({
        name: 123,
        params: {},
        path: "/",
        meta: {},
      } as any);
    });

    bench("isHistoryState: reject wrong path type", () => {
      isHistoryState({
        name: "home",
        params: {},
        path: 123,
        meta: {},
      } as any);
    });

    bench("isHistoryState: reject wrong params type", () => {
      isHistoryState({
        name: "home",
        params: "invalid",
        path: "/",
        meta: {},
      } as any);
    });

    bench("isHistoryState: reject invalid meta.id type", () => {
      isHistoryState({
        name: "home",
        params: {},
        path: "/",
        meta: { id: "not-a-number" },
      } as any);
    });

    bench("isHistoryState: reject invalid meta.params type", () => {
      isHistoryState({
        name: "home",
        params: {},
        path: "/",
        meta: { params: { nested: { invalid: true } } },
      } as any);
    });

    bench("isHistoryState: reject invalid meta.options type", () => {
      isHistoryState({
        name: "home",
        params: {},
        path: "/",
        meta: { options: "invalid" },
      } as any);
    });

    bench("isHistoryState: reject invalid meta.redirected type", () => {
      isHistoryState({
        name: "home",
        params: {},
        path: "/",
        meta: { redirected: "yes" },
      } as any);
    });

    bench("isHistoryState: reject invalid meta.source type", () => {
      isHistoryState({
        name: "home",
        params: {},
        path: "/",
        meta: { source: 123 },
      } as any);
    });
  });
});

// Edge cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isHistoryState: empty strings", () => {
      isHistoryState({
        name: "",
        params: {},
        path: "",
        meta: {},
      });
    });

    bench("isHistoryState: null in params", () => {
      isHistoryState({
        name: "test",
        params: { optional: null },
        path: "/test",
        meta: {},
      });
    });

    bench("isHistoryState: undefined in meta.params", () => {
      isHistoryState({
        name: "test",
        params: {},
        path: "/test",
        meta: { params: { missing: undefined } },
      });
    });

    bench("isHistoryState: extra meta fields", () => {
      isHistoryState({
        name: "test",
        params: {},
        path: "/test",
        meta: { extra: "ignored", another: 42 },
      } as any);
    });
  });
});

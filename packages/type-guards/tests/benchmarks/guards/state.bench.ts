/**
 * isState benchmarks
 *
 * Tests state validation performance:
 * - Accepting valid state objects
 * - Rejecting invalid state objects
 * - Edge cases
 */

import { bench, boxplot, summary } from "mitata";

import { isState } from "type-guards";

// Successful cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isState: minimal state", () => {
      isState({ name: "home", params: {}, path: "/" });
    });

    bench("isState: with simple params", () => {
      isState({
        name: "user",
        params: { id: "123" },
        path: "/users/123",
      });
    });

    bench("isState: with meta", () => {
      isState({
        name: "profile",
        params: { userId: "456" },
        path: "/profile/456",
        meta: { id: 1 },
      });
    });

    bench("isState: with complex params", () => {
      isState({
        name: "search",
        params: {
          query: "test",
          filters: ["active", "recent"],
          page: 1,
        },
        path: "/search",
      });
    });

    bench("isState: nested route", () => {
      isState({
        name: "admin.users.edit",
        params: { userId: "789" },
        path: "/admin/users/789/edit",
      });
    });

    bench("isState: with all meta fields", () => {
      isState({
        name: "dashboard",
        params: {},
        path: "/dashboard",
        meta: {
          id: 42,
          params: {},
        },
      });
    });
  });
});

// Rejection cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isState: reject null", () => {
      isState(null);
    });

    bench("isState: reject undefined", () => {
      isState(undefined);
    });

    bench("isState: reject missing name", () => {
      isState({ params: {}, path: "/" } as any);
    });

    bench("isState: reject missing params", () => {
      isState({ name: "home", path: "/" } as any);
    });

    bench("isState: reject missing path", () => {
      isState({ name: "home", params: {} } as any);
    });

    bench("isState: reject number", () => {
      isState(123);
    });

    bench("isState: reject string", () => {
      isState("state");
    });

    bench("isState: reject array", () => {
      isState([]);
    });

    bench("isState: reject function", () => {
      isState(() => {});
    });
  });
});

// Edge cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isState: empty name", () => {
      isState({ name: "", params: {}, path: "/" });
    });

    bench("isState: empty path", () => {
      isState({ name: "root", params: {}, path: "" });
    });

    bench("isState: empty params", () => {
      isState({ name: "home", params: {}, path: "/" });
    });

    bench("isState: extra properties", () => {
      isState({
        name: "test",
        params: {},
        path: "/test",
        extra: "ignored",
        another: 42,
      } as any);
    });
  });
});

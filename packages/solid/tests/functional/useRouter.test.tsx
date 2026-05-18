import { renderHook } from "@solidjs/testing-library";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider, useRouter } from "@real-router/solid";

import { createTestRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

const wrapper = (router: Router) => (props: { children: JSX.Element }) => (
  <RouterProvider router={router}>{props.children}</RouterProvider>
);

describe("useRouter hook", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return router", () => {
    const { result } = renderHook(() => useRouter(), {
      wrapper: wrapper(router),
    });

    expect(result).toStrictEqual(router);
  });

  it("should throw error if router instance was not passed to provider", () => {
    expect(() => renderHook(() => useRouter())).toThrow(
      "useRouter must be used within a RouterProvider",
    );
  });

  // Sprint C.3 — explicit lock for the "useRouter is stable across
  // navigations" contract (audit-4 LOW recommendation #1). The
  // architectural guarantee (router stored in RouterContext value,
  // not re-emitted by any signal) makes this hold structurally, but
  // a regression that wrapped router in a signal (e.g. for HMR
  // hot-swap support) would break the assumption that consumers can
  // safely close over the ref.
  it("returns the SAME router reference across multiple reads (Sprint C.3)", async () => {
    await router.start("/");

    const refs: Router[] = [];

    renderHook(
      () => {
        // Read useRouter multiple times in the same owner — must
        // always return the same reference (no per-call wrapping).
        refs.push(useRouter(), useRouter());

        return useRouter();
      },
      { wrapper: wrapper(router) },
    );

    expect(refs).toHaveLength(2);
    expect(refs[0]).toBe(router);
    expect(refs[1]).toBe(router);
    expect(refs[0]).toBe(refs[1]);

    // After a navigation, a fresh useRouter() call in a separate
    // hook owner still returns the same reference — the context
    // value is not re-emitted by route changes.
    await router.navigate("test").catch(() => {});

    const { result: postNav } = renderHook(() => useRouter(), {
      wrapper: wrapper(router),
    });

    expect(postNav).toBe(router);
  });
});

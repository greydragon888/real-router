import { renderHook } from "@testing-library/preact";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider, useRouter } from "@real-router/preact";

import { createTestRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { ComponentChildren } from "preact";

const wrapper =
  (router: Router) =>
  ({ children }: { children: ComponentChildren }) => (
    <RouterProvider router={router}>{children}</RouterProvider>
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

    expect(result.current).toStrictEqual(router);
  });

  it("should throw error if router instance was not passed to provider", () => {
    expect(() => renderHook(() => useRouter())).toThrow();
  });
});

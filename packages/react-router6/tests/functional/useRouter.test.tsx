import { renderHook } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider, useRouter } from "react-router6";

import { createTestRouter } from "../helpers";

import type { ReactNode } from "react";
import type { Router } from "router6";

const wrapper =
  (router: Router) =>
  ({ children }: { children: ReactNode }) => (
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
    expect(() => renderHook(() => useRouter())).toThrowError();
  });
});

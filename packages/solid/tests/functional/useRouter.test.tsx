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
});

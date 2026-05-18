import { errorCodes } from "@real-router/core";
import { renderHook } from "@solidjs/testing-library";
import { createEffect } from "solid-js";
import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  expectTypeOf,
} from "vitest";

import { RouterProvider, useRoute } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Params, Router, RouterError } from "@real-router/core";
import type { JSX } from "solid-js";

const wrapper = (router: Router) => (props: { children: JSX.Element }) => (
  <RouterProvider router={router}>{props.children}</RouterProvider>
);

describe("useRoute hook", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();

    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return current route via accessor", () => {
    const { result } = renderHook(() => useRoute(), {
      wrapper: wrapper(router),
    });

    const state = result();

    expect(state.route.name).toStrictEqual("test");
  });

  it("should update when route changes", async () => {
    const { result } = renderHook(() => useRoute(), {
      wrapper: wrapper(router),
    });

    expect(result().route.name).toStrictEqual("test");

    await router.navigate("items");

    expect(result().route.name).toStrictEqual("items");
  });

  it("should update previousRoute after navigation", async () => {
    const { result } = renderHook(() => useRoute(), {
      wrapper: wrapper(router),
    });

    // Navigate to a known route first
    await router.navigate("home");

    expect(result().route.name).toStrictEqual("home");

    await router.navigate("items");

    expect(result().route.name).toStrictEqual("items");
    expect(result().previousRoute?.name).toStrictEqual("home");
  });

  it("should throw error if router instance was not passed to provider", () => {
    expect(() => renderHook(() => useRoute())).toThrow(
      "useRoute must be used within a RouterProvider",
    );
  });

  it("should throw a clear error if router has not started yet", () => {
    const unstartedRouter = createTestRouterWithADefaultRouter();

    expect(() =>
      renderHook(() => useRoute(), { wrapper: wrapper(unstartedRouter) }),
    ).toThrow(
      /useRoute called with no active route\. Did you forget to await router\.start\(\) before rendering, or is the router stopped\/disposed\?/,
    );
  });

  it("should fire effects the correct number of times on navigations", async () => {
    let effectRunCount = 0;

    // Ensure known starting route
    await router.navigate("test").catch((error: unknown) => {
      if ((error as RouterError).code !== errorCodes.SAME_STATES) {
        throw error;
      }
    });

    renderHook(
      () => {
        const routeState = useRoute();

        createEffect(() => {
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          routeState().route.name;
          effectRunCount++;
        });
      },
      { wrapper: wrapper(router) },
    );

    expect(effectRunCount).toBe(1);

    await router.navigate("home");

    expect(effectRunCount).toBe(2);

    await router.navigate("about");

    expect(effectRunCount).toBe(3);
  });

  it("should propagate generic params type without runtime change", async () => {
    type TypedParams = { id: string; tab: string } & Params;

    await router.navigate("test").catch((error: unknown) => {
      if ((error as RouterError).code !== errorCodes.SAME_STATES) {
        throw error;
      }
    });

    const { result } = renderHook(() => useRoute<TypedParams>(), {
      wrapper: wrapper(router),
    });

    const params: TypedParams = result().route.params;

    expect(result().route.name).toStrictEqual("test");
    // Route "test" has no declared params — generic is purely a compile-time cast.
    expect(params).toStrictEqual({});

    // Compile-time type validation — locks that the generic actually narrows
    // `route.params` to the user-supplied shape (otherwise the runtime
    // `params = {}` check above would be a tautology — see §1.1 audit note).
    // expectTypeOf is a no-op at runtime; if the type narrowing breaks
    // (e.g. someone removes the `as` cast inside useRoute), the test fails
    // at type-check time.
    expectTypeOf(result().route.params).toEqualTypeOf<TypedParams>();
    expectTypeOf(result().route.params.id).toEqualTypeOf<string>();
    expectTypeOf(result().route.params.tab).toEqualTypeOf<string>();
  });

  // Gotcha #3 from CLAUDE.md "Hooks Return Accessors, Not Values":
  // Destructuring a Solid accessor's result inside a component body captures
  // the value at mount time and breaks reactivity — subsequent navigations
  // will NOT update the destructured locals. Lock the contract via a
  // positive/negative pair so a regression that turns useRoute into a
  // store/object (e.g. via createMutable) fails this test.
  it("destructuring useRoute() result at mount breaks reactivity (gotcha #3)", async () => {
    let destructuredName: string | undefined;
    let accessorName: string | undefined;

    renderHook(
      () => {
        const routeState = useRoute();
        // WRONG pattern — captures `route.name` at hook-call time. Subsequent
        // navigations don't re-run this line because the component body runs
        // exactly once in Solid.
        const { route } = routeState();

        destructuredName = route.name;

        // CORRECT pattern — reads via accessor inside a reactive owner.
        createEffect(() => {
          accessorName = routeState().route.name;
        });
      },
      { wrapper: wrapper(router) },
    );

    expect(destructuredName).toBe("test");
    expect(accessorName).toBe("test");

    await router.navigate("about");

    // Negative half: destructured value DID NOT update.
    expect(destructuredName).toBe("test");
    // Positive half: reactive accessor read DID update.
    expect(accessorName).toBe("about");
  });
});

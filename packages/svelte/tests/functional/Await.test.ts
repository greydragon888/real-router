import { screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import {
  createTestRouterWithADefaultRouter,
  injectDeferred,
  renderWithRouter,
} from "../helpers";
import AwaitFalsyTest from "../helpers/AwaitFalsyTest.svelte";
import AwaitTest from "../helpers/AwaitTest.svelte";

import type { Router } from "@real-router/core";

describe("Await", () => {
  it("renders fallback while the deferred promise is pending", async () => {
    const router: Router = createTestRouterWithADefaultRouter();

    await router.start();

    const pending = new Promise<string[]>(() => undefined);

    injectDeferred(router, { reviews: pending });

    renderWithRouter(router, AwaitTest);

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("list")).not.toBeInTheDocument();

    router.stop();
  });

  it("renders children with the resolved value once the promise settles", async () => {
    const router: Router = createTestRouterWithADefaultRouter();

    await router.start();

    injectDeferred(router, { reviews: Promise.resolve(["r1", "r2"]) });

    renderWithRouter(router, AwaitTest);

    await waitFor(() => {
      expect(screen.getByTestId("list")).toBeInTheDocument();
    });

    expect(screen.getByText("r1")).toBeInTheDocument();
    expect(screen.getByText("r2")).toBeInTheDocument();

    router.stop();
  });

  it.each([
    ["zero", 0, "value=0"],
    ["false", false, "value=false"],
    ["null", null, "value=null"],
    ["empty string", "", "value="],
  ] as const)(
    "renders children for resolved falsy value (%s)",
    async (_label, value, expected) => {
      const router: Router = createTestRouterWithADefaultRouter();

      await router.start();

      injectDeferred(router, { count: Promise.resolve(value) });

      renderWithRouter(router, AwaitFalsyTest);

      await waitFor(() => {
        expect(screen.getByTestId("value")).toBeInTheDocument();
      });

      expect(screen.getByTestId("value")).toHaveTextContent(expected);

      router.stop();
    },
  );
});

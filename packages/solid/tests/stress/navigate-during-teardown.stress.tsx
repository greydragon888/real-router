import { render } from "@solidjs/testing-library";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { RouterProvider, useRouteNode, Link } from "@real-router/solid";

import { createStressRouter } from "./helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

// Scenario S2 from audit section 7.2: a navigation fires concurrently with
// component teardown. Verifies no "setState after dispose" warnings and no
// zombie updates leaking past onCleanup boundaries.
describe("T1 — navigate during teardown", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(50);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("T1 — navigate fires during unmount — no zombie setState warnings", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    function Consumer(props: { readonly index: number }): JSX.Element {
      const routeState = useRouteNode(`route${props.index % 10}`);

      return (
        <div>
          {routeState().route?.name ?? "idle"}
          <Link routeName={`route${props.index % 10}`}>L</Link>
        </div>
      );
    }

    const { unmount } = render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 20 }, (_, i) => (
          <Consumer index={i} />
        ))}
      </RouterProvider>
    ));

    const navPromise = router.navigate("route5");

    unmount();

    await navPromise.catch(() => {});

    await router.navigate("route7").catch(() => {});

    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining("setState"),
    );
    expect(consoleWarn).not.toHaveBeenCalledWith(
      expect.stringContaining("dispose"),
    );

    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });
});

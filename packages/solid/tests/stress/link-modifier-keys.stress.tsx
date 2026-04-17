import { render, screen } from "@solidjs/testing-library";
import { fireEvent } from "@testing-library/dom";
import { describe, it, expect, vi } from "vitest";

import { Link, RouterProvider } from "@real-router/solid";

import { createStressRouter, roundRobinRoutes } from "./helpers";

/**
 * Audit section 7, scenario #11: Context menu / keyboard modifiers under load.
 *
 * shouldNavigate() in shared/dom-utils/link-utils.ts bails out on:
 *   - non-left clicks (button !== 0)
 *   - ctrlKey / metaKey / shiftKey / altKey modifiers
 *
 * This stress test renders 100 Links and fires 100 clicks per link with various
 * modifiers, expecting router.navigate() to NEVER be invoked. Regression would
 * be: middle-click navigating instead of opening a tab, or Ctrl-click navigating
 * instead of letting the browser handle it.
 */
describe("S9 — Link modifier-keys stress (Solid)", () => {
  it("9.1: 100 links × modifier-click — router.navigate is never called", async () => {
    const router = createStressRouter(100);

    await router.start("/route0");

    const names = roundRobinRoutes(
      Array.from({ length: 100 }, (_, i) => `route${i}`),
      100,
    );

    render(() => (
      <RouterProvider router={router}>
        {names.map((name, i) => (
          <Link routeName={name} data-testid={`link-${i}`}>
            {name}
          </Link>
        ))}
      </RouterProvider>
    ));

    const navigateSpy = vi.spyOn(router, "navigate");

    const modifiers = [
      { button: 0, ctrlKey: true },
      { button: 0, metaKey: true },
      { button: 0, shiftKey: true },
      { button: 0, altKey: true },
      { button: 1 }, // middle click
      { button: 2 }, // right click
    ];

    for (let i = 0; i < 100; i++) {
      const link = screen.getByTestId(`link-${i}`);

      for (const module_ of modifiers) {
        fireEvent.click(link, module_);
      }
    }

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(router.getState()?.name).toBe("route0");

    router.stop();
  });

  it("9.2: plain left-click after modifiers still navigates (path not stuck)", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    render(() => (
      <RouterProvider router={router}>
        <Link routeName="route5" data-testid="link">
          Go
        </Link>
      </RouterProvider>
    ));

    const link = screen.getByTestId("link");

    // Bombard with ignored modifier clicks.
    for (let i = 0; i < 50; i++) {
      fireEvent.click(link, { button: 0, ctrlKey: true });
      fireEvent.click(link, { button: 1 });
    }

    expect(router.getState()?.name).toBe("route0");

    // Plain click should still work.
    fireEvent.click(link, { button: 0 });

    // Navigation is fire-and-forget via catch(() => {}) inside Link —
    // poll until state updates.
    await vi.waitFor(() => {
      expect(router.getState()?.name).toBe("route5");
    });

    router.stop();
  });
});

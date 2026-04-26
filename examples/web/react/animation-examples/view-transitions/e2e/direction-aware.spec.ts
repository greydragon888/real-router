import { expect, test } from "@playwright/test";

test.describe("Direction-aware navigation", () => {
  test("forward links set nav-direction=forward, popstate sets back", async ({
    page,
  }) => {
    await page.goto("/");

    // Initial state: forward.
    const initial = await page.evaluate(
      () => document.documentElement.dataset.navDirection,
    );
    expect(initial).toBe("forward");

    // Click a link — still forward (user-initiated navigation).
    await page.getByRole("link", { name: "Products" }).first().click();
    await page.waitForURL(/\/products/);

    const afterForward = await page.evaluate(
      () => document.documentElement.dataset.navDirection,
    );
    expect(afterForward).toBe("forward");

    // Browser back — popstate fires → direction flips to back.
    await page.goBack();
    await page.waitForURL((url) => url.pathname === "/");

    const afterBack = await page.evaluate(
      () => document.documentElement.dataset.navDirection,
    );
    expect(afterBack).toBe("back");
  });
});

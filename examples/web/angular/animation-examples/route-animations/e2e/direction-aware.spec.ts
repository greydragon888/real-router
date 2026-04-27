import { expect, test } from "@playwright/test";

test.describe("Direction-aware navigation", () => {
  test("forward links set nav-direction=forward, popstate sets back", async ({
    page,
  }) => {
    await page.goto("/");

    const initial = await page.evaluate(
      () => document.documentElement.dataset.navDirection,
    );
    expect(initial).toBe("forward");

    await page.getByRole("link", { name: "Products" }).first().click();
    await page.waitForURL(/\/products/);

    const afterForward = await page.evaluate(
      () => document.documentElement.dataset.navDirection,
    );
    expect(afterForward).toBe("forward");

    await page.goBack();
    await page.waitForURL((url) => url.pathname === "/");

    const afterBack = await page.evaluate(
      () => document.documentElement.dataset.navDirection,
    );
    expect(afterBack).toBe("back");
  });
});

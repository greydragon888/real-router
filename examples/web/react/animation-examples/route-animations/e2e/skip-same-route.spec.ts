import { expect, test } from "@playwright/test";

test.describe("Skip same-route navigation", () => {
  test("clicking the current-route link does not set data-leaving", async ({
    page,
  }) => {
    await page.goto("/about");
    await expect(
      page.getByRole("heading", { name: /CSS-classes recipe/ }),
    ).toBeVisible();

    // Same-route navigation rejects with SAME_STATES before subscribeLeave
    // fires. Even if it fired (it won't), policy short-circuits via
    // `route.name === nextRoute.name` and never sets the marker.
    await page.getByRole("link", { name: "About" }).first().click();
    await page.waitForTimeout(200);

    const leavingCount = await page.locator("[data-leaving]").count();
    expect(leavingCount).toBe(0);
  });
});

import { expect, test } from "@playwright/test";

test.describe("Query-only navigation suppression", () => {
  test("filter change does not set .leaving class on the route root", async ({
    page,
  }) => {
    await page.goto("/query-demo");
    await expect(
      page.getByRole("heading", { name: "Query-only navigation" }),
    ).toBeVisible();
    await expect(page.getByText("Alpha").first()).toBeVisible();

    // Same-route navigation: route.name === nextRoute.name → policy returns
    // synchronously without setting .leaving class. The page must not animate.
    await page.getByRole("link", { name: "number", exact: true }).click();
    await page.waitForURL(/filter=number/);
    await expect(page.getByText("One").first()).toBeVisible();
    await expect(page.getByText("Alpha")).toHaveCount(0);

    // No .leaving class was set during the navigation.
    const leavingCount = await page.locator(".leaving").count();
    expect(leavingCount).toBe(0);
  });

  test("products sort change does not animate the page", async ({ page }) => {
    await page.goto("/products");
    await expect(
      page.getByRole("heading", { name: "Products" }),
    ).toBeVisible();

    // Switch sort — same-route nav, must not set .leaving class on
    // ProductsList's root. The list re-renders but the page does not fade.
    await page.getByRole("link", { name: "Z → A" }).click();
    await page.waitForURL(/sort=desc/);

    const leavingCount = await page.locator(".leaving").count();
    expect(leavingCount).toBe(0);
  });
});

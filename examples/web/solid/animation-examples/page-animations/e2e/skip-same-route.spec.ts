import { expect, test } from "@playwright/test";

test.describe("Skip same-route navigation", () => {
  test("clicking the current-route link does not trigger exit class", async ({
    page,
  }) => {
    await page.goto("/about");
    await expect(
      page.getByRole("heading", { name: /Three approaches/ }),
    ).toBeVisible();

    // SAME_STATES short-circuits before subscribeLeave fires; the hook's
    // skipSameRoute guard would also catch it. Either way, no exit class.
    await page.getByRole("link", { name: "About" }).first().click();
    await page.waitForTimeout(200);

    const exitCount = await page.locator(".fade-out, .slide-out").count();
    expect(exitCount).toBe(0);
  });

  test("filter change on QueryDemo does not animate the page", async ({
    page,
  }) => {
    await page.goto("/query-demo");
    await expect(
      page.getByRole("heading", { name: "Query-only navigation" }),
    ).toBeVisible();

    // route.name === nextRoute.name → hook skips the animation.
    await page.getByRole("link", { name: "letter", exact: true }).click();
    await page.waitForURL(/filter=letter/);

    const exitCount = await page.locator(".fade-out").count();
    expect(exitCount).toBe(0);
  });
});

import { expect, test } from "@playwright/test";

test.describe("Basic transition", () => {
  test("home loads and Products link navigates", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Route Animations" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Products" }).first().click();
    await page.waitForURL(/\/products/);
    await expect(
      page.getByRole("heading", { name: "Products" }),
    ).toBeVisible();
  });

  test("CSS animation runs on the leaving route during navigation", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Route Animations" }),
    ).toBeVisible();

    // Click the link and wait until policy has set [data-leaving]. At that
    // moment the @keyframes on [data-route-anim="fade"][data-leaving] is
    // running — getAnimations() must return at least one.
    await Promise.all([
      page.getByRole("link", { name: "About" }).first().click(),
      page.waitForFunction(
        () => document.querySelector("[data-leaving]") !== null,
      ),
    ]);

    const animationCount = await page.evaluate(
      () => document.getAnimations().length,
    );
    expect(animationCount).toBeGreaterThan(0);

    await page.waitForURL(/\/about/);
    await expect(
      page.getByRole("heading", { name: /CSS-classes recipe/ }),
    ).toBeVisible();
  });
});

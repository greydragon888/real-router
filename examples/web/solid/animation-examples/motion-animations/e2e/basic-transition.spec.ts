import { expect, test } from "@playwright/test";

test.describe("Basic transition", () => {
  test("home loads and Products link navigates", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Motion Animations" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Products" }).first().click();
    await page.waitForURL(/\/products/);
    await expect(
      page.getByRole("heading", { name: "Products" }),
    ).toBeVisible();
  });

  test("WAAPI animation runs on the page-level motion.div during navigation", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Motion Animations" }),
    ).toBeVisible();

    // Click About; before the navigation settles, motion library should
    // have a running animation on the page-level <motion.div>.
    await Promise.all([
      page.getByRole("link", { name: "About" }).first().click(),
      page.waitForFunction(() => document.getAnimations().length > 0, null, {
        timeout: 1000,
      }),
    ]);

    await page.waitForURL(/\/about/);
    await expect(
      page.getByRole("heading", { name: /Four approaches/ }),
    ).toBeVisible();
  });
});

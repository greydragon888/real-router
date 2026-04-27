import { expect, test } from "@playwright/test";

test.describe("Basic transition", () => {
  test("home loads and Products link navigates", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Page Animations" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Products" }).first().click();
    await page.waitForURL(/\/products/);
    await expect(
      page.getByRole("heading", { name: "Products" }),
    ).toBeVisible();
  });

  test("exit class lands on the leaving page during navigation", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Page Animations" }),
    ).toBeVisible();

    // Click About; before the URL change settles, the leaving Home's wrapper
    // must carry the .fade-out class.
    await Promise.all([
      page.getByRole("link", { name: "About" }).first().click(),
      page.waitForFunction(
        () => document.querySelector(".fade-out") !== null,
      ),
    ]);

    await page.waitForURL(/\/about/);
    await expect(
      page.getByRole("heading", { name: /Three approaches/ }),
    ).toBeVisible();
  });
});

import { expect, test } from "@playwright/test";

test.describe("Hero morph", () => {
  test("product thumb and detail cover share a view-transition-name", async ({
    page,
  }) => {
    await page.goto("/products");
    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();

    // Verify the thumb on the list has a named VT element.
    const thumbName = await page.evaluate(() => {
      const thumb = document.querySelector(".vt-product-thumb") as HTMLElement | null;
      return thumb?.style.viewTransitionName ?? null;
    });
    expect(thumbName).toMatch(/^product-cover-\d+$/);

    // Click on Crimson Flask (id=1) and verify the detail page uses the
    // matching VT name. The browser pairs them during the transition.
    await page.getByRole("link", { name: /Crimson Flask/ }).click();
    await page.waitForURL(/\/products\/1/);

    const coverName = await page.evaluate(() => {
      const cover = document.querySelector(".vt-product-cover") as HTMLElement | null;
      return cover?.style.viewTransitionName ?? null;
    });
    expect(coverName).toBe("product-cover-1");
  });

  test("unknown product id renders fallback", async ({ page }) => {
    await page.goto("/products/999");
    await expect(
      page.getByRole("heading", { name: "Unknown product" }),
    ).toBeVisible();
  });
});

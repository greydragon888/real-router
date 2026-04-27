import { expect, test } from "@playwright/test";

// Angular's signal-driven CSS has no layoutId / hero-morph primitive —
// products → products.detail navigates with the standard page-level
// fade + slide. This test verifies the nested-route navigation completes
// successfully and the cover renders at full size on the detail page.
// For an inverse-FLIP hero morph in Angular, see route-animations/'s
// installHeroMorph factory.
test.describe("Nested-route navigation (no hero morph in motion-animations)", () => {
  test("clicking a product card navigates to the detail page and renders the cover", async ({
    page,
  }) => {
    await page.goto("/products");
    await expect(
      page.getByRole("heading", { name: "Products" }),
    ).toBeVisible();
    // Wait for products page entry animation to finish so we don't
    // conflate it with the next navigation.
    await page.waitForTimeout(1100);

    await page.getByRole("link", { name: /Crimson Flask/ }).click();
    await page.waitForURL(/\/products\/1/);

    // After mount the cover element exists with full size (no inverse-
    // FLIP transform — Angular's signal pipeline is per-element entry/exit).
    await page.waitForSelector(".product-cover", { timeout: 2000 });
    await page.waitForTimeout(1500);

    const finalCover = await page.evaluate(() => {
      const cover = document.querySelector<HTMLElement>(".product-cover");
      if (!cover) return null;
      const rect = cover.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });

    expect(finalCover).not.toBeNull();
    expect(finalCover!.width).toBeGreaterThan(100);
    expect(finalCover!.height).toBeGreaterThan(100);
  });
});

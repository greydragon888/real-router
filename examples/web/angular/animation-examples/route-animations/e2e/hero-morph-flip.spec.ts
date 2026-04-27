import { expect, test } from "@playwright/test";

test.describe("Hero morph (manual FLIP)", () => {
  test("clicking a product card runs an inverse-FLIP transform on the destination cover", async ({
    page,
  }) => {
    await page.goto("/products");
    await expect(
      page.getByRole("heading", { name: "Products" }),
    ).toBeVisible();

    // The thumb on the products list and the cover on the detail page share
    // a `data-product-id` — that's the stable handle installHeroMorph
    // uses to find the destination element after commit.
    const thumbProductId = await page.evaluate(() => {
      const thumb = document.querySelector(".product-thumb");
      return thumb?.getAttribute("data-product-id") ?? null;
    });
    expect(thumbProductId).toMatch(/^\d+$/);

    await page.getByRole("link", { name: /Crimson Flask/ }).click();
    await page.waitForURL(/\/products\/1/);

    // After mount the cover element exists with the expected id.
    const coverId = await page.evaluate(() => {
      const cover = document.querySelector(".product-cover");
      return cover?.getAttribute("data-product-id") ?? null;
    });
    expect(coverId).toBe("1");

    // The cover's element.animate() FLIP transform was scheduled in
    // setTimeout(0) inside router.subscribe. Snapshot getAnimations()
    // shortly after navigation lands to catch the WAAPI animation while it
    // is still running.
    await page.waitForFunction(
      () => {
        const cover = document.querySelector(".product-cover");
        if (!cover) return false;
        const anims = cover.getAnimations();
        return anims.length > 0;
      },
      null,
      { timeout: 1000 },
    );

    // Verify the animation type — element.animate() returns a KeyframeEffect
    // animation, distinct from CSS @keyframes triggered animations.
    const flipKind = await page.evaluate(() => {
      const cover = document.querySelector(".product-cover");
      const anim = cover?.getAnimations()[0];
      return anim?.effect instanceof KeyframeEffect ? "waapi" : "css";
    });
    expect(flipKind).toBe("waapi");
  });

  test("unknown product id renders fallback", async ({ page }) => {
    await page.goto("/products/999");
    await expect(
      page.getByRole("heading", { name: "Unknown product" }),
    ).toBeVisible();
  });
});

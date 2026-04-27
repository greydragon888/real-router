import { expect, test } from "@playwright/test";

test.describe("Hero morph", () => {
  test("product thumb and detail cover share a view-transition-name", async ({
    page,
  }) => {
    await page.goto("/products");
    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();

    // `data-product-id` is the stable marker that main.ts uses to find
    // the target element during navigation and add `.vt-hero-active` to
    // it. No thumb has a name before a nav is in progress.
    const thumbProductId = await page.evaluate(() => {
      const thumb = document.querySelector(".vt-product-thumb");
      return thumb?.getAttribute("data-product-id") ?? null;
    });
    expect(thumbProductId).toMatch(/^\d+$/);

    // Click on Crimson Flask (id=1). During the navigation main.ts:
    // 1) sets html.vt-hero-morph + data-vt-hero-id="1"
    // 2) adds .vt-hero-active to the source thumb (old DOM, subscribeLeave)
    // 3) adds .vt-hero-active to the destination cover (new DOM,
    //    router.subscribe via setTimeout after React commit)
    // CSS then gives each of those one shared name "hero" which the browser
    // uses to pair them for FLIP-morph. Verify the wiring by reading the
    // computed name on the cover after arrival.
    await page.getByRole("link", { name: /Crimson Flask/ }).click();
    await page.waitForURL(/\/products\/1/);

    const coverName = await page.evaluate(() => {
      const cover = document.querySelector(".vt-product-cover");
      return cover !== null
        ? getComputedStyle(cover).viewTransitionName
        : null;
    });
    expect(coverName).toBe("hero");

    // And confirm the wiring: html should carry the hero id matching the url.
    const heroId = await page.evaluate(
      () => document.documentElement.dataset.vtHeroId ?? null,
    );
    expect(heroId).toBe("1");

    // The cover should carry .vt-hero-active — that's the class the CSS
    // rule keys off.
    const hasActiveClass = await page.evaluate(() => {
      const cover = document.querySelector(".vt-product-cover");
      return cover?.classList.contains("vt-hero-active") ?? false;
    });
    expect(hasActiveClass).toBe(true);
  });

  test("unknown product id renders fallback", async ({ page }) => {
    await page.goto("/products/999");
    await expect(
      page.getByRole("heading", { name: "Unknown product" }),
    ).toBeVisible();
  });
});

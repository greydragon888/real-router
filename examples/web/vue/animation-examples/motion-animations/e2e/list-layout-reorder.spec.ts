import { expect, test } from "@playwright/test";

// Vue's built-in <Transition> has no per-list layout-animation
// primitive — the products list re-renders in the new order without
// inverse-FLIP per item (Vue ships <TransitionGroup> for in-list
// animations, but motion-animations uses a single page-level
// <Transition>). This test verifies the sort change causes a DOM
// re-order — items end up at their new positions; for cross-route /
// in-list FLIP, see route-animations/'s useListFlip composable.
test.describe("List reorder (DOM order swap, no per-item FLIP)", () => {
  test("sort change re-renders the product cards in reversed order", async ({
    page,
  }) => {
    await page.goto("/products");
    await expect(
      page.getByRole("heading", { name: "Products" }),
    ).toBeVisible();
    // Wait for entry animation.
    await page.waitForTimeout(1100);

    // Capture initial DOM order of cards.
    const initialOrder = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>(".product-card .product-name"),
      ).map((el) => el.textContent),
    );

    await page.getByRole("link", { name: "Z → A" }).click();
    await page.waitForURL(/sort=desc/);
    await page.waitForTimeout(1500);

    // After sort change DOM order should be reversed. Vue re-renders
    // the list in the new order; items snap to their new spots without
    // inverse-FLIP (this is the expected trade-off of the page-level
    // <Transition> approach).
    const finalOrder = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>(".product-card .product-name"),
      ).map((el) => el.textContent),
    );

    expect(finalOrder).toEqual(initialOrder.slice().reverse());
    expect(finalOrder.length).toBeGreaterThan(0);
  });
});

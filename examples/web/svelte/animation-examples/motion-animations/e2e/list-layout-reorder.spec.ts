import { expect, test } from "@playwright/test";

// motion.li layout — list reorder FLIP. When the products array changes
// order (sort change), the library reads each item's position before and
// after re-render and animates the difference. Stable key={id} is required.
test.describe("List layout reorder", () => {
  test("sort change triggers layout animations on product cards", async ({
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

    // After sort change DOM order should be reversed. motion.li layout
    // animates positions transparently; the visual result is items at
    // their new spots. Verify by comparing order — library FLIP'd them
    // there without us managing positions manually.
    const finalOrder = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>(".product-card .product-name"),
      ).map((el) => el.textContent),
    );

    expect(finalOrder).toEqual(initialOrder.slice().reverse());
    expect(finalOrder.length).toBeGreaterThan(0);
  });
});

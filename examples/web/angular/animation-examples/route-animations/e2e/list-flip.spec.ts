import { expect, test } from "@playwright/test";

// List FLIP: changing the sort on /products (or filter on /query-demo)
// should leave .leaving untouched (query-only suppression) AND run
// WAAPI animations on the [data-flip-key] items via installListFlip.
//
// `<li>` carries no CSS animations of its own — every animation visible on
// it is policy-emitted (FLIP translate or new-item fade-in), so a live
// running animation on a card is a clean signal of recipe activity. (Page-
// level CSS slide on [data-route-root] uses `fill-mode: forwards` and stays
// in getAnimations() forever, so we cannot wait for it to drain — but it
// runs on a <div>, not the <li>'s we sample here.)
test.describe("List reorder FLIP", () => {
  test("sort change runs WAAPI animations on product cards", async ({
    page,
  }) => {
    await page.goto("/products");
    await expect(
      page.getByRole("heading", { name: "Products" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Z → A" }).click();
    await page.waitForURL(/sort=desc/);

    // Reverse-sort moves all 6 cards. After setTimeout(0) policy applies
    // WAAPI translate animations on each — at least 2 should be running
    // during the 600 ms FLIP window.
    await page.waitForFunction(
      () => {
        const cards =
          document.querySelectorAll<HTMLElement>("[data-flip-key]");
        const animating = Array.from(cards).filter((card) =>
          card
            .getAnimations()
            .some((animation) => animation.playState === "running"),
        );
        return animating.length >= 2;
      },
      null,
      { timeout: 2000 },
    );

    // Marker invariant — sort change is query-only.
    const leavingCount = await page.locator(".leaving").count();
    expect(leavingCount).toBe(0);
  });

  test("filter change fades in newly-visible items", async ({ page }) => {
    await page.goto("/query-demo?filter=letter");
    await expect(
      page.getByRole("heading", { name: "Query-only navigation" }),
    ).toBeVisible();

    // letter → number: Alpha + Bravo unmount, One + Two mount at top. The
    // mounting items had no captured sourceRect → policy fades them in via
    // opacity 0 → 1.
    await page.getByRole("link", { name: "number", exact: true }).click();
    await page.waitForURL(/filter=number/);

    await page.waitForFunction(
      () => {
        const items =
          document.querySelectorAll<HTMLElement>("[data-flip-key]");
        return Array.from(items).some((item) =>
          item
            .getAnimations()
            .some((animation) => animation.playState === "running"),
        );
      },
      null,
      { timeout: 2000 },
    );
  });
});

import { expect, test } from "@playwright/test";

test.describe("Abort safety", () => {
  test("rapid clicks end on the last clicked route", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "View Transitions" }),
    ).toBeVisible();

    // Use sidebar links — they persist across navigation (Layout is stable).
    // Fire clicks with a short gap (30ms) to race navigations. real-router
    // cancels older in-flight navigations; the VT utility's abort handler
    // releases the deferred, so stale transitions are skipped.
    const sidebar = page.getByRole("complementary");

    await Promise.all([
      sidebar.getByRole("link", { name: "Products" }).click(),
      page.waitForTimeout(30).then(() =>
        sidebar.getByRole("link", { name: "About" }).click(),
      ),
      page.waitForTimeout(60).then(() =>
        sidebar.getByRole("link", { name: "Query demo" }).click(),
      ),
      page.waitForTimeout(90).then(() =>
        sidebar.getByRole("link", { name: "Reduced motion" }).click(),
      ),
    ]);

    await page.waitForURL(/\/reduced-motion/);
    await expect(
      page.getByRole("heading", { name: "Reduced motion" }),
    ).toBeVisible();

    // After settling, the animation queue should have at most a couple of
    // active VT pseudo-elements — the final one plus maybe a tail.
    const activeCount = await page.evaluate(
      () => document.getAnimations().length,
    );
    expect(activeCount).toBeLessThanOrEqual(4);
  });
});

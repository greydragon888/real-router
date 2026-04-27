import { expect, test } from "@playwright/test";

test.describe("Skip initial load", () => {
  test("first-load does not put fade-out on the wrapper", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Page Animations" }),
    ).toBeVisible();

    // router.start() does not fire subscribeLeave — no exit class should
    // ever appear on initial mount.
    const exitCount = await page.locator(".fade-out, .slide-out").count();
    expect(exitCount).toBe(0);
  });
});

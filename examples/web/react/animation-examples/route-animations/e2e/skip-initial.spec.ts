import { expect, test } from "@playwright/test";

test.describe("Skip initial load", () => {
  test("first-load does not run an exit animation or set data-leaving", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Route Animations" }),
    ).toBeVisible();

    // After mount, the entry keyframe on [data-route-anim="fade"]:not([data-leaving])
    // may briefly run, but no [data-leaving] should ever be set on initial load
    // since router.start() does not fire subscribeLeave.
    const leavingCount = await page.locator("[data-leaving]").count();
    expect(leavingCount).toBe(0);
  });
});

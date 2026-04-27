import { expect, test } from "@playwright/test";

// Sequential semantics: subscribeLeave returns a Promise, the router blocks
// until animationend fires. The new page's heading should not be visible
// before the exit animation has had a chance to play through.
//
// Timing-based assertion: between Link.click() and the new heading becoming
// visible, at least the duration of the exit animation (minus a small
// epsilon for jitter) should have elapsed.
test.describe("Sequential exit then entry", () => {
  test("router blocks the next page until the exit animation finishes", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Route Animations" }),
    ).toBeVisible();

    const FADE_DURATION = 900;
    const EPSILON = 100;

    const t0 = Date.now();
    await page.getByRole("link", { name: "About" }).first().click();
    // Wait for the new heading to appear — this is the moment the new DOM
    // has committed AND any entry keyframe has had time to start.
    await page.waitForSelector(
      '[data-route-anim="fade"]:not(.leaving) h1:has-text("CSS-classes recipe")',
    );
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeGreaterThan(FADE_DURATION - EPSILON);
  });
});

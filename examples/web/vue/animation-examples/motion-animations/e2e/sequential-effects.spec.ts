import { expect, test } from "@playwright/test";

// Router-coordinated semantics: subscribeLeave returns a Promise that
// resolves on Vue's @after-leave event. The router blocks until exit
// finishes — so `await router.navigate(...)` resolves only after the
// user can see the new route. URL update via browser-plugin's
// onTransitionSuccess fires post-Promise-resolution, keeping URL and UI
// in lock-step.
//
// Verify: time between click and the new heading visible should be at
// least the exit-animation duration (minus a small epsilon for jitter).
test.describe("Sequential exit then entry (router-coordinated)", () => {
  test("router blocks the next page until the exit animation finishes", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Motion Animations" }),
    ).toBeVisible();

    // Allow any initial render to settle.
    await page.waitForTimeout(100);

    const FADE_DURATION = 900;
    const EPSILON = 200;

    const t0 = Date.now();
    await page.getByRole("link", { name: "About" }).first().click();
    await page.waitForSelector("h1:has-text('Four approaches')");
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeGreaterThan(FADE_DURATION - EPSILON);
  });
});

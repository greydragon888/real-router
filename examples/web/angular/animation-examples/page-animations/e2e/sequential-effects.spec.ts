import { expect, test } from "@playwright/test";

// Same sequential semantics as route-animations: subscribeLeave returns a
// Promise, the router blocks until animationend, only then does the new
// page mount. Timing-based assertion: elapsed between click and the new
// heading appearing must be ≥ exit duration minus a small epsilon.
test.describe("Sequential exit then entry", () => {
  test("router blocks the next page until the exit animation finishes", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Page Animations" }),
    ).toBeVisible();

    const FADE_DURATION = 900;
    const EPSILON = 100;

    const t0 = Date.now();
    await page.getByRole("link", { name: "About" }).first().click();
    await page.waitForSelector("h1:has-text('Three approaches')");
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeGreaterThan(FADE_DURATION - EPSILON);
  });
});

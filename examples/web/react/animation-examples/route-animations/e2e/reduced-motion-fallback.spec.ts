import { expect, test } from "@playwright/test";

// prefers-reduced-motion: reduce → @media rule sets `animation: none` on
// [data-route-root]. With no animation registered, getAnimations() returns
// [] and animateExit() resolves on the next rAF — the router unblocks
// without waiting for the (non-existent) animationend event. Navigation
// should complete in well under the normal 300 ms fade duration.
test.describe("Reduced motion fallback", () => {
  test("navigation completes quickly without an animationend event", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Route Animations" }),
    ).toBeVisible();

    // Smoke check: the @media rule must have collapsed Home's keyframe so
    // there is no running animation on the route root. If this fails the
    // emulation didn't take, and the timing assertion below would be
    // misleading.
    const homeAnimCount = await page.evaluate(() => {
      const root = document.querySelector("[data-route-root]");
      return root?.getAnimations().length ?? -1;
    });
    expect(homeAnimCount).toBe(0);

    const t0 = Date.now();
    await page.getByRole("link", { name: "About" }).first().click();
    await page.waitForSelector(
      '[data-route-anim="fade"]:not([data-leaving]) h1:has-text("CSS-classes recipe")',
    );
    const elapsed = Date.now() - t0;

    // Without reduced-motion the fade keyframe runs 300 ms; the no-animation
    // path resolves on the next rAF (~16 ms) plus React commit overhead.
    // 200 ms is well below the normal 300 ms, so this catches the regression
    // where the keyframe accidentally still runs.
    expect(elapsed).toBeLessThan(200);
  });
});

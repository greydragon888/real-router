import { expect, test } from "@playwright/test";

// MotionConfig reducedMotion="user" — when prefers-reduced-motion: reduce
// is active, the library disables transform and layout animations site-
// wide. Opacity / backgroundColor still play. So the page-level slide-x
// collapses, but opacity 0 → 1 still animates (per spec — reduced-motion
// is "tone it down", not "remove all").
//
// Router still blocks on the opacity exit's onExitComplete. Verify:
// 1. Navigation completes successfully (router unblocks)
// 2. No transform applied to the page-level motion.div (transform stayed
//    identity throughout)
test.describe("Reduced motion respect via MotionConfig", () => {
  test("transform animations are suppressed under prefers-reduced-motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Motion Animations" }),
    ).toBeVisible();

    // After the page settled (any opacity entry fade done), check that the
    // motion.div carries no transform — reduced-motion suppressed the
    // slide-x animation.
    await page.waitForTimeout(200);

    const transformAtRest = await page.evaluate(() => {
      // Find the page-level motion.div (it wraps the heading; first
      // descendant of <main>).
      const wrapper = document.querySelector<HTMLElement>(
        "main > div > div",
      );
      if (!wrapper) return null;
      const computed = globalThis.getComputedStyle(wrapper);
      return computed.transform;
    });

    // No transform applied (or matrix identity).
    expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(transformAtRest);

    // Navigation still completes — router unblocks via opacity-only exit.
    await page.getByRole("link", { name: "About" }).first().click();
    await expect(
      page.getByRole("heading", { name: /Four approaches/ }),
    ).toBeVisible({ timeout: 3000 });
  });
});

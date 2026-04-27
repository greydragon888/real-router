import { expect, test } from "@playwright/test";

// CSS @media (prefers-reduced-motion: reduce) in animations.css
// collapses .page.leaving / .page.entering keyframes to
// `animation: none`. `Element.getAnimations()` returns `[]`, so
// `Promise.allSettled([])` in TransitionHost resolves synchronously —
// the router never blocks. Verify:
// 1. Navigation completes successfully (router unblocks)
// 2. No transform applied to the page wrapper (transform stayed
//    identity throughout)
test.describe("Reduced motion respect via CSS @media query", () => {
  test("animations are suppressed under prefers-reduced-motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Motion Animations" }),
    ).toBeVisible();

    // After the page settled (any opacity entry fade done), check that
    // the page wrapper carries no transform — reduced-motion suppressed
    // the slide-x animation.
    await page.waitForTimeout(200);

    const transformAtRest = await page.evaluate(() => {
      const wrapper = document.querySelector<HTMLElement>(".page");
      if (!wrapper) return null;
      const computed = globalThis.getComputedStyle(wrapper);
      return computed.transform;
    });

    // No transform applied (or matrix identity).
    expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(transformAtRest);

    // Navigation still completes — router unblocks once getAnimations()
    // resolves to []
    await page.getByRole("link", { name: "About" }).first().click();
    await expect(
      page.getByRole("heading", { name: /Four approaches/ }),
    ).toBeVisible({ timeout: 3000 });
  });
});

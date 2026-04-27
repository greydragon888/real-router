import { expect, test } from "@playwright/test";

// CSS @media (prefers-reduced-motion: reduce) in App.vue collapses
// .page-enter-active / .page-leave-active to `transition: none` and
// snaps from-states to identity. The router @after-leave fires
// immediately (transitionend resolves on next frame for `none`) so
// navigation still completes. Verify:
// 1. Navigation completes successfully (router unblocks)
// 2. No transform applied to the page-level keyed <div> (transform
//    stayed identity throughout)
test.describe("Reduced motion respect via CSS @media query", () => {
  test("transitions are suppressed under prefers-reduced-motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Motion Animations" }),
    ).toBeVisible();

    // After the page settled (any opacity entry fade done), check that
    // the keyed wrapper carries no transform — reduced-motion suppressed
    // the slide-x transition.
    await page.waitForTimeout(200);

    const transformAtRest = await page.evaluate(() => {
      // Find the page-level keyed <div> (it wraps the heading; first
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

    // Navigation still completes — router unblocks once @after-leave
    // fires on the (now-instant) leave transition.
    await page.getByRole("link", { name: "About" }).first().click();
    await expect(
      page.getByRole("heading", { name: /Four approaches/ }),
    ).toBeVisible({ timeout: 3000 });
  });
});

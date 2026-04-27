import { expect, test } from "@playwright/test";

// Reduced motion: the @media rule sets `animation: none` on the exit class,
// so animationend never fires — the hook's 50 ms setTimeout fallback
// releases the router. Navigation must complete well under the normal
// 600 ms fade duration.
test.describe("Reduced motion fallback", () => {
  test("navigation completes quickly without animationend", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Page Animations" }),
    ).toBeVisible();

    const t0 = Date.now();
    await page.getByRole("link", { name: "About" }).first().click();
    await page.waitForSelector("h1:has-text('Three approaches')");
    const elapsed = Date.now() - t0;

    // Without reduced-motion the exit fade runs 900 ms; the fallback path
    // should release in ~50 ms + overhead.
    expect(elapsed).toBeLessThan(300);
  });
});

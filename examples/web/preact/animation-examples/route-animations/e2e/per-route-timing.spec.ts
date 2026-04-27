import { expect, test } from "@playwright/test";

// Per-route timing: each [data-route-root] carries data-route-anim with one
// of three values (fade / slide / hero-flip), and CSS keys different
// durations off it. Verify by snapshotting the entry-animation duration on
// the just-mounted route's root element after each navigation.
test.describe("Per-route timing", () => {
  test("fade and slide routes have different entry animation durations", async ({
    page,
  }) => {
    // Sample the entry animation duration of the freshly mounted route's
    // root. Polls until an animation is present (entry plays on mount), then
    // returns the longest duration it sees.
    async function captureEntryDuration(): Promise<number> {
      return await page.evaluate(() => {
        return new Promise<number>((resolve, reject) => {
          const deadline = Date.now() + 2000;
          const check = (): void => {
            // Multiple [data-route-root] markers can coexist (Products
            // shell + nested ProductsList / ProductDetail). Collect
            // animations from all entry-state ones and return the longest
            // duration, which identifies the most expensive route's
            // signature animation.
            const roots = document.querySelectorAll(
              "[data-route-root]:not(.leaving)",
            );
            let max = 0;
            for (const root of roots) {
              for (const anim of root.getAnimations()) {
                const duration = anim.effect?.getTiming().duration;
                if (typeof duration === "number" && duration > max) {
                  max = duration;
                }
              }
            }
            if (max > 0) {
              resolve(max);
              return;
            }
            if (Date.now() > deadline) {
              reject(new Error("Entry animation not seen within 2s"));
              return;
            }
            requestAnimationFrame(check);
          };
          check();
        });
      });
    }

    await page.goto("/about");
    await expect(
      page.getByRole("heading", { name: /CSS-classes recipe/ }),
    ).toBeVisible();
    // Wait for About's mount animation to settle so the next sample only
    // sees the upcoming entry.
    await page.waitForFunction(
      () =>
        (
          document.querySelector(
            "[data-route-root]:not(.leaving)",
          ) as Element | null
        )?.getAnimations().length === 0,
      null,
      { timeout: 2000 },
    );

    // About → Home (fade entry).
    const homeNav = page.getByRole("link", { name: "Home" }).first().click();
    const homeDuration = await captureEntryDuration();
    await homeNav;
    await page.waitForURL((url) => url.pathname === "/");

    // Wait for Home's mount animation to settle.
    await page.waitForFunction(
      () =>
        (
          document.querySelector(
            "[data-route-root]:not(.leaving)",
          ) as Element | null
        )?.getAnimations().length === 0,
      null,
      { timeout: 2000 },
    );

    // Home → Products (slide entry, longer duration).
    const productsNav = page
      .getByRole("link", { name: "Products" })
      .first()
      .click();
    const productsDuration = await captureEntryDuration();
    await productsNav;
    await page.waitForURL(/\/products/);

    expect(homeDuration).toBeGreaterThan(0);
    expect(productsDuration).toBeGreaterThan(homeDuration);
  });
});

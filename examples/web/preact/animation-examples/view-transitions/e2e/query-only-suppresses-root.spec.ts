import { expect, test } from "@playwright/test";

// Regression guard: when the user changes a query param without changing the
// route (e.g. /products?sort=asc → /products?sort=desc), the root VT scope
// must NOT animate. Named scopes (product-list) may animate, but the
// full-screen curtain/slide on root would drown them out.
//
// Mechanism: main.tsx sets html.vt-query-only on same-route navigation,
// and transitions.css disables root keyframes under that class.

test.describe("Query-only suppresses root animation", () => {
  test("sort change on /products does not trigger root-scope keyframes", async ({
    page,
  }) => {
    await page.goto("/products");
    await expect(
      page.getByRole("heading", { name: "Products" }),
    ).toBeVisible();

    const hasSupport = await page.evaluate(() => {
      return typeof document.startViewTransition === "function";
    });

    if (!hasSupport) {
      test.skip();
      return;
    }

    // Click the Z → A link. Sort starts at "asc" (default), click changes to
    // "desc" → query-only navigation to the same route.
    await page.getByRole("link", { name: "Z → A" }).click();
    await page.waitForURL(/sort=desc/);

    // Poll document.getAnimations() for ~500ms while VT animations run, and
    // collect every animation-name that was ever active. We then inspect
    // which keyframes fired.
    const animationNames = await page.evaluate(async () => {
      const names = new Set<string>();
      const start = Date.now();

      while (Date.now() - start < 600) {
        for (const anim of document.getAnimations()) {
          // CSSAnimation has .animationName; other Animation subclasses do not.
          const name = (anim as unknown as { animationName?: string })
            .animationName;

          if (typeof name === "string" && name.length > 0) {
            names.add(name);
          }
        }

        await new Promise((r) => setTimeout(r, 16));
      }

      return Array.from(names);
    });

    // html.vt-query-only must be applied by main.tsx.
    const hasQueryOnlyClass = await page.evaluate(() =>
      document.documentElement.classList.contains("vt-query-only"),
    );

    expect(hasQueryOnlyClass).toBe(true);

    // Root-scope keyframes must NOT have fired — these are all names used by
    // ::view-transition-old(root) / ::view-transition-new(root) rules in
    // transitions.css. If any of them appear, the suppression is broken.
    const rootKeyframes = [
      "vt-exit-left",
      "vt-exit-right",
      "vt-entry-left",
      "vt-entry-right",
    ];

    for (const name of rootKeyframes) {
      expect(animationNames).not.toContain(name);
    }
  });

  test("cross-route navigation DOES trigger root animation (sanity check)", async ({
    page,
  }) => {
    // The inverse: a normal cross-route navigation must produce root
    // keyframes. If this test fails, the suppression rule is too broad.
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "View Transitions" }),
    ).toBeVisible();

    const hasSupport = await page.evaluate(() => {
      return typeof document.startViewTransition === "function";
    });

    if (!hasSupport) {
      test.skip();
      return;
    }

    await page.getByRole("link", { name: "About" }).first().click();
    await page.waitForURL(/\/about/);

    const animationNames = await page.evaluate(async () => {
      const names = new Set<string>();
      const start = Date.now();

      while (Date.now() - start < 600) {
        for (const anim of document.getAnimations()) {
          const name = (anim as unknown as { animationName?: string })
            .animationName;

          if (typeof name === "string" && name.length > 0) {
            names.add(name);
          }
        }

        await new Promise((r) => setTimeout(r, 16));
      }

      return Array.from(names);
    });

    // html.vt-query-only must NOT be set.
    const hasQueryOnlyClass = await page.evaluate(() =>
      document.documentElement.classList.contains("vt-query-only"),
    );

    expect(hasQueryOnlyClass).toBe(false);

    // Exactly one root exit keyframe + one root entry keyframe must have run
    // (forward direction: vt-exit-left + vt-entry-right).
    expect(animationNames).toContain("vt-exit-left");
    expect(animationNames).toContain("vt-entry-right");
  });
});

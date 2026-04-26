import { expect, test } from "@playwright/test";

// Recipe must NOT depend on document.startViewTransition. Stripping it from
// the page (simulating Firefox 145- or any browser without VT) must leave
// navigation and animation behaviour identical to the supported case.
test.describe("Cross-browser without View Transitions API", () => {
  test("animations run normally with document.startViewTransition undefined", async ({
    page,
  }) => {
    // Document.prototype owns the accessor, so `delete` won't affect the
    // instance. Shadow it with `undefined` on the document instance — that
    // is what the VT utility's `typeof` feature-detect actually checks.
    await page.addInitScript(() => {
      const doc = document as unknown as {
        startViewTransition?: unknown;
      };
      doc.startViewTransition = undefined;
    });

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Route Animations" }),
    ).toBeVisible();

    const vtAbsent = await page.evaluate(
      () => typeof document.startViewTransition === "undefined",
    );
    expect(vtAbsent).toBe(true);

    await Promise.all([
      page.getByRole("link", { name: "About" }).first().click(),
      page.waitForFunction(
        () => document.querySelector("[data-leaving]") !== null,
      ),
    ]);

    const animationCount = await page.evaluate(
      () => document.getAnimations().length,
    );
    expect(animationCount).toBeGreaterThan(0);

    await page.waitForURL(/\/about/);
    await expect(
      page.getByRole("heading", { name: /CSS-classes recipe/ }),
    ).toBeVisible();

    const filteredConsole = consoleErrors.filter(
      (text) => !text.includes("React DevTools") && !text.includes("[vite]"),
    );
    expect(pageErrors).toEqual([]);
    expect(filteredConsole).toEqual([]);
  });
});

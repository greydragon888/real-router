import { expect, test } from "@playwright/test";

test.describe("Basic transition", () => {
  test("home loads and Products link navigates", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "View Transitions" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Products" }).first().click();
    await page.waitForURL(/\/products/);
    await expect(
      page.getByRole("heading", { name: "Products" }),
    ).toBeVisible();
  });

  test("startViewTransition is invoked on navigation", async ({ page }) => {
    await page.goto("/");

    const hasSupport = await page.evaluate(() => {
      return typeof document.startViewTransition === "function";
    });

    if (!hasSupport) {
      test.skip();
      return;
    }

    await page.evaluate(() => {
      const doc = document as unknown as {
        startViewTransition: (...args: unknown[]) => unknown;
      };
      const g = globalThis as unknown as { __vtCalls: number };
      g.__vtCalls = 0;
      const original = doc.startViewTransition.bind(doc);
      doc.startViewTransition = (...args: unknown[]) => {
        g.__vtCalls += 1;
        return original(...args);
      };
    });

    await page.getByRole("link", { name: "About" }).first().click();
    await page.waitForURL(/\/about/);

    const calls = await page.evaluate(() => {
      return (globalThis as unknown as { __vtCalls: number }).__vtCalls;
    });

    expect(calls).toBeGreaterThanOrEqual(1);
  });
});

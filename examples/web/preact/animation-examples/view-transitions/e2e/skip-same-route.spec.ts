import { expect, test } from "@playwright/test";

test.describe("Skip same-route navigation", () => {
  test("clicking the current-route link does not invoke startViewTransition", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const doc = document as unknown as {
        startViewTransition?: (...args: unknown[]) => unknown;
      };
      const g = globalThis as unknown as { __vtCalls: number };
      g.__vtCalls = 0;
      const original = doc.startViewTransition?.bind(doc);
      if (!original) return;
      doc.startViewTransition = (...args: unknown[]) => {
        g.__vtCalls += 1;
        return original(...args);
      };
    });

    await page.goto("/about");
    await expect(page.getByRole("heading", { name: "About" })).toBeVisible();

    // First click should not count against same-route (we're already on About).
    await page.getByRole("link", { name: "About" }).first().click();
    await page.waitForTimeout(200);

    const callsAfterSameRoute = await page.evaluate(() => {
      return (globalThis as unknown as { __vtCalls: number }).__vtCalls;
    });

    expect(callsAfterSameRoute).toBe(0);
  });
});

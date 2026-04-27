import { expect, test } from "@playwright/test";

test.describe("Skip initial load", () => {
  test("first-load does not invoke startViewTransition", async ({ page }) => {
    // Patch startViewTransition before the bundle runs, counting calls made
    // before the initial route is visible. The utility subscribes to
    // subscribeLeave, which fires only on real transitions — the very first
    // start() call should not trigger VT.
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

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "View Transitions" }),
    ).toBeVisible();

    const calls = await page.evaluate(() => {
      return (globalThis as unknown as { __vtCalls: number }).__vtCalls;
    });

    expect(calls).toBe(0);
  });
});

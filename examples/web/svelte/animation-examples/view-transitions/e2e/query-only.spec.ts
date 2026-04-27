import { expect, test } from "@playwright/test";

test.describe("Query-only navigation", () => {
  test("filter change triggers a VT and updates visible items", async ({
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

    await page.goto("/query-demo");
    await expect(
      page.getByRole("heading", { name: "Query-only navigation" }),
    ).toBeVisible();
    await expect(page.getByText("Alpha").first()).toBeVisible();

    await page.getByRole("link", { name: "number", exact: true }).click();
    await page.waitForURL(/filter=number/);
    await expect(page.getByText("One").first()).toBeVisible();
    // "Alpha" is a letter-category item; it should be filtered out.
    await expect(page.getByText("Alpha")).toHaveCount(0);

    const hasSupport = await page.evaluate(
      () => typeof document.startViewTransition === "function",
    );
    if (hasSupport) {
      const calls = await page.evaluate(
        () => (globalThis as unknown as { __vtCalls: number }).__vtCalls,
      );
      expect(calls).toBeGreaterThanOrEqual(1);
    }
  });
});

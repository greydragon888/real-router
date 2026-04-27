import { expect, test } from "@playwright/test";

// Regression guard: the three animation hooks (usePageAnimator / useHeroMorph / useListFlip) must not throw or log during normal
// navigation. Walks the sidebar to exercise every route, then asserts no
// console errors and no uncaught exceptions.
test.describe("No console or page errors during navigation", () => {
  test("clicking through routes produces no console errors or uncaught exceptions", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Route Animations" }),
    ).toBeVisible();

    const sidebar = page.getByRole("complementary");
    const targets = ["Products", "About", "Query demo", "Home"];

    for (const name of targets) {
      await sidebar.getByRole("link", { name }).first().click();
      await page.waitForTimeout(400);
    }

    const filteredConsole = consoleErrors.filter(
      (text) => !text.includes("React DevTools") && !text.includes("[vite]"),
    );

    expect(pageErrors).toEqual([]);
    expect(filteredConsole).toEqual([]);
  });
});

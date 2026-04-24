import { expect, test } from "@playwright/test";

// Guard against regressions where the VT utility leaves the updateCallback
// Promise hanging (TimeoutError) or starts a new VT while an old one is
// still active (InvalidStateError). Both manifest as console errors
// visible to users and block the visual animation. This test also covers
// general navigation crashes via `pageerror`.
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
      page.getByRole("heading", { name: "View Transitions" }),
    ).toBeVisible();

    // Walk the sidebar to exercise every route once, giving each transition
    // a moment to complete before the next click.
    const sidebar = page.getByRole("complementary");
    const targets = [
      "Products",
      "About",
      "Query demo",
      "Reduced motion",
      "Abort racing",
      "Home",
    ];

    for (const name of targets) {
      await sidebar.getByRole("link", { name }).first().click();
      await page.waitForTimeout(200);
    }

    // Filter noise: Vite HMR + React DevTools nag lines are not regressions.
    const filteredConsole = consoleErrors.filter(
      (text) =>
        !text.includes("React DevTools") &&
        !text.includes("[vite]"),
    );

    expect(pageErrors).toEqual([]);
    expect(filteredConsole).toEqual([]);
  });
});

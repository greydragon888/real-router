import { expect, test } from "@playwright/test";

test.describe("Skip same-route navigation", () => {
  test("clicking the current-route link does not trigger a re-animation", async ({
    page,
  }) => {
    await page.goto("/about");
    await expect(
      page.getByRole("heading", { name: /Four approaches/ }),
    ).toBeVisible();

    // Wait for any entry animation to settle.
    await page.waitForTimeout(1100);

    // SAME_STATES rejection short-circuits before render — route.name
    // does not change, AnimatePresence is not triggered.
    await page.getByRole("link", { name: "About" }).first().click();
    await page.waitForTimeout(200);

    // No new running animation on the page-level container.
    const running = await page.evaluate(
      () =>
        document.getAnimations().filter((a) => a.playState === "running")
          .length,
    );
    expect(running).toBe(0);
  });
});

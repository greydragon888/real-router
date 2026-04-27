import { expect, test } from "@playwright/test";

test.describe("Abort safety", () => {
  test("rapid clicks end on the last clicked route", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Motion Animations" }),
    ).toBeVisible();

    const sidebar = page.getByRole("complementary");

    // Fire rapid clicks. mode="wait" queues exits; intermediate routes'
    // entrances may be skipped if a newer navigation arrives before they
    // mount. The essential invariant: final route is the last clicked.
    await Promise.all([
      sidebar.getByRole("link", { name: "Products" }).click(),
      page
        .waitForTimeout(30)
        .then(() =>
          sidebar.getByRole("link", { name: "Query demo" }).click(),
        ),
      page
        .waitForTimeout(60)
        .then(() => sidebar.getByRole("link", { name: "Home" }).click()),
    ]);

    await page.waitForTimeout(50);
    await sidebar.getByRole("link", { name: "About" }).click();

    await page.waitForURL(/\/about/);
    await expect(
      page.getByRole("heading", { name: /Four approaches/ }),
    ).toBeVisible();

    // After everything settles: no orphan running animations.
    await page.waitForFunction(
      () =>
        document.getAnimations().filter((a) => a.playState === "running")
          .length === 0,
      null,
      { timeout: 5000 },
    );
  });
});

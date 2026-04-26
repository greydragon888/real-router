import { expect, test } from "@playwright/test";

test.describe("Abort safety", () => {
  test("rapid clicks end on the last clicked route with no orphan markers", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Route Animations" }),
    ).toBeVisible();

    const sidebar = page.getByRole("complementary");

    // Fire 3 rapid clicks — each cancels the previous. real-router fires
    // signal.abort on the in-flight LeaveState; animations-policy.ts
    // removes data-leaving from the cancelled exit.
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
      page.getByRole("heading", { name: /CSS-classes recipe/ }),
    ).toBeVisible();

    // After the final transition settles, the only [data-route-root] in the
    // DOM is About's, and it must NOT carry data-leaving — that would mean
    // an aborted exit's marker leaked.
    await page.waitForFunction(
      () => document.querySelectorAll("[data-leaving]").length === 0,
      null,
      { timeout: 3000 },
    );

    // getAnimations() should also drain — only the entry animation on
    // About's [data-route-root] is allowed (it finishes within 300 ms).
    await page.waitForFunction(
      () => document.getAnimations().length <= 1,
      null,
      { timeout: 3000 },
    );
  });
});

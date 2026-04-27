import { expect, test } from "@playwright/test";

test.describe("Abort safety", () => {
  test("rapid clicks end on the last clicked route without orphan exit classes", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Page Animations" }),
    ).toBeVisible();

    const sidebar = page.getByRole("complementary");

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
      page.getByRole("heading", { name: /Three approaches/ }),
    ).toBeVisible();

    // After the dust settles, no leftover exit class. The cancelled
    // navigations had their useEffect cleanup remove the wrapper anyway,
    // but verify defensively.
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".fade-out, .slide-out").length === 0,
      null,
      { timeout: 3000 },
    );
  });
});

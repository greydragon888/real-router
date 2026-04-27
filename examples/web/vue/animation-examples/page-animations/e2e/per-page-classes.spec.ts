import { expect, test } from "@playwright/test";

// Each page picks its own animation classes via the hook. Products uses
// slide-* whereas Home / About / QueryDemo / ProductDetail use fade-*.
// Verify by sampling which class lands during the leaving navigation.
test.describe("Per-page classes", () => {
  test("Home leave uses fade-out, Products leave uses slide-out", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Page Animations" }),
    ).toBeVisible();

    await Promise.all([
      page.getByRole("link", { name: "Products" }).first().click(),
      page.waitForFunction(
        () => document.querySelector(".fade-out") !== null,
      ),
    ]);
    await page.waitForURL(/\/products/);

    // Now leave Products → check slide-out replaces the previous class.
    await Promise.all([
      page.getByRole("link", { name: "About" }).first().click(),
      page.waitForFunction(
        () => document.querySelector(".slide-out") !== null,
      ),
    ]);
    await page.waitForURL(/\/about/);
  });
});

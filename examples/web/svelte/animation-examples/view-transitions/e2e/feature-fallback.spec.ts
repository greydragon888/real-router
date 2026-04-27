import { expect, test } from "@playwright/test";

test.describe("Feature fallback", () => {
  test("navigation still works when startViewTransition is absent", async ({
    page,
  }) => {
    // Delete the API before the bundle loads so the utility's feature-detect
    // branch fires and returns the no-op instance.
    await page.addInitScript(() => {
      const doc = document as unknown as {
        startViewTransition?: unknown;
      };
      doc.startViewTransition = undefined;
    });

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "View Transitions" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Products" }).first().click();
    await page.waitForURL(/\/products/);
    await expect(
      page.getByRole("heading", { name: "Products" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "About" }).first().click();
    await page.waitForURL(/\/about/);
    await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
  });
});

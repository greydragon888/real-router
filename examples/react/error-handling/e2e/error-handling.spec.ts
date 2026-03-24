import { expect, test } from "@playwright/test";

test.describe("Error Handling Example", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  });

  test("1. Go to Unknown shows ROUTE_NOT_FOUND toast", async ({ page }) => {
    await page.click('button:has-text("Go to Unknown")');

    await expect(page.locator(".toast")).toContainText("ROUTE_NOT_FOUND", {
      timeout: 3000,
    });
  });

  test("2. Go to Protected shows CANNOT_ACTIVATE toast", async ({ page }) => {
    await page.click('button:has-text("Go to Protected")');

    await expect(page.locator(".toast")).toContainText("CANNOT_ACTIVATE", {
      timeout: 3000,
    });
  });

  test("3. Go to Slow then cancel navigates to About + logs CANCELLED", async ({
    page,
  }) => {
    await page.click('button:has-text("Go to Slow then cancel")');

    await expect(page.getByRole("heading", { name: "About" })).toBeVisible({
      timeout: 5000,
    });
    await expect(
      page.locator("li:has-text('TRANSITION_CANCELLED')"),
    ).toBeVisible();
  });

  test("4. Fire-and-forget shows success toast", async ({ page }) => {
    await page.click('button:has-text("Fire-and-forget")');

    await expect(page.locator(".toast.success")).toBeVisible({ timeout: 3000 });
  });

  test("5. Plugin error log captures CANNOT_ACTIVATE", async ({ page }) => {
    await page.click('button:has-text("Go to Protected")');

    await expect(page.locator("li:has-text('CANNOT_ACTIVATE')")).toBeVisible({
      timeout: 3000,
    });
  });

  test("6. Plugin log captures TRANSITION_CANCELLED", async ({ page }) => {
    await page.click('button:has-text("Go to Slow then cancel")');

    await expect(
      page.locator("li:has-text('TRANSITION_CANCELLED')"),
    ).toBeVisible({ timeout: 5000 });
  });
});

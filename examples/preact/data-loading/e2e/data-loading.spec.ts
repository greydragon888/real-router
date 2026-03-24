import { expect, test } from "@playwright/test";

test.describe("Data Loading Example", () => {
  test("1. Products list loads on navigation", async ({ page }) => {
    await page.goto("/");
    await page.click('a:has-text("Products")');
    await page.waitForURL(/\/products/);

    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
    await expect(page.locator(".card")).toHaveCount(3, { timeout: 5000 });
    await expect(page.locator(".card").first()).toContainText("Laptop");
  });

  test("2. Click View Details navigates to product detail", async ({
    page,
  }) => {
    await page.goto("/");
    await page.click('a:has-text("Products")');
    await expect(page.locator(".card")).toHaveCount(3, { timeout: 5000 });

    await page.click('.card a:has-text("View Details")');
    await page.waitForURL(/\/products\/\d/);

    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".card")).toContainText("$");
  });

  test("3. Back to Products returns to list", async ({ page }) => {
    await page.goto("/");
    await page.click('a:has-text("Products")');
    await expect(page.locator(".card")).toHaveCount(3, { timeout: 5000 });

    await page.click('.card a:has-text("View Details")');
    await page.waitForURL(/\/products\/\d/);

    await page.click('a:has-text("Back to Products")');
    await page.waitForURL(/\/products/);

    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
    await expect(page.locator(".card")).toHaveCount(3, { timeout: 5000 });
  });

  test("4. Direct URL to product detail works", async ({ page }) => {
    await page.goto("/products/3");

    await expect(page.locator("h1")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".card")).toContainText("$449");
  });
});

import { test, expect } from "@playwright/test";

test.describe("Search schema plugin", () => {
  test.describe("Navigation", () => {
    test("home page loads", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    });

    test("products link navigates with default params", async ({ page }) => {
      await page.goto("/");
      await page.click(".sidebar a:has-text('Products')");
      await expect(page).toHaveURL(/\/products/);
      await expect(
        page.getByRole("heading", { name: "Products" }),
      ).toBeVisible();
    });
  });

  test.describe("Default params", () => {
    test("URL includes defaultParams on first visit", async ({ page }) => {
      await page.goto("/");
      await page.click(".sidebar a:has-text('Products')");
      await expect(page).toHaveURL(/page=1/);
      await expect(page).toHaveURL(/sort=name/);
    });

    test("current params display shows defaults", async ({ page }) => {
      await page.goto("/products");
      await expect(page.locator("code")).toContainText("page=1");
      await expect(page.locator("code")).toContainText("sort=name");
    });
  });

  test.describe("Pagination", () => {
    test("next page increments page param", async ({ page }) => {
      await page.goto("/products?page=1&sort=name");
      await page.click("button:has-text('Next')");
      await expect(page).toHaveURL(/page=2/);
      await expect(page.locator("code")).toContainText("page=2");
    });

    test("previous page decrements page param", async ({ page }) => {
      await page.goto("/products?page=3&sort=name");
      await page.click("button:has-text('Previous')");
      await expect(page).toHaveURL(/page=2/);
    });

    test("previous button disabled on page 1", async ({ page }) => {
      await page.goto("/products?page=1&sort=name");
      await expect(page.locator("button:has-text('Previous')")).toBeDisabled();
    });
  });

  test.describe("Sort", () => {
    test("changing sort updates URL", async ({ page }) => {
      await page.goto("/products?page=1&sort=name");
      await page.selectOption("#sort-select", "price");
      await expect(page).toHaveURL(/sort=price/);
      await expect(page.locator("code")).toContainText("sort=price");
    });
  });

  test.describe("Schema validation + recovery", () => {
    test("invalid page recovered to default", async ({ page }) => {
      await page.goto("/products?page=-1&sort=name");
      await expect(page.locator("code")).toContainText("page=1");
    });

    test("invalid sort recovered to default", async ({ page }) => {
      await page.goto("/products?page=1&sort=invalid");
      await expect(page.locator("code")).toContainText("sort=name");
    });

    test("both invalid params recovered", async ({ page }) => {
      await page.goto("/products?page=-1&sort=invalid");
      await expect(page.locator("code")).toContainText("page=1");
      await expect(page.locator("code")).toContainText("sort=name");
    });

    test("try invalid params button recovers to defaults", async ({ page }) => {
      await page.goto("/products?page=1&sort=name");
      await page.click("button.danger");
      await expect(page.locator("code")).toContainText("page=1");
      await expect(page.locator("code")).toContainText("sort=name");
    });
  });

  test.describe("Search", () => {
    test("search input updates q param", async ({ page }) => {
      await page.goto("/products?page=1&sort=name");
      await page.fill("#search-input", "laptop");
      await expect(page).toHaveURL(/q=laptop/);
      await expect(page.locator("code")).toContainText("q=laptop");
    });
  });
});

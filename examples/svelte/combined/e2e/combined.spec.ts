import { expect, test } from "@playwright/test";

async function login(
  page: import("@playwright/test").Page,
  email = "alice@example.com",
) {
  await page.goto("/login");
  await page.getByPlaceholder("alice@example.com").fill(email);
  await page.getByPlaceholder("any password").fill("password");
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL(/\/dashboard/);
}

test.describe("Combined Example", () => {
  test.describe("Navigation", () => {
    test("click Link changes URL and content", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();

      await page.click(".sidebar a:has-text('Login')");
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
    });

    test("sidebar highlights active link", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".sidebar a.active")).toContainText("Home");

      await page.click(".sidebar a:has-text('Login')");
      await expect(page.locator(".sidebar a.active")).toContainText("Login");
    });

    test("browser back/forward works", async ({ page }) => {
      await page.goto("/");
      await page.click(".sidebar a:has-text('Login')");
      await expect(page).toHaveURL(/\/login/);

      await page.goBack();
      await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({
        timeout: 5000,
      });

      await page.goForward();
      await expect(page.getByRole("heading", { name: "Login" })).toBeVisible({
        timeout: 5000,
      });
    });
  });

  test.describe("Auth — route tree swap", () => {
    test("/dashboard is 404 when logged out", async ({ page }) => {
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    });

    test("login swaps route tree — dashboard accessible", async ({ page }) => {
      await login(page);
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(
        page.getByRole("heading", { name: "Dashboard" }),
      ).toBeVisible();
    });

    test("sidebar changes after login", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".sidebar")).toContainText("Home");
      await expect(page.locator(".sidebar")).toContainText("Login");
      await expect(page.locator(".sidebar")).not.toContainText("Dashboard");

      await login(page);
      await expect(page.locator(".sidebar")).toContainText("Dashboard");
      await expect(page.locator(".sidebar")).toContainText("Products");
      await expect(page.locator(".sidebar")).not.toContainText("Login");
    });

    test("logout swaps back — /dashboard becomes 404", async ({ page }) => {
      await login(page);
      await page.click("button:has-text('Logout')");
      await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({
        timeout: 5000,
      });

      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    });
  });

  test.describe("Nested routes", () => {
    test("users layout with breadcrumbs", async ({ page }) => {
      await login(page);
      await page.click(".sidebar a:has-text('Users')");
      await expect(page).toHaveURL(/\/users\/list/);
      await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
      await expect(page.locator("nav.breadcrumbs")).toBeVisible();
    });

    test("nested navigation updates breadcrumbs", async ({ page }) => {
      await login(page);
      await page.click(".sidebar a:has-text('Users')");
      await page.click("a:has-text('User #1')");
      await expect(page).toHaveURL(/\/users\/1/);
      await expect(page.locator("nav.breadcrumbs")).toContainText("User #1");
    });
  });

  test.describe("Data loading", () => {
    test("products load on navigation", async ({ page }) => {
      await login(page);
      await page.click(".sidebar a:has-text('Products')");
      await expect(page).toHaveURL(/\/products/);
      await expect(
        page.locator("main .card:has-text('Laptop')").first(),
      ).toBeVisible({ timeout: 5000 });
    });

    test("product detail loads on click", async ({ page }) => {
      await login(page);
      await page.click(".sidebar a:has-text('Products')");
      await expect(page.getByRole("heading", { name: "Products" })).toBeVisible(
        { timeout: 5000 },
      );
      await page.getByRole("link", { name: "View Details" }).first().click();
      await expect(page).toHaveURL(/\/products\/\d/);
      await expect(page.getByRole("heading", { name: "Laptop" })).toBeVisible({
        timeout: 5000,
      });
    });
  });

  test.describe("Lazy loading", () => {
    test("dashboard lazy-loads with fallback", async ({ page }) => {
      await login(page);
      await expect(
        page.getByRole("heading", { name: "Dashboard" }),
      ).toBeVisible();
      await expect(page.locator(".card")).toBeVisible();
    });
  });

  test.describe("Async guards", () => {
    test("checkout shows progress bar during guard", async ({ page }) => {
      await login(page);

      const progressBarVisible = page.waitForSelector(
        "[data-testid='progress-bar']",
        { state: "visible", timeout: 3000 },
      );

      void page.click(".sidebar a:has-text('Checkout')");
      await progressBarVisible;

      await page.waitForURL(/\/checkout/);
      await expect(
        page.getByRole("heading", { name: "Checkout" }),
      ).toBeVisible();
    });
  });

  test.describe("Role-based access", () => {
    test("admin (alice) can access admin page", async ({ page }) => {
      await login(page, "alice@example.com");
      await page.click(".sidebar a:has-text('Admin')");
      await expect(page).toHaveURL(/\/admin/);
      await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
    });

    test("viewer (carol) cannot access admin page", async ({ page }) => {
      await login(page, "carol@example.com");
      await page.click(".sidebar a:has-text('Admin')");
      await expect(page).not.toHaveURL(/\/admin/);
    });
  });

  test.describe("Persistent params", () => {
    test("lang param persists across navigations", async ({ page }) => {
      await login(page);

      await page.click("button:has-text('→ RU')");
      await expect(page).toHaveURL(/lang=ru/);

      await page.click(".sidebar a:has-text('Products')");
      await expect(page).toHaveURL(/lang=ru/);
      await expect(page).toHaveURL(/\/products/);
    });
  });

  test.describe("Error handling", () => {
    test("unknown route shows 404", async ({ page }) => {
      await page.goto("/nonexistent");
      await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    });
  });

  test.describe("Accessibility", () => {
    test("announcer element present with correct ARIA", async ({ page }) => {
      await page.goto("/");
      const announcer = page.locator("[data-real-router-announcer]");

      await expect(announcer).toBeAttached({ timeout: 3000 });
      await expect(announcer).toHaveAttribute("aria-live", "assertive");
      await expect(announcer).toHaveAttribute("aria-atomic", "true");
    });

    test("announcer updates on client-side navigation", async ({ page }) => {
      await login(page);
      await page.click(".sidebar a:has-text('Products')");

      const announcer = page.locator("[data-real-router-announcer]");

      await expect(announcer).not.toHaveText("", { timeout: 5000 });
    });
  });

  test.describe("Settings — canDeactivate", () => {
    test("allows leaving when no unsaved changes", async ({ page }) => {
      await login(page);
      await page.click(".sidebar a:has-text('Settings')");
      await expect(page).toHaveURL(/\/settings/);

      await page.click(".sidebar a:has-text('Dashboard')");
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });

  test.describe("Search schema validation", () => {
    test("products list URL includes validated query params", async ({
      page,
    }) => {
      await login(page);
      await page.click(".sidebar a:has-text('Products')");
      await expect(page).toHaveURL(/\/products\/list/);
      await expect(page).toHaveURL(/page=1/);
      await expect(page).toHaveURL(/sort=name/);
    });

    test("invalid query params recovered to defaults", async ({ page }) => {
      await login(page);
      await page.goto("/products/list?page=-1&sort=invalid");
      await expect(page).toHaveURL(/page=1/);
      await expect(page).toHaveURL(/sort=name/);
    });
  });
});

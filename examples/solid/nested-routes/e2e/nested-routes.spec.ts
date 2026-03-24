import { expect, test } from "@playwright/test";

test.describe("Nested Routes Example", () => {
  test.describe("Sidebar navigation", () => {
    test("Home active by default", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
      await expect(page.locator(".sidebar a.active")).toContainText("Home");
    });

    test("Users link → redirects to /users/list via forwardTo", async ({
      page,
    }) => {
      await page.goto("/");
      await page.click(".sidebar a:has-text('Users')");
      await expect(page).toHaveURL(/\/users\/list/);
      await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
      await expect(page.locator(".sidebar a.active")).toContainText("Users");
    });
  });

  test.describe("Inner sidebar (nested nav)", () => {
    test("List and Settings links visible", async ({ page }) => {
      await page.goto("/users/list");
      await expect(page.getByRole("link", { name: "List" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    });

    test("List highlighted as active on /users/list", async ({ page }) => {
      await page.goto("/users/list");
      await expect(page.locator("a.active:has-text('List')")).toBeVisible();
    });

    test("Settings click → /users/settings + active", async ({ page }) => {
      await page.goto("/users/list");
      await page.click("a:has-text('Settings')");
      await expect(page).toHaveURL(/\/users\/settings/);
      await expect(
        page.getByRole("heading", { name: "User Settings" }),
      ).toBeVisible();
      await expect(page.locator("a.active:has-text('Settings')")).toBeVisible();
    });
  });

  test.describe("Breadcrumbs", () => {
    test("Home > Users on /users/list", async ({ page }) => {
      await page.goto("/users/list");
      const crumbs = page.locator("nav.breadcrumbs");

      await expect(crumbs).toContainText("Home");
      await expect(crumbs).toContainText("Users");
    });

    test("Home > Users > Alice on profile /users/1", async ({ page }) => {
      await page.goto("/users/list");
      await page.getByRole("link", { name: "View Profile" }).first().click();
      await expect(page).toHaveURL(/\/users\/1/);

      const crumbs = page.locator("nav.breadcrumbs");

      await expect(crumbs).toContainText("Home");
      await expect(crumbs).toContainText("Users");
    });

    test("breadcrumb Home link → navigates to /", async ({ page }) => {
      await page.goto("/users/list");
      await page.click("nav.breadcrumbs a:has-text('Home')");
      await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    });

    test("breadcrumb Users link → navigates to /users/list", async ({
      page,
    }) => {
      await page.goto("/users/1");
      await page.click("nav.breadcrumbs a:has-text('Users')");
      await expect(page).toHaveURL(/\/users\/list/);
      await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
    });
  });

  test.describe("User profile", () => {
    test("click View Profile → profile with user name", async ({ page }) => {
      await page.goto("/users/list");
      await page.getByRole("link", { name: "View Profile" }).first().click();
      await expect(page).toHaveURL(/\/users\/1/);
      await expect(page.getByRole("heading", { name: "Alice" })).toBeVisible();
    });

    test("second user has different profile", async ({ page }) => {
      await page.goto("/users/list");
      await page.getByRole("link", { name: "View Profile" }).nth(1).click();
      await expect(page).toHaveURL(/\/users\/2/);
      await expect(page.getByRole("heading", { name: "Bob" })).toBeVisible();
    });

    test("direct URL /users/3 works", async ({ page }) => {
      await page.goto("/users/3");
      await expect(page.getByRole("heading", { name: "Carol" })).toBeVisible();
    });
  });

  test.describe("Browser back/forward", () => {
    test("Home → Users → Alice → back → Users → back → Home", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();

      await page.click(".sidebar a:has-text('Users')");
      await expect(page).toHaveURL(/\/users\/list/);
      await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

      await page.getByRole("link", { name: "View Profile" }).first().click();
      await expect(page).toHaveURL(/\/users\/1/);
      await expect(page.getByRole("heading", { name: "Alice" })).toBeVisible();

      await page.goBack();
      await expect(page.getByRole("heading", { name: "Users" })).toBeVisible({
        timeout: 3000,
      });

      await page.goBack();
      await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({
        timeout: 3000,
      });
    });

    test("back then forward preserves profile (Bob)", async ({ page }) => {
      await page.goto("/users/list");
      await page.getByRole("link", { name: "View Profile" }).nth(1).click();
      await expect(page).toHaveURL(/\/users\/2/);

      await page.goBack();
      await expect(page.getByRole("heading", { name: "Users" })).toBeVisible({
        timeout: 3000,
      });

      await page.goForward();
      await expect(page.getByRole("heading", { name: "Bob" })).toBeVisible({
        timeout: 3000,
      });
    });

    test("Settings → back → list → forward → Settings", async ({ page }) => {
      await page.goto("/users/list");

      await page.click("a:has-text('Settings')");
      await expect(page).toHaveURL(/\/users\/settings/);

      await page.goBack();
      await expect(page.getByRole("heading", { name: "Users" })).toBeVisible({
        timeout: 3000,
      });

      await page.goForward();
      await expect(
        page.getByRole("heading", { name: "User Settings" }),
      ).toBeVisible({ timeout: 3000 });
    });

    test("deep: Alice → Settings → back → Alice → back → list", async ({
      page,
    }) => {
      await page.goto("/users/list");

      await page.getByRole("link", { name: "View Profile" }).first().click();
      await expect(page).toHaveURL(/\/users\/1/);

      await page.click("a:has-text('Settings')");
      await expect(page).toHaveURL(/\/users\/settings/);

      await page.goBack();
      await expect(page.getByRole("heading", { name: "Alice" })).toBeVisible({
        timeout: 3000,
      });

      await page.goBack();
      await expect(page.getByRole("heading", { name: "Users" })).toBeVisible({
        timeout: 3000,
      });
    });

    test("triple back then triple forward restores full chain", async ({
      page,
    }) => {
      await page.goto("/");

      await page.click(".sidebar a:has-text('Users')");
      await expect(page).toHaveURL(/\/users\/list/);

      await page.getByRole("link", { name: "View Profile" }).first().click();
      await expect(page).toHaveURL(/\/users\/1/);

      await page.click("a:has-text('Settings')");
      await expect(page).toHaveURL(/\/users\/settings/);

      await page.goBack();
      await page.goBack();
      await page.goBack();
      await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({
        timeout: 3000,
      });

      await page.goForward();
      await expect(page.getByRole("heading", { name: "Users" })).toBeVisible({
        timeout: 3000,
      });

      await page.goForward();
      await expect(page.getByRole("heading", { name: "Alice" })).toBeVisible({
        timeout: 3000,
      });

      await page.goForward();
      await expect(
        page.getByRole("heading", { name: "User Settings" }),
      ).toBeVisible({ timeout: 3000 });
    });
  });

  test.describe("Layout preservation", () => {
    test("outer sidebar stays when navigating nested routes", async ({
      page,
    }) => {
      await page.goto("/users/list");
      await expect(page.locator(".sidebar a:has-text('Users')")).toBeVisible();

      await page.getByRole("link", { name: "View Profile" }).first().click();
      await expect(page.locator(".sidebar a:has-text('Users')")).toBeVisible();
      await expect(page.locator(".sidebar a:has-text('Home')")).toBeVisible();
    });

    test("inner nav stays when switching between nested pages", async ({
      page,
    }) => {
      await page.goto("/users/list");
      await expect(page.getByRole("link", { name: "List" })).toBeVisible();

      await page.click("a:has-text('Settings')");
      await expect(page.getByRole("link", { name: "List" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    });
  });

  test.describe("404", () => {
    test("unknown URL shows 404", async ({ page }) => {
      await page.goto("/nonexistent");
      await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    });
  });
});

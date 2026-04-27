import { expect, test } from "@playwright/test";

test.describe("Nested Routes Example", () => {
  test.describe("Sidebar navigation", () => {
    test("Home active by default", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
      await expect(page.locator(".sidebar a.active")).toContainText("Home");
    });

    test("Users link → navigates to /users (the list)", async ({ page }) => {
      await page.goto("/");
      await page.click(".sidebar a:has-text('Users')");
      await expect(page).toHaveURL(/\/users(?:\?|$)/);
      await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
      await expect(page.locator(".sidebar a.active")).toContainText("Users");
    });
  });

  test.describe("Per-user sub-navigation (inside profile)", () => {
    test("Profile and Settings links visible on /users/:id", async ({
      page,
    }) => {
      await page.goto("/users/1");
      await expect(page.getByRole("link", { name: "Profile" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    });

    test("Profile highlighted as active on /users/:id", async ({ page }) => {
      await page.goto("/users/1");
      await expect(
        page.locator("a.active:has-text('Profile')"),
      ).toBeVisible();
    });

    test("Settings click → /users/:id/settings + active", async ({ page }) => {
      await page.goto("/users/1");
      await page.getByRole("link", { name: "Settings" }).click();
      await expect(page).toHaveURL(/\/users\/1\/settings/);
      await expect(
        page.getByRole("heading", { name: "User Settings" }),
      ).toBeVisible();
      await expect(
        page.locator("a.active:has-text('Settings')"),
      ).toBeVisible();
    });

    test("per-user sidebar absent on /users (the list)", async ({ page }) => {
      await page.goto("/users");
      // Exact name match — "View Profile" links in the list are not the
      // sidebar's "Profile" link, so we anchor with regex to disambiguate.
      await expect(
        page.getByRole("link", { name: /^Profile$/ }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: /^Settings$/ }),
      ).toHaveCount(0);
    });
  });

  test.describe("Breadcrumbs", () => {
    test("Home > Users on /users", async ({ page }) => {
      await page.goto("/users");
      const crumbs = page.locator("nav.breadcrumbs");

      await expect(crumbs).toContainText("Home");
      await expect(crumbs).toContainText("Users");
    });

    test("Home > Users > User #1 on /users/1", async ({ page }) => {
      await page.goto("/users");
      await page.getByRole("link", { name: "View Profile" }).first().click();
      await expect(page).toHaveURL(/\/users\/1/);

      const crumbs = page.locator("nav.breadcrumbs");

      await expect(crumbs).toContainText("Home");
      await expect(crumbs).toContainText("Users");
      await expect(crumbs).toContainText("User #1");
    });

    test("Home > Users > User #1 > Settings on /users/1/settings", async ({
      page,
    }) => {
      await page.goto("/users/1/settings");

      const crumbs = page.locator("nav.breadcrumbs");

      await expect(crumbs).toContainText("Home");
      await expect(crumbs).toContainText("Users");
      await expect(crumbs).toContainText("User #1");
      await expect(crumbs).toContainText("Settings");
    });

    test("breadcrumb Home link → navigates to /", async ({ page }) => {
      await page.goto("/users");
      await page.click("nav.breadcrumbs a:has-text('Home')");
      await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    });

    test("breadcrumb Users link → navigates to /users", async ({ page }) => {
      await page.goto("/users/1");
      await page.click("nav.breadcrumbs a:has-text('Users')");
      await expect(page).toHaveURL(/\/users(?:\?|$)/);
      await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
    });
  });

  test.describe("User profile", () => {
    test("click View Profile → profile with user name", async ({ page }) => {
      await page.goto("/users");
      await page.getByRole("link", { name: "View Profile" }).first().click();
      await expect(page).toHaveURL(/\/users\/1/);
      await expect(page.getByRole("heading", { name: "Alice" })).toBeVisible();
    });

    test("second user has different profile", async ({ page }) => {
      await page.goto("/users");
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
      await expect(page).toHaveURL(/\/users(?:\?|$)/);
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
      await page.goto("/users");
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

    test("Alice → Settings → back → Alice → forward → Settings", async ({
      page,
    }) => {
      await page.goto("/users/1");
      await expect(page.getByRole("heading", { name: "Alice" })).toBeVisible();

      await page.getByRole("link", { name: "Settings" }).click();
      await expect(page).toHaveURL(/\/users\/1\/settings/);
      await expect(
        page.getByRole("heading", { name: "User Settings" }),
      ).toBeVisible();

      await page.goBack();
      await expect(page.getByRole("heading", { name: "Alice" })).toBeVisible({
        timeout: 3000,
      });

      await page.goForward();
      await expect(
        page.getByRole("heading", { name: "User Settings" }),
      ).toBeVisible({ timeout: 3000 });
    });

    test("deep: list → Alice → Settings → back x3 → home", async ({ page }) => {
      await page.goto("/");

      await page.click(".sidebar a:has-text('Users')");
      await expect(page).toHaveURL(/\/users(?:\?|$)/);

      await page.getByRole("link", { name: "View Profile" }).first().click();
      await expect(page).toHaveURL(/\/users\/1/);

      await page.getByRole("link", { name: "Settings" }).click();
      await expect(page).toHaveURL(/\/users\/1\/settings/);

      await page.goBack();
      await expect(page.getByRole("heading", { name: "Alice" })).toBeVisible({
        timeout: 3000,
      });

      await page.goBack();
      await expect(page.getByRole("heading", { name: "Users" })).toBeVisible({
        timeout: 3000,
      });

      await page.goBack();
      await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({
        timeout: 3000,
      });
    });

    test("triple forward restores list → Alice → Settings", async ({
      page,
    }) => {
      await page.goto("/");

      await page.click(".sidebar a:has-text('Users')");
      await expect(page).toHaveURL(/\/users(?:\?|$)/);

      await page.getByRole("link", { name: "View Profile" }).first().click();
      await expect(page).toHaveURL(/\/users\/1/);

      await page.getByRole("link", { name: "Settings" }).click();
      await expect(page).toHaveURL(/\/users\/1\/settings/);

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
      await page.goto("/users");
      await expect(page.locator(".sidebar a:has-text('Users')")).toBeVisible();

      await page.getByRole("link", { name: "View Profile" }).first().click();
      await expect(page.locator(".sidebar a:has-text('Users')")).toBeVisible();
      await expect(page.locator(".sidebar a:has-text('Home')")).toBeVisible();
    });

    test("per-user nav stays when switching Profile ↔ Settings", async ({
      page,
    }) => {
      await page.goto("/users/1");
      await expect(page.getByRole("link", { name: "Profile" })).toBeVisible();

      await page.getByRole("link", { name: "Settings" }).click();
      await expect(page.getByRole("link", { name: "Profile" })).toBeVisible();
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

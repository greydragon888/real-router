import { expect, test, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByPlaceholder("alice@example.com").fill(email);
  await page.getByPlaceholder("any password").fill("password");
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL(/\/dashboard/);
}

test.describe("Public routes — accessible without login", () => {
  test("Home page is accessible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  });

  test("Services page is accessible", async ({ page }) => {
    await page.goto("/services");
    await expect(page.getByRole("heading", { name: "Services" })).toBeVisible();
  });

  test("Contacts page is accessible", async ({ page }) => {
    await page.goto("/contacts");
    await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();
  });

  test("Login page is accessible", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
  });

  test("sidebar shows public links on home", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Services" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Contacts" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Login" })).toBeVisible();
  });
});

test.describe("Login", () => {
  test("fills form and redirects to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("alice@example.com").fill("alice@example.com");
    await page.getByPlaceholder("any password").fill("any");
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("sidebar swaps to private links after login", async ({ page }) => {
    await loginAs(page, "alice@example.com");
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Login" })).not.toBeVisible();
    await expect(page.getByRole("link", { name: "Home" })).not.toBeVisible();
  });

  test("sidebar shows no public links (Services, Contacts) after login", async ({
    page,
  }) => {
    await loginAs(page, "alice@example.com");
    const sidebar = page.locator(".sidebar");
    await expect(
      sidebar.getByRole("link", { name: "Services" }),
    ).not.toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: "Contacts" }),
    ).not.toBeVisible();
  });

  test("dashboard shows logged in user info", async ({ page }) => {
    await loginAs(page, "alice@example.com");
    const card = page.locator(".card").first();
    await expect(card).toContainText("Alice");
    await expect(card).toContainText("admin");
    await expect(card).toContainText("alice@example.com");
  });
});

test.describe("Role-based access (canActivate)", () => {
  test("alice (admin) can access Admin page", async ({ page }) => {
    await loginAs(page, "alice@example.com");
    await page.getByRole("link", { name: "Admin" }).click();
    await page.waitForURL(/\/admin/);
    await expect(
      page.getByRole("heading", { name: "Admin Panel" }),
    ).toBeVisible();
  });

  test("carol (viewer) is blocked from Admin page", async ({ page }) => {
    await loginAs(page, "carol@example.com");
    await page.getByRole("link", { name: "Admin" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("bob (editor) is blocked from Admin page", async ({ page }) => {
    await loginAs(page, "bob@example.com");
    await page.getByRole("link", { name: "Admin" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });
});

test.describe("canDeactivate — Settings", () => {
  test("dismissing confirm stays on settings", async ({ page }) => {
    await loginAs(page, "alice@example.com");
    await page.getByRole("link", { name: "Settings" }).click();
    await page.waitForURL(/\/settings/);
    await page
      .getByPlaceholder("Enter your display name…")
      .fill("unsaved name");
    page.once("dialog", (dialog) => void dialog.dismiss());
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/settings/);
  });

  test("accepting confirm navigates away from settings", async ({ page }) => {
    await loginAs(page, "alice@example.com");
    await page.getByRole("link", { name: "Settings" }).click();
    await page.waitForURL(/\/settings/);
    await page
      .getByPlaceholder("Enter your display name…")
      .fill("unsaved name");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("settings without unsaved changes navigates freely", async ({
    page,
  }) => {
    await loginAs(page, "alice@example.com");
    await page.getByRole("link", { name: "Settings" }).click();
    await page.waitForURL(/\/settings/);
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe("Logout", () => {
  test("logout navigates to home and shows public routes", async ({ page }) => {
    await loginAs(page, "alice@example.com");
    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Login" })).toBeVisible();
  });

  test("private links disappear after logout", async ({ page }) => {
    await loginAs(page, "alice@example.com");
    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Dashboard" }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("link", { name: "Settings" }),
    ).not.toBeVisible();
    await expect(page.getByRole("link", { name: "Admin" })).not.toBeVisible();
  });
});

test.describe("404 and route tree behavior", () => {
  test("private route /dashboard shows 404 when not logged in", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "404 — Page Not Found" }),
    ).toBeVisible();
  });

  test("navigating to non-existent private route shows 404 when logged in", async ({
    page,
  }) => {
    await loginAs(page, "alice@example.com");
    await page.evaluate(() => {
      window.history.pushState({}, "", "/services");
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });
    await expect(
      page.getByRole("heading", { name: "404 — Page Not Found" }),
    ).toBeVisible({ timeout: 3000 });
  });

  test("forwardTo: / redirects to /dashboard when logged in", async ({
    page,
  }) => {
    await loginAs(page, "alice@example.com");
    await page.getByRole("link", { name: "Settings" }).click();
    await page.waitForURL(/\/settings/);
    await page.evaluate(() => {
      window.history.pushState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await page.waitForURL(/\/dashboard/);
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });
});

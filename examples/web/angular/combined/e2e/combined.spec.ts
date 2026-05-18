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
      await expect(page).toHaveURL(/\/users(?:\?|$)/);
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
      await expect(page).toHaveURL(/\/products(?:\?|$)/);
      await expect(page).toHaveURL(/page=1/);
      await expect(page).toHaveURL(/sort=name/);
    });

    test("invalid query params recovered to defaults", async ({ page }) => {
      await login(page);
      // Simulate user landing on bad URL via SPA navigation. page.goto would
      // hard-reload and lose the in-memory auth state, demoting /products to
      // an unknown route (allowNotFound keeps the URL untouched).
      await page.evaluate(() => {
        history.pushState(null, "", "/products?page=-1&sort=invalid");
        dispatchEvent(new PopStateEvent("popstate", { state: null }));
      });
      await expect(page).toHaveURL(/page=1/);
      await expect(page).toHaveURL(/sort=name/);
    });
  });

  test.describe("canDeactivate — interactive confirm", () => {
    test("blocks navigation when user dismisses confirm with unsaved changes", async ({
      page,
    }) => {
      await login(page);
      await page.click(".sidebar a:has-text('Settings')");
      await expect(page).toHaveURL(/\/settings/);

      await page.fill("input[placeholder='Enter your display name…']", "draft");
      await expect(page.locator("text=Unsaved changes")).toBeVisible();

      page.once("dialog", (dialog) => {
        void dialog.dismiss();
      });
      await page.click(".sidebar a:has-text('Dashboard')");

      await expect(page).toHaveURL(/\/settings/);
      await expect(
        page.getByRole("heading", { name: "Settings" }),
      ).toBeVisible();
    });

    test("allows navigation when user accepts confirm with unsaved changes", async ({
      page,
    }) => {
      await login(page);
      await page.click(".sidebar a:has-text('Settings')");
      await expect(page).toHaveURL(/\/settings/);

      await page.fill("input[placeholder='Enter your display name…']", "draft");
      await expect(page.locator("text=Unsaved changes")).toBeVisible();

      page.once("dialog", (dialog) => {
        void dialog.accept();
      });
      await page.click(".sidebar a:has-text('Dashboard')");

      await expect(page).toHaveURL(/\/dashboard/);
      await expect(
        page.getByRole("heading", { name: "Dashboard" }),
      ).toBeVisible();
    });
  });

  test.describe("Login error feedback", () => {
    test("invalid email shows error toast and stays on /login", async ({
      page,
    }) => {
      await page.goto("/login");
      await page.getByPlaceholder("alice@example.com").fill("ghost@nope.com");
      await page.getByPlaceholder("any password").fill("password");
      await page.getByRole("button", { name: "Login" }).click();

      await expect(page.locator(".toast.error")).toBeVisible();
      await expect(page.locator(".toast.error")).toContainText(
        /Invalid credentials/i,
      );
      await expect(page).toHaveURL(/\/login/);
    });

    test("login button is disabled and shows loading text during submit", async ({
      page,
    }) => {
      await page.goto("/login");
      await page.getByPlaceholder("alice@example.com").fill("alice@example.com");
      await page.getByPlaceholder("any password").fill("password");

      const button = page.getByRole("button", { name: /Login|Logging in/ });

      await button.click();
      await expect(button).toBeDisabled();
      await expect(button).toHaveText(/Logging in/);
      await page.waitForURL(/\/dashboard/);
    });
  });

  test.describe("Async guard — interrupted navigation", () => {
    test("clicking another link during checkout guard aborts checkout", async ({
      page,
    }) => {
      await login(page);

      await page.click(".sidebar a:has-text('Checkout')");
      await expect(
        page.locator("[data-testid='progress-bar']"),
      ).toBeVisible({ timeout: 1000 });

      await page.click(".sidebar a:has-text('Dashboard')");

      await page.waitForURL(/\/dashboard/);
      await expect(
        page.getByRole("heading", { name: "Dashboard" }),
      ).toBeVisible();
      await expect(page).not.toHaveURL(/\/checkout/);
      await expect(
        page.locator("[data-testid='progress-bar']"),
      ).toBeHidden({ timeout: 2000 });
    });
  });

  test.describe("Lang toggle reload", () => {
    test("button label inverts and dashboard re-reads param after toggle", async ({
      page,
    }) => {
      await login(page);

      const langLine = page.locator("p", { hasText: "Lang param:" });

      await expect(langLine).toContainText("en");
      await expect(page.getByRole("button", { name: /→ RU/ })).toBeVisible();

      await page.getByRole("button", { name: /→ RU/ }).click();
      await expect(page).toHaveURL(/lang=ru/);
      await expect(langLine).toContainText("ru");
      await expect(page.getByRole("button", { name: /→ EN/ })).toBeVisible();

      await page.getByRole("button", { name: /→ EN/ }).click();
      await expect(page).toHaveURL(/lang=en/);
      await expect(langLine).toContainText("en");
      await expect(page.getByRole("button", { name: /→ RU/ })).toBeVisible();
    });
  });

  test.describe("Role-based access — editor (Bob)", () => {
    test("editor cannot access admin page", async ({ page }) => {
      await login(page, "bob@example.com");
      await page.click(".sidebar a:has-text('Admin')");
      await expect(page).not.toHaveURL(/\/admin/);
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test("editor can access settings page", async ({ page }) => {
      await login(page, "bob@example.com");
      await page.click(".sidebar a:has-text('Settings')");
      await expect(page).toHaveURL(/\/settings/);
      await expect(
        page.getByRole("heading", { name: "Settings" }),
      ).toBeVisible();
    });
  });

  test.describe("Loading states — products list/detail", () => {
    test("products list shows spinner while data loads", async ({ page }) => {
      await login(page);

      const navPromise = page.click(".sidebar a:has-text('Products')");

      await expect(page.locator("main .spinner")).toBeVisible({
        timeout: 1500,
      });
      await expect(page.locator("main")).toContainText(/Loading products/i);

      await navPromise;
      await expect(
        page.locator("main .card:has-text('Laptop')").first(),
      ).toBeVisible({ timeout: 5000 });
      await expect(page.locator("main .spinner")).toBeHidden();
    });

    test("product detail shows spinner while data loads", async ({ page }) => {
      await login(page);
      await page.click(".sidebar a:has-text('Products')");
      await expect(
        page.getByRole("heading", { name: "Products" }),
      ).toBeVisible({ timeout: 5000 });

      await page.getByRole("link", { name: "View Details" }).first().click();

      await expect(page.locator("main .spinner")).toBeVisible({
        timeout: 1500,
      });
      await expect(page.locator("main")).toContainText(/Loading…/);

      await expect(page.getByRole("heading", { name: "Laptop" })).toBeVisible({
        timeout: 5000,
      });
      await expect(page.locator("main .spinner")).toBeHidden();
    });
  });

  test.describe("Detail navigation by id", () => {
    test("clicking 'View Details' on second product navigates to /products/2", async ({
      page,
    }) => {
      await login(page);
      await page.click(".sidebar a:has-text('Products')");
      await expect(
        page.getByRole("heading", { name: "Products" }),
      ).toBeVisible({ timeout: 5000 });

      await page
        .locator(".card", { hasText: "Keyboard" })
        .getByRole("link", { name: /View Details/i })
        .click();

      await expect(page).toHaveURL(/\/products\/2/);
      await expect(
        page.getByRole("heading", { name: "Keyboard" }),
      ).toBeVisible({ timeout: 5000 });
      await expect(page.locator("main")).toContainText("Mechanical keyboard");
    });

    test("back link returns to products list", async ({ page }) => {
      await login(page);
      await page.click(".sidebar a:has-text('Products')");
      await expect(
        page.getByRole("heading", { name: "Products" }),
      ).toBeVisible({ timeout: 5000 });

      await page
        .locator(".card", { hasText: "Monitor" })
        .getByRole("link", { name: /View Details/i })
        .click();
      await expect(page).toHaveURL(/\/products\/3/);
      await expect(page.getByRole("heading", { name: "Monitor" })).toBeVisible({
        timeout: 5000,
      });

      await page.getByRole("link", { name: /Back to Products/i }).click();
      await expect(page).toHaveURL(/\/products(?:\?|$)/);
      await expect(
        page.getByRole("heading", { name: "Products" }),
      ).toBeVisible();
    });
  });

  test.describe("NotFound contents", () => {
    test("404 page renders both heading and helper hint", async ({ page }) => {
      await page.goto("/totally-missing-route");
      await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
      await expect(page.locator("main")).toContainText(/does not exist/i);
      await expect(page.locator("main")).toContainText(
        /Try logging in.*available routes change/i,
      );
    });
  });

  test.describe("Breadcrumb navigation", () => {
    test("clicking 'Users' crumb returns from profile to list", async ({
      page,
    }) => {
      await login(page);
      await page.click(".sidebar a:has-text('Users')");
      await page.click("a:has-text('User #1')");
      await expect(page).toHaveURL(/\/users\/1/);

      await page.locator("nav.breadcrumbs a:has-text('Users')").click();
      await expect(page).toHaveURL(/\/users(?:\?|$)/);
      await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
      await expect(page.locator("nav.breadcrumbs")).not.toContainText(
        "User #1",
      );
    });

    test("clicking 'Home' crumb returns to dashboard via forwardTo", async ({
      page,
    }) => {
      await login(page);
      await page.click(".sidebar a:has-text('Users')");
      await page.click("a:has-text('User #2')");
      await expect(page).toHaveURL(/\/users\/2/);

      await page.locator("nav.breadcrumbs a:has-text('Home')").click();
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });

  test.describe("UserProfile — useRouteNode binding", () => {
    test("renders heading and body matching :id param", async ({ page }) => {
      await login(page);
      await page.click(".sidebar a:has-text('Users')");
      await page.getByRole("link", { name: /User #2/ }).click();

      await expect(page).toHaveURL(/\/users\/2/);
      await expect(
        page.getByRole("heading", { name: "User #2" }),
      ).toBeVisible();
      await expect(page.locator("main")).toContainText("Profile for user 2");
    });

    test("navigating between :id values rerenders profile", async ({ page }) => {
      await login(page);
      await page.click(".sidebar a:has-text('Users')");
      await page.getByRole("link", { name: /User #1/ }).click();
      await expect(
        page.getByRole("heading", { name: "User #1" }),
      ).toBeVisible();

      await page.getByRole("link", { name: /Back to list/i }).click();
      await page.getByRole("link", { name: /User #3/ }).click();

      await expect(
        page.getByRole("heading", { name: "User #3" }),
      ).toBeVisible();
      await expect(page.locator("main")).toContainText("Profile for user 3");
    });
  });

  test.describe("Persistent params — cold start", () => {
    test("cold-load /login?lang=ru preserves param into private session", async ({
      page,
    }) => {
      await page.goto("/login?lang=ru");
      await expect(page).toHaveURL(/lang=ru/);

      await page.getByPlaceholder("alice@example.com").fill("alice@example.com");
      await page.getByPlaceholder("any password").fill("password");
      await page.getByRole("button", { name: "Login" }).click();

      await page.waitForURL(/\/dashboard/);
      await expect(page).toHaveURL(/lang=ru/);
      await expect(page.locator("p", { hasText: "Lang param:" })).toContainText(
        "ru",
      );

      await page.click(".sidebar a:has-text('Users')");
      await expect(page).toHaveURL(/lang=ru/);
    });

    test("cold-load / inherits plugin default 'en'", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/lang=en/);
    });
  });

  test.describe("Browser back during pending guard", () => {
    test("browser back during 600ms checkout guard cancels navigation", async ({
      page,
    }) => {
      await login(page);
      await page.click(".sidebar a:has-text('Products')");
      await expect(page).toHaveURL(/\/products/);
      await expect(
        page.getByRole("heading", { name: "Products" }),
      ).toBeVisible({ timeout: 5000 });

      await page.click(".sidebar a:has-text('Checkout')");
      await expect(
        page.locator("[data-testid='progress-bar']"),
      ).toBeVisible({ timeout: 1000 });

      await page.goBack();

      await expect(page).not.toHaveURL(/\/checkout/);
      await expect(
        page.locator("[data-testid='progress-bar']"),
      ).toBeHidden({ timeout: 2000 });
    });
  });
});

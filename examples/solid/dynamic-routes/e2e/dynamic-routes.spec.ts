import { expect, test } from "@playwright/test";

test.describe("Initial route state", () => {
  test("shows only base routes in sidebar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
    await expect(page.getByRole("link", { name: "About" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Analytics" }),
    ).not.toBeVisible();
    await expect(page.getByRole("link", { name: "Admin" })).not.toBeVisible();
  });

  test("route tree shows only base routes", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("home (/)")).toBeVisible();
    await expect(page.getByText("about (/about)")).toBeVisible();
    await expect(page.getByText("analytics (/analytics)")).not.toBeVisible();
  });

  test("home page is accessible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  });

  test("about page is accessible", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
  });
});

test.describe("Analytics feature flag toggle", () => {
  test("enabling Analytics adds link to sidebar", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("checkbox", { name: "Analytics" }).check();
    await expect(page.getByRole("link", { name: "Analytics" })).toBeVisible();
  });

  test("enabling Analytics updates route tree display", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("checkbox", { name: "Analytics" }).check();
    await expect(page.getByText("analytics (/analytics)")).toBeVisible();
  });

  test("Analytics route is navigable after enabling", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("checkbox", { name: "Analytics" }).check();
    await page.getByRole("link", { name: "Analytics" }).click();
    await page.waitForURL(/\/analytics/);
    await expect(
      page.getByRole("heading", { name: "Analytics" }),
    ).toBeVisible();
  });

  test("disabling Analytics removes link from sidebar", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("checkbox", { name: "Analytics" }).check();
    await expect(page.getByRole("link", { name: "Analytics" })).toBeVisible();
    await page.getByRole("checkbox", { name: "Analytics" }).uncheck();
    await expect(
      page.getByRole("link", { name: "Analytics" }),
    ).not.toBeVisible();
  });

  test("disabling Analytics while on analytics route redirects to home", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("checkbox", { name: "Analytics" }).check();
    await page.getByRole("link", { name: "Analytics" }).click();
    await page.waitForURL(/\/analytics/);
    await page.getByRole("checkbox", { name: "Analytics" }).uncheck();
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await expect(page).toHaveURL("/");
  });
});

test.describe("Admin feature flag toggle", () => {
  test("enabling Admin Panel adds admin links to sidebar", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("checkbox", { name: "Admin Panel" }).check();
    await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Users" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  });

  test("Admin route is navigable after enabling", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("checkbox", { name: "Admin Panel" }).check();
    await page.getByRole("link", { name: "Admin" }).click();
    await page.waitForURL(/\/admin/);
    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
  });

  test("disabling Admin Panel removes links from sidebar", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("checkbox", { name: "Admin Panel" }).check();
    await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
    await page.getByRole("checkbox", { name: "Admin Panel" }).uncheck();
    await expect(page.getByRole("link", { name: "Admin" })).not.toBeVisible();
  });
});

test.describe("Multiple feature flags", () => {
  test("both Analytics and Admin can be enabled simultaneously", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("checkbox", { name: "Analytics" }).check();
    await page.getByRole("checkbox", { name: "Admin Panel" }).check();
    await expect(page.getByRole("link", { name: "Analytics" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
  });

  test("toggling multiple times does not crash", async ({ page }) => {
    await page.goto("/");
    const analyticsCheckbox = page.getByRole("checkbox", {
      name: "Analytics",
    });

    await analyticsCheckbox.check();
    await analyticsCheckbox.uncheck();
    await analyticsCheckbox.check();
    await expect(page.getByRole("link", { name: "Analytics" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  });
});

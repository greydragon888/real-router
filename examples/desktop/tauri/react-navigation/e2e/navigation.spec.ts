import { expect, test } from "@playwright/test";

test.describe("Tauri frontend — navigation-plugin exclusive features", () => {
  test("getVisitedRoutes grows after navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Visited routes (1)")).toBeVisible();
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page.getByText("Visited routes (2)")).toBeVisible();
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByText("Visited routes (3)")).toBeVisible();
  });

  test("getRouteVisitCount reflects repeated visits", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Dashboard" }).click();
    await page.getByRole("link", { name: "Home" }).click();
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(
      page.getByRole("listitem").filter({ hasText: /^\s*dashboard × 2\s*$/ }),
    ).toBeVisible();
  });

  test("hasVisited marks sidebar Link with ✓", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /Dashboard/ }),
    ).not.toContainText("✓");
    await page.getByRole("link", { name: "Dashboard" }).click();
    await page.getByRole("link", { name: "Home" }).click();
    await expect(
      page.getByRole("link", { name: /Dashboard/ }),
    ).toContainText("✓");
  });

  test("hasVisited differentiates users / users.user / users.user.edit", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Users" }).click();
    await expect(
      page.getByRole("listitem").filter({ hasText: /^\s*users × 1\s*$/ }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Alice" }).click();
    await expect(
      page.getByRole("listitem").filter({ hasText: /^\s*users\.user × 1\s*$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem").filter({ hasText: /users\.user\.edit/ }),
    ).toHaveCount(0);

    await page.getByRole("link", { name: "Edit" }).click();
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: /^\s*users\.user\.edit × 1\s*$/ }),
    ).toBeVisible();
  });

  test("getRouteVisitCount ignores :id params", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Users" }).click();
    await page.getByRole("link", { name: "Alice" }).click();
    await page.getByRole("link", { name: "Users" }).click();
    await page.getByRole("link", { name: "Bob" }).click();
    await page.getByRole("link", { name: "Users" }).click();
    await page.getByRole("link", { name: "Carol" }).click();
    await expect(
      page.getByRole("listitem").filter({ hasText: /^\s*users\.user × 3\s*$/ }),
    ).toBeVisible();
  });

  test("peekBack / peekForward update around current entry", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Dashboard" }).click();
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByText("← previous: dashboard")).toBeVisible();
    await expect(page.getByText("(no forward)")).toBeVisible();

    await page.goBack();
    await expect(page.getByText("← previous: home")).toBeVisible();
    await expect(page.getByText("next: settings →")).toBeVisible();
  });

  test("canGoBack / canGoForward toggle buttons", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Back" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Forward" })).toBeDisabled();

    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page.getByRole("button", { name: "Back" })).toBeEnabled();

    await page.goBack();
    await expect(page.getByRole("button", { name: "Forward" })).toBeEnabled();
  });

  test("canGoBackTo + traverseToLast", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: /Jump to last Dashboard/ }),
    ).toBeDisabled();

    await page.getByRole("link", { name: "Dashboard" }).click();
    await page.getByRole("link", { name: "Home" }).click();

    await page.getByRole("button", { name: /Jump to last Dashboard/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

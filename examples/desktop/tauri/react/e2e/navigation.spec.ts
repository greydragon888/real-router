import { expect, test } from "@playwright/test";

test.describe("Tauri frontend — React + browser-plugin", () => {
  test("home loads at /", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  });

  test("navigates to /dashboard preserving history", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("list → detail → edit flow via Link clicks (3-level nesting)", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Users" }).click();
    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByRole("link", { name: "Alice" })).toBeVisible();

    await page.getByRole("link", { name: "Alice" }).click();
    await expect(page).toHaveURL(/\/users\/42$/);
    await expect(page.getByText("User ID: 42")).toBeVisible();

    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/users\/42\/edit$/);
    await expect(page.getByRole("textbox")).toHaveValue("42");
  });

  test("deep link: direct load of /users/42/edit decodes params at 3rd level", async ({
    page,
  }) => {
    await page.goto("/users/42/edit");
    await expect(page.getByRole("textbox")).toHaveValue("42");
  });

  test("back preserves path after Dashboard → Settings", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Dashboard" }).click();
    await page.getByRole("link", { name: "Settings" }).click();
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

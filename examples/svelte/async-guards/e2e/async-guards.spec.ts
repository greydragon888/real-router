import { expect, test } from "@playwright/test";

test.describe("Home page", () => {
  test("is accessible and shows cart controls", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: /Cart has items/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Go to Checkout (500ms guard)" }),
    ).toBeVisible();
  });
});

test.describe("Checkout async guard", () => {
  test("navigates to checkout when cart has items", async ({ page }) => {
    await page.goto("/checkout");
    await expect(
      page.getByRole("heading", { name: "Checkout" }),
    ).toBeVisible();
    await expect(page.getByText("You reached checkout")).toBeVisible();
  });

  test("progress bar visible during 500ms guard then gone", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Checkout" }).click();
    await expect(page.locator(".progress-bar")).toBeVisible({ timeout: 2000 });
    await page.waitForURL(/\/checkout/);
    await expect(page.locator(".progress-bar")).not.toBeVisible();
  });

  test("navigation via Go to Checkout button lands on checkout", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Go to Checkout (500ms guard)" })
      .click();
    await page.waitForURL(/\/checkout/);
    await expect(
      page.getByRole("heading", { name: "Checkout" }),
    ).toBeVisible();
  });

  test("empty cart blocks checkout navigation and shows toast", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("checkbox", { name: /Cart has items/ })
      .uncheck();
    await page
      .getByRole("button", { name: "Go to Checkout (500ms guard)" })
      .click();
    await expect(page).toHaveURL("/");
    await expect(page.getByText("CANNOT_ACTIVATE")).toBeVisible({
      timeout: 3000,
    });
  });
});

test.describe("Editor canDeactivate guard", () => {
  test("editor page has textarea for content", async ({ page }) => {
    await page.goto("/editor");
    await expect(page.getByRole("heading", { name: "Editor" })).toBeVisible();
    await expect(
      page.getByPlaceholder("Type here to create unsaved changes..."),
    ).toBeVisible();
  });

  test("dismissing confirm stays on editor", async ({ page }) => {
    await page.goto("/editor");
    await page
      .getByPlaceholder("Type here to create unsaved changes...")
      .fill("some unsaved content");
    page.once("dialog", (dialog) => void dialog.dismiss());
    await page.getByRole("link", { name: "About" }).click();
    await expect(page).toHaveURL(/\/editor/);
    await expect(page.getByRole("heading", { name: "Editor" })).toBeVisible();
  });

  test("accepting confirm navigates away from editor", async ({ page }) => {
    await page.goto("/editor");
    await page
      .getByPlaceholder("Type here to create unsaved changes...")
      .fill("some unsaved content");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("link", { name: "About" }).click();
    await expect(page).toHaveURL(/\/about/);
    await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
  });
});

test.describe("About page", () => {
  test("is accessible directly", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
  });
});

test.describe("Cancellation via AbortController", () => {
  test("Checkout to About button ends up on About page", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Checkout \u2192 About (cancellation)" })
      .click();
    await page.waitForURL(/\/about/, { timeout: 5000 });
    await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
  });
});

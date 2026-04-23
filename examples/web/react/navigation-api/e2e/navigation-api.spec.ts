import { expect, test } from "@playwright/test";

test.describe("Scenario 1 — Smart Back/Forward buttons", () => {
  test("both buttons disabled at start", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "← (nothing)" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "(nothing) →" }),
    ).toBeDisabled();
  });

  test("Back shows ← Home after Home → Products", async ({ page }) => {
    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await expect(page).toHaveURL(/\/products$/);
    await expect(page.getByRole("button", { name: "← Home" })).toBeEnabled();
  });

  test("Forward shows Products → after Back", async ({ page }) => {
    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await expect(page).toHaveURL(/\/products$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("button", { name: "Products →" }),
    ).toBeEnabled();
  });

  test("paramized labels expose peekBack params.id", async ({ page }) => {
    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await page.getByRole("link", { name: "Product #5" }).click();
    await expect(page).toHaveURL(/\/products\/5$/);
    await expect(
      page.getByRole("button", { name: "← Products" }),
    ).toBeEnabled();
    await page.goBack();
    await expect(page).toHaveURL(/\/products$/);
    await expect(
      page.getByRole("button", { name: "Product #5 →" }),
    ).toBeEnabled();
  });
});

test.describe("Scenario 2 — Visit tracking", () => {
  test("after load Home sidebar shows NEW on non-home entries", async ({
    page,
  }) => {
    await page.goto("/");
    const sidebar = page.locator(".sidebar");
    await expect(
      sidebar.locator(".sidebar-link", { hasText: "Home" }).locator(".badge"),
    ).toHaveText(/✓/);
    for (const label of [
      "Products",
      "Categories",
      "Cart",
      "Checkout",
      "About",
    ]) {
      await expect(
        sidebar
          .locator(".sidebar-link", { hasText: label })
          .locator(".badge"),
      ).toHaveText("NEW");
    }
  });

  test("visiting Products updates badge and progress bar", async ({ page }) => {
    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await expect(page).toHaveURL(/\/products$/);
    const productsBadge = page
      .locator(".sidebar-link", { hasText: "Products" })
      .locator(".badge");
    await expect(productsBadge).toHaveText("✓ ×1");
    await expect(page.locator(".progress-label")).toHaveText(
      "Explored: 2 / 6 routes",
    );
  });
});

test.describe("Scenario 3 — Return to last visit", () => {
  test.beforeEach(async ({ page }) => {
    // Stack: / → /products → /products/1 → /categories → /cart → /products/2.
    // Last `products` visit is two entries above /products/2 (not one), so
    // `history.back` and `traverseToLast("products")` lead to *different*
    // destinations — that's what the two tests below pin. We stop on the
    // Product detail page (not Edit) — Edit triggers the Scenario 5
    // canDeactivate guard, which is orthogonal to what this suite tests.
    // Navigation to /products/2 without visiting the products list first is
    // done via the direct-URL navigator path: open /products/2 by address.
    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await page.getByRole("link", { name: "Product #1" }).click();
    await page.locator(".sidebar-link", { hasText: "Categories" }).click();
    await page.locator(".sidebar-link", { hasText: "Cart" }).click();
    await page.goto("/products/2");
    await expect(page).toHaveURL(/\/products\/2$/);
  });

  test("traverseToLast jumps to /products through intermediate entries", async ({
    page,
  }) => {
    await page
      .getByRole("button", { name: "← Return to Products list" })
      .click();
    await expect(page).toHaveURL(/\/products$/);
  });

  test("history.back from same stack goes to /cart (not /products)", async ({
    page,
  }) => {
    await page.goBack();
    await expect(page).toHaveURL(/\/cart$/);
  });
});

test.describe("Scenario 4 — Direction-aware animations", () => {
  test("push navigation attaches slide-left class", async ({ page }) => {
    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await expect(page).toHaveURL(/\/products$/);
    await expect(page.locator("[data-direction]")).toHaveAttribute(
      "data-direction",
      "forward",
    );
  });

  test("history.back attaches slide-right class", async ({ page }) => {
    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await expect(page).toHaveURL(/\/products$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("[data-direction]")).toHaveAttribute(
      "data-direction",
      "back",
    );
  });
});

test.describe("Scenario 5 — History-aware guard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await page.getByRole("link", { name: "Product #5" }).click();
    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/products\/5\/edit$/);
    await page.getByLabel("Product notes").fill("unsaved changes");
  });

  test("dismissing confirm keeps user on edit page", async ({ page }) => {
    page.once("dialog", (dialog) => {
      void dialog.dismiss();
    });
    await page.goBack();
    await expect(page).toHaveURL(/\/products\/5\/edit$/);
  });

  test("accepting confirm leaves to previous route", async ({ page }) => {
    page.once("dialog", (dialog) => {
      void dialog.accept();
    });
    await page.goBack();
    await expect(page).toHaveURL(/\/products\/5$/);
  });

  test("programmatic Link and Save do not trigger the dialog", async ({
    page,
  }) => {
    let dialogCount = 0;
    page.on("dialog", (dialog) => {
      dialogCount += 1;
      void dialog.dismiss();
    });

    await page.locator(".sidebar-link", { hasText: "About" }).click();
    await expect(page).toHaveURL(/\/about$/);

    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await page.getByRole("link", { name: "Product #5" }).click();
    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByLabel("Product notes").fill("more unsaved content");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/products\/5$/);

    expect(dialogCount).toBe(0);
  });
});

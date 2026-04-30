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

  test("empty notes + browser back: no draft → no confirm", async ({
    page,
  }) => {
    await page.getByLabel("Product notes").fill("");

    let dialogCount = 0;

    page.on("dialog", (dialog) => {
      dialogCount += 1;
      void dialog.dismiss();
    });

    await page.goBack();
    await expect(page).toHaveURL(/\/products\/5$/);
    expect(dialogCount).toBe(0);
  });

  test("direct cold-load /products/5/edit does not trigger guard on initial render", async ({
    page,
  }) => {
    let dialogCount = 0;

    page.on("dialog", (dialog) => {
      dialogCount += 1;
      void dialog.dismiss();
    });

    await page.goto("/products/5/edit");
    await expect(page.getByRole("heading", { name: "Edit Product #5" })).toBeVisible();
    expect(dialogCount).toBe(0);
  });
});

test.describe("Scenario 1 — peekBack labels (extended)", () => {
  test("title attribute exposes destination path", async ({ page }) => {
    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await expect(page).toHaveURL(/\/products$/);

    const backBtn = page.getByRole("button", { name: "← Home" });

    await expect(backBtn).toHaveAttribute("title", "Go back to /");
  });

  test("Forward becomes disabled after consuming forward entry", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await page.goBack();
    await expect(page.getByRole("button", { name: "Products →" })).toBeEnabled();

    await page.goForward();
    await expect(page).toHaveURL(/\/products$/);
    await expect(
      page.getByRole("button", { name: "(nothing) →" }),
    ).toBeDisabled();
  });

  test("peekBack label '← Edit #5' after Edit → Product back-traversal preview", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await page.getByRole("link", { name: "Product #5" }).click();
    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/products\/5\/edit$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/products\/5$/);

    await expect(
      page.getByRole("button", { name: "Edit #5 →" }),
    ).toBeEnabled();
  });
});

test.describe("Scenario 2 — Visit tracking (extended)", () => {
  test("revisiting a route increments the counter to ×2", async ({ page }) => {
    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await expect(page).toHaveURL(/\/products$/);
    await page.locator(".sidebar-link", { hasText: "Home" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await expect(page).toHaveURL(/\/products$/);

    await expect(
      page
        .locator(".sidebar-link", { hasText: "Products" })
        .locator(".badge"),
    ).toHaveText("✓ ×2");
  });

  test("visiting all 6 routes fills progress to 6/6 and 100%", async ({
    page,
  }) => {
    await page.goto("/");
    for (const label of ["Products", "Categories", "Cart", "Checkout", "About"]) {
      await page.locator(".sidebar-link", { hasText: label }).click();
    }

    await expect(page.locator(".progress-label")).toHaveText(
      "Explored: 6 / 6 routes",
    );
    await expect(page.locator(".progress-bar")).toHaveAttribute(
      "aria-valuenow",
      "6",
    );
    await expect(page.locator(".progress-fill")).toHaveAttribute(
      "style",
      /width:\s*100%/,
    );
  });

  test("active sidebar link highlights the current route", async ({ page }) => {
    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();

    const activeLink = page.locator(".sidebar-link.active");

    await expect(activeLink).toHaveCount(1);
    await expect(activeLink).toContainText("Products");
  });
});

test.describe("Scenario 3 — Return banner visibility (extended)", () => {
  test("banner is hidden on Home and About cold-load", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "← Return to Products list" }),
    ).toHaveCount(0);

    await page.locator(".sidebar-link", { hasText: "About" }).click();
    await expect(
      page.getByRole("button", { name: "← Return to Products list" }),
    ).toHaveCount(0);
  });

  test("banner is hidden on the Products list page itself", async ({ page }) => {
    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await expect(
      page.getByRole("button", { name: "← Return to Products list" }),
    ).toHaveCount(0);
  });

  test("banner appears on Edit page after visiting Products", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await page.getByRole("link", { name: "Product #1" }).click();
    await page.getByRole("link", { name: "Edit" }).click();

    await expect(
      page.getByRole("button", { name: "← Return to Products list" }),
    ).toBeVisible();
  });

  test("banner disappears after traverseToLast lands on /products", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await page.getByRole("link", { name: "Product #1" }).click();
    await page.locator(".sidebar-link", { hasText: "Categories" }).click();
    await page.locator(".sidebar-link", { hasText: "Cart" }).click();
    await page.goto("/products/2");

    const banner = page.getByRole("button", { name: "← Return to Products list" });

    await expect(banner).toBeVisible();
    await banner.click();
    await expect(page).toHaveURL(/\/products$/);
    await expect(
      page.getByRole("button", { name: "← Return to Products list" }),
    ).toHaveCount(0);
  });
});

test.describe("Scenario 4 — Animation classes (extended)", () => {
  test("cold-load applies 'page slide-left' class via activation priming", async ({
    page,
  }) => {
    // Chrome 123+ exposes `navigation.activation.navigationType`. The plugin
    // primes `state.context.navigation` from it on the first transition, so
    // a cross-document goto("/") arrives with direction="forward" (push), not
    // "unknown". See packages/navigation-plugin CLAUDE.md "Cross-document
    // Activation Priming".
    await page.goto("/");
    const animated = page.locator("[data-direction]");

    await expect(animated).toHaveAttribute("data-direction", "forward");
    await expect(animated).toHaveClass(/page slide-left/);
  });

  test("forward navigation applies 'page slide-left' class", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await expect(page.locator("[data-direction]")).toHaveClass(
      /page slide-left/,
    );
  });

  test("back navigation applies 'page slide-right' class", async ({ page }) => {
    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await page.goBack();
    await expect(page.locator("[data-direction]")).toHaveClass(
      /page slide-right/,
    );
  });

  test("paginator (programmatic navigate) is direction=forward", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await page.getByRole("link", { name: "Product #2" }).click();
    await expect(page).toHaveURL(/\/products\/2$/);

    await page.getByRole("button", { name: "← Prev" }).click();
    await expect(page).toHaveURL(/\/products\/1$/);
    await expect(page.locator("[data-direction]")).toHaveAttribute(
      "data-direction",
      "forward",
    );
  });
});

test.describe("Paginator (Prev/Next on Product detail)", () => {
  test("Prev disabled on first product (id=1), Next enabled", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await page.getByRole("link", { name: "Product #1" }).click();

    await expect(page.getByRole("button", { name: "← Prev" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Next →" })).toBeEnabled();
  });

  test("Next disabled on last product (id=5), Prev enabled", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(".sidebar-link", { hasText: "Products" }).click();
    await page.getByRole("link", { name: "Product #5" }).click();

    await expect(page.getByRole("button", { name: "← Prev" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Next →" })).toBeDisabled();
  });

  test("Next walks 1 → 2 → 3 → 5 (skipping the absent 4)", async ({ page }) => {
    await page.goto("/products/1");
    await expect(page.getByRole("heading", { name: "Product #1" })).toBeVisible();

    await page.getByRole("button", { name: "Next →" }).click();
    await expect(page).toHaveURL(/\/products\/2$/);

    await page.getByRole("button", { name: "Next →" }).click();
    await expect(page).toHaveURL(/\/products\/3$/);

    await page.getByRole("button", { name: "Next →" }).click();
    await expect(page).toHaveURL(/\/products\/5$/);
  });

  test("ID outside the paginator list (id=4) disables both Prev and Next", async ({
    page,
  }) => {
    await page.goto("/products/4");
    await expect(page.getByRole("heading", { name: "Product #4" })).toBeVisible();

    await expect(page.getByRole("button", { name: "← Prev" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Next →" })).toBeDisabled();
  });
});

test.describe("Edit page draft persistence", () => {
  test("draft survives page reload", async ({ page }) => {
    await page.goto("/products/3/edit");
    await page.getByLabel("Product notes").fill("draft survives reload");
    await page.reload();
    await expect(page.getByLabel("Product notes")).toHaveValue(
      "draft survives reload",
    );
  });

  test("Save clears the stored draft for that product", async ({ page }) => {
    await page.goto("/products/3/edit");
    await page.getByLabel("Product notes").fill("about to save");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/products\/3$/);

    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page.getByLabel("Product notes")).toHaveValue("");
  });

  test("drafts are scoped per product id", async ({ page }) => {
    await page.goto("/products/3/edit");
    await page.getByLabel("Product notes").fill("notes for #3");
    await page.goto("/products/5/edit");
    await expect(page.getByLabel("Product notes")).toHaveValue("");

    await page.goto("/products/3/edit");
    await expect(page.getByLabel("Product notes")).toHaveValue("notes for #3");
  });
});

test.describe("NotFound", () => {
  test("renders 404 heading and explanatory copy on unknown URL", async ({
    page,
  }) => {
    await page.goto("/nope-not-a-route");
    await expect(
      page.getByRole("heading", { name: "404 — Page Not Found" }),
    ).toBeVisible();
    await expect(page.locator("main")).toContainText(/does not exist/i);
  });
});

// Feature-detect fallback (no Navigation API) is intentionally not tested in
// Chromium e2e: the global `navigation` property is non-configurable and
// non-deletable in real Chromium, so `"navigation" in globalThis` cannot be
// faked from page-side script without rewriting the app's feature-detect to
// be mockable. In production this branch fires for Firefox / Safari < 26.2.

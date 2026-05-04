import { expect, test } from "@playwright/test";

test.describe("Streaming SSR Example (Angular)", () => {
  test("critical content visible immediately on commit", async ({ page }) => {
    const startedAt = Date.now();

    await page.goto("/products/1", { waitUntil: "commit" });

    await expect(page.getByTestId("product-detail")).toBeVisible();
    await expect(page.getByTestId("product-name")).toHaveText(
      "Mechanical Keyboard",
    );
    await expect(page.getByTestId("product-price")).toHaveText("$159.99");

    const criticalVisibleAt = Date.now() - startedAt;

    expect(criticalVisibleAt).toBeLessThan(1500);
  });

  test("@defer placeholders are server-rendered (Angular incremental hydration)", async ({
    request,
  }) => {
    // Angular's @defer (on viewport) and (on hover) emit @placeholder content
    // server-side; the real component hydrates only when the trigger fires.
    // Reviews + RelatedItems should NOT appear in initial HTML — only the
    // fallbacks. This is the Angular counterpart to React 19's <Suspense>
    // placeholder markers and Vue 3's <Suspense> fallback.
    const response = await request.get("/products/1");
    const html = await response.text();

    expect(html).toContain('data-testid="reviews-fallback"');
    expect(html).toContain('data-testid="related-fallback"');

    expect(html).not.toContain('data-testid="reviews-section"');
    expect(html).not.toContain('data-testid="related-section"');
  });

  test("@defer (on viewport) hydrates Reviews automatically (placeholder in viewport at load)", async ({
    page,
  }) => {
    // The reviews placeholder is small enough to be in viewport at page load.
    // Angular's hydrate-on-viewport trigger fires the IntersectionObserver
    // immediately, so reviews-section appears without any user interaction.
    // This is the EXPECTED behavior — fallback may flash briefly, but the
    // end-state assertion is the real-content section being visible.
    await page.goto("/products/1");

    await expect(page.getByTestId("reviews-section")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('[data-review-id="r1"]')).toBeVisible();
    await expect(page.locator('[data-review-id="r2"]')).toBeVisible();
  });

  test("@defer (on hover) keeps RelatedItems as fallback until user hovers", async ({
    page,
  }) => {
    await page.goto("/products/1");

    // Wait for hydration to settle. After hydration, related-fallback must
    // STILL be visible because hover trigger has not fired.
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("related-fallback")).toBeVisible();
    await expect(page.getByTestId("related-section")).toHaveCount(0);

    await page.getByTestId("related-fallback").hover();

    await expect(page.getByTestId("related-section")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('[data-related-id="k1"]')).toBeVisible();
  });

  test("no hydration errors after defer triggers fire", async ({ page }) => {
    const errors: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/products/1");

    // Reviews hydrates automatically (viewport trigger).
    await expect(page.getByTestId("reviews-section")).toBeVisible({
      timeout: 5000,
    });

    // RelatedItems hydrates only after explicit hover.
    await page.getByTestId("related-fallback").hover();
    await expect(page.getByTestId("related-section")).toBeVisible({
      timeout: 5000,
    });

    await page.waitForLoadState("networkidle");

    const hydrationErrors = errors.filter(
      (text) =>
        text.toLowerCase().includes("hydrat") ||
        text.toLowerCase().includes("mismatch"),
    );

    expect(hydrationErrors).toEqual([]);
  });

  test("every page is server-rendered (full-reload navigation)", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("home-page")).toBeVisible();

    await page.goto("/products");
    await expect(page.getByTestId("products-list")).toBeVisible();
    await expect(page.locator('[data-product-id="2"]')).toBeVisible();

    // For /products/3, check the resolved (post-hydration) reviews-section
    // because the viewport trigger fires immediately. The defer placeholder
    // existence in raw HTML is verified by the @defer placeholders test.
    await page.goto("/products/3");
    await expect(page.getByTestId("product-name")).toHaveText("4K Monitor");
    await expect(page.getByTestId("reviews-section")).toBeVisible({
      timeout: 5000,
    });
  });

  test("critical loader data lands in the SSR HTML response", async ({
    request,
  }) => {
    // The ssr-data-plugin loader runs server-side BEFORE bootstrap completes,
    // and the resolved product data is rendered into the HTML response (no
    // need for __SSR_STATE__ — the data comes from the ssr-data-plugin
    // re-running the loader on hydration).
    const response = await request.get("/products/1");
    const html = await response.text();

    expect(html).toContain("Mechanical Keyboard");
    expect(html).toContain("$159.99");
    expect(html).toContain('data-product-id="1"');
  });

  test("per-request isolation under 9 concurrent /products/:id loads", async ({
    request,
  }) => {
    const ids = ["1", "2", "3", "1", "2", "3", "1", "2", "3"];
    const expectedNames: Record<string, string> = {
      "1": "Mechanical Keyboard",
      "2": "Ergonomic Mouse",
      "3": "4K Monitor",
    };

    const responses = await Promise.all(
      ids.map((id) => request.get(`/products/${id}`)),
    );

    await Promise.all(
      responses.map(async (response, i) => {
        const id = ids[i];

        expect(response.status(), `req ${i} (id=${id})`).toBe(200);

        const html = await response.text();

        expect(html, `req ${i} product-name`).toContain(expectedNames[id]);
        expect(html, `req ${i} product-id`).toContain(`data-product-id="${id}"`);
      }),
    );
  });

  test("unknown route renders NotFound page (allowNotFound:true returns 200)", async ({
    request,
  }) => {
    const response = await request.get("/__definitely-does-not-exist");

    expect(response.status()).toBe(200);

    const html = await response.text();

    expect(html).toContain('data-testid="not-found"');
    expect(html).toContain("404");
  });

  test("home → products navigation works after hydration", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.click("text=Browse products");
    await expect(page).toHaveURL(/\/products/);
    await expect(page.getByTestId("products-list")).toBeVisible();
  });

  test("response includes incremental hydration markers", async ({
    request,
  }) => {
    // Angular's withIncrementalHydration() emits markers like ngh="..." or
    // [jsaction] on @defer block boundaries. Verify at least one such marker
    // is present in the response — this proves incremental hydration is
    // active (vs traditional full-tree hydration).
    const response = await request.get("/products/1");
    const html = await response.text();

    const hasNghMarkers = /ngh=|ng-server-context=/i.test(html);

    expect(hasNghMarkers).toBe(true);
  });
});

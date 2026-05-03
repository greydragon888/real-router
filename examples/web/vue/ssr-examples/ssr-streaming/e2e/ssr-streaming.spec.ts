import { expect, test } from "@playwright/test";

test.describe("Streaming SSR Example (Vue)", () => {
  test("Scenario 1: shell renders before deferred content (TTFB fast, critical visible early)", async ({
    page,
  }) => {
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

  test("Scenario 2: streaming response contains resolved deferred content", async ({
    request,
  }) => {
    const response = await request.get("/products/1", {
      headers: { Accept: "text/html" },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/html");

    const html = await response.text();

    expect(html).toContain('data-testid="reviews-section"');
    expect(html).toContain('data-testid="related-section"');
  });

  test("Scenario 3: deferred sections render after critical content", async ({
    page,
  }) => {
    await page.goto("/products/1");

    await expect(page.getByTestId("product-name")).toBeVisible();

    await expect(page.getByTestId("reviews-section")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId("related-section")).toBeVisible({
      timeout: 5000,
    });

    await expect(page.locator('[data-review-id="r1"]')).toBeVisible();
    await expect(page.locator('[data-review-id="r2"]')).toBeVisible();
    await expect(page.locator('[data-related-id="k1"]')).toBeVisible();
  });

  test("Scenario 4: no hydration errors after stream completes", async ({
    page,
  }) => {
    const errors: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/products/1");
    await expect(page.getByTestId("reviews-section")).toBeVisible({
      timeout: 5000,
    });
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

  test("Scenario 5: every page is server-rendered with streaming (full-reload navigation)", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("home-page")).toBeVisible();

    await page.goto("/products");
    await expect(page.getByTestId("products-list")).toBeVisible();
    await expect(page.locator('[data-product-id="2"]')).toBeVisible();

    await page.goto("/products/3");
    await expect(page.getByTestId("product-name")).toHaveText("4K Monitor");
    await expect(page.getByTestId("reviews-section")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId("related-section")).toBeVisible({
      timeout: 5000,
    });
  });

  test("Scenario 6: critical loader data lands in __SSR_STATE__ inline script", async ({
    request,
  }) => {
    const response = await request.get("/products/1");
    const html = await response.text();

    const ssrStateMatch = html.match(/window\.__SSR_STATE__=({.*?})<\/script>/);

    expect(ssrStateMatch?.[1]).toBeDefined();

    const ssrState = JSON.parse(ssrStateMatch![1]) as {
      name: string;
      params: { id: string };
      context?: {
        data?: { product?: { id: string; name: string; price: number } };
      };
    };

    expect(ssrState.name).toBe("products.detail");
    expect(ssrState.params).toEqual({ id: "1" });
    expect(ssrState.context?.data?.product).toEqual(
      expect.objectContaining({
        id: "1",
        name: "Mechanical Keyboard",
        price: 159.99,
      }),
    );
  });

  test("Scenario 7: per-request isolation under 9 concurrent /products/:id loads", async ({
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

        const ssrStateMatch = html.match(
          /window\.__SSR_STATE__=({.*?})<\/script>/,
        );
        const ssrState = JSON.parse(ssrStateMatch![1]) as {
          params: { id: string };
          context?: { data?: { product?: { id: string; name: string } } };
        };

        expect(ssrState.params.id, `req ${i} state params`).toBe(id);
        expect(
          ssrState.context?.data?.product?.id,
          `req ${i} loader id`,
        ).toBe(id);
        expect(
          ssrState.context?.data?.product?.name,
          `req ${i} loader name`,
        ).toBe(expectedNames[id]);
      }),
    );
  });

  test("Scenario 8: deferred section data arrives in stream chunks", async ({
    request,
  }) => {
    const response = await request.get("/products/1");
    const html = await response.text();

    expect(html).toContain('data-review-id="r1"');
    expect(html).toContain('data-review-id="r2"');
    expect(html).toContain('data-related-id="k1"');
    expect(html).toContain('data-related-id="k2"');
  });

  test("Scenario 9: Suspense error containment — rejected reviews promise renders boundary fallback, rest of page unaffected", async ({
    page,
  }) => {
    const errors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/products/4");

    await expect(page.getByTestId("product-name")).toHaveText(
      "Broken Reviews Demo",
    );

    await expect(page.getByTestId("reviews-error")).toBeVisible();
    await expect(page.getByTestId("reviews-error")).toContainText(
      "Reviews service unavailable",
    );

    await expect(page.getByTestId("reviews-section")).toHaveCount(0);

    await expect(page.getByTestId("related-section")).toBeVisible({
      timeout: 5000,
    });

    await page.waitForLoadState("networkidle");

    const hydrationErrors = errors.filter(
      (e) =>
        e.toLowerCase().includes("hydrat") ||
        e.toLowerCase().includes("mismatch"),
    );

    expect(hydrationErrors).toEqual([]);
  });
});

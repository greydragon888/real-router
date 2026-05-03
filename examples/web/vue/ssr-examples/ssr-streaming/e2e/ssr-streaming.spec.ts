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

  test("Scenario 10: unknown route returns 404 with NotFound page", async ({
    request,
  }) => {
    const response = await request.get("/__definitely-does-not-exist");

    expect(response.status()).toBe(404);

    const html = await response.text();

    expect(html).toContain('data-testid="not-found"');
    expect(html).toContain("404");
  });

  test("Scenario 11: critical content precedes deferred sections in the streamed HTML", async ({
    request,
  }) => {
    // Vue 3 has no out-of-order Suspense placeholders, so we cannot assert on
    // <!--$?--> markers as the React example does. The equivalent invariant
    // for Vue's blocking Suspense + chunked stream is positional: critical
    // content (resolved before the Suspense boundary) must appear in the
    // response BEFORE the deferred sections that rendered inside <Suspense>.
    const response = await request.get("/products/1");
    const html = await response.text();

    const productNameIdx = html.indexOf('data-testid="product-name"');
    const reviewsSectionIdx = html.indexOf('data-testid="reviews-section"');
    const relatedSectionIdx = html.indexOf('data-testid="related-section"');

    expect(productNameIdx).toBeGreaterThan(-1);
    expect(reviewsSectionIdx).toBeGreaterThan(-1);
    expect(relatedSectionIdx).toBeGreaterThan(-1);

    expect(productNameIdx).toBeLessThan(reviewsSectionIdx);
    expect(reviewsSectionIdx).toBeLessThan(relatedSectionIdx);
  });

  test("Scenario 12: response is chunked-encoded and body timing reflects per-Suspense server delays", async ({
    request,
  }) => {
    // Streaming claim: the server does not buffer the full HTML before
    // sending. Two checks together pin this down:
    //   1) Transfer-Encoding: chunked — the response was streamed, not
    //      delivered with a fixed Content-Length.
    //   2) Wall-clock body delivery >= max(reviews=600ms, related=1200ms) —
    //      Vue's blocking <Suspense> waits on async setup() before emitting
    //      the rest of the stream, so the response cannot complete sooner
    //      than the slowest deferred section.
    const start = Date.now();
    const response = await request.get("/products/1");
    const html = await response.text();
    const elapsed = Date.now() - start;

    expect(response.status()).toBe(200);
    expect(response.headers()["transfer-encoding"]).toBe("chunked");
    expect(response.headers()["content-length"]).toBeUndefined();

    // Related items have a 1200ms server-only setTimeout in fetchRelated().
    // Allow a small lower-bound margin for clock jitter.
    expect(elapsed).toBeGreaterThanOrEqual(1100);

    // Resolved deferred content actually shipped in the stream.
    expect(html).toContain('data-related-id="k1"');
  });

  test("Scenario 13: empty deferred state renders empty-state UI without errors", async ({
    page,
  }) => {
    const errors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/products/5");

    await expect(page.getByTestId("product-name")).toHaveText(
      "Niche Cable Tester",
    );

    // Reviews resolves to [] for id=5 (not in REVIEWS_BY_PRODUCT) — empty-state branch.
    await expect(page.getByTestId("reviews-empty")).toBeVisible();
    await expect(page.getByTestId("reviews-section")).toHaveCount(0);

    // Related items also has no entry for id=5 — section renders with an empty list.
    await expect(page.getByTestId("related-section")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('[data-related-id]')).toHaveCount(0);

    await page.waitForLoadState("networkidle");

    const hydrationErrors = errors.filter(
      (e) =>
        e.toLowerCase().includes("hydrat") ||
        e.toLowerCase().includes("mismatch"),
    );

    expect(hydrationErrors).toEqual([]);
  });

  test("Scenario 14: server-rendered Suspense content is immediately present, no client fallback flicker", async ({
    page,
  }) => {
    // Vue's <Suspense> is blocking in SSR, so async setup() resolves on the
    // server and the rendered content (not the fallback) ships in the
    // initial HTML. After commit + hydration, the fallback elements should
    // never have been in the DOM.
    await page.goto("/products/1", { waitUntil: "commit" });

    // Resolved deferred sections are visible immediately (already in initial DOM).
    await expect(page.getByTestId("reviews-section")).toBeVisible();
    await expect(page.getByTestId("related-section")).toBeVisible();

    // Wait for hydration to settle and re-assert no fallback ever appears.
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("reviews-fallback")).toHaveCount(0);
    await expect(page.getByTestId("related-fallback")).toHaveCount(0);

    // Sections still in place after hydration — no flicker, no removal.
    await expect(page.getByTestId("reviews-section")).toBeVisible();
    await expect(page.getByTestId("related-section")).toBeVisible();
  });
});

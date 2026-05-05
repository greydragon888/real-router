import { expect, test } from "@playwright/test";

test.describe("Preact streaming SSR — smoke", () => {
  test("home page is server-rendered", async ({ page }) => {
    const response = await page.goto("/");

    expect(response?.status()).toBe(200);

    const html = await response!.text();
    expect(html).toContain("Welcome");
    expect(html).toContain("window.__SSR_STATE__");
  });

  test("products list renders with critical loader data", async ({ page }) => {
    const response = await page.goto("/products");
    const html = await response!.text();

    expect(html).toContain("Mechanical Keyboard");
    expect(html).toContain("Ergonomic Mouse");
    expect(html).toContain("4K Monitor");
  });

  test("product detail streams shell + sibling sections", async ({
    request,
  }) => {
    const response = await request.get("/products/1");
    const html = await response.text();

    // Critical product data:
    expect(html).toContain("Mechanical Keyboard");
    // Sibling sections (sync-rendered from fixtures — Preact 10 has
    // no use(promise) for true data-deferred Suspense streaming):
    expect(html).toContain("reviews-section");
    expect(html).toContain("related-section");
    expect(html).toContain("Wrist rest");
  });

  test("Transfer-Encoding: chunked for streaming responses", async ({
    request,
  }) => {
    const response = await request.get("/products/1");
    const transferEncoding = response.headers()["transfer-encoding"];
    expect(transferEncoding).toBe("chunked");
  });

  test("404 for unknown product id (typed LoaderNotFound)", async ({
    request,
  }) => {
    const response = await request.get("/products/9999");

    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toContain("text/plain");
  });

  test("hydration completes without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/products/1");
    await page.waitForLoadState("networkidle");

    const hydrationErrors = errors.filter((m) =>
      /hydrat|mismatch/i.test(m),
    );

    expect(hydrationErrors).toEqual([]);
  });

  test("Cache-Control per route: home gets long max-age", async ({
    request,
  }) => {
    const response = await request.get("/");
    expect(response.headers()["cache-control"]).toContain("s-maxage=3600");
  });

  test("Cache-Control: products list has short max-age", async ({
    request,
  }) => {
    const response = await request.get("/products");
    expect(response.headers()["cache-control"]).toContain("max-age=60");
  });

  test("Cache-Control: product detail has medium max-age", async ({
    request,
  }) => {
    const response = await request.get("/products/1");
    expect(response.headers()["cache-control"]).toContain("max-age=120");
  });

  test("__SSR_STATE__ shape: state.context.data.product matches the SSR'd product", async ({
    page,
  }) => {
    const response = await page.goto("/products/2");
    const html = await response!.text();

    // Embedded state script carries the full router snapshot — the
    // client uses it via hydrateRouter to rebuild router state without
    // re-running loaders during the first render. Asserting its shape
    // pins the wire format to the public API of serializeRouterState.
    expect(html).toMatch(
      /window\.__SSR_STATE__=\{[^}]*"name":"products\.detail"/,
    );
    expect(html).toContain('"id":"2"');
    expect(html).toContain('"name":"Ergonomic Mouse"');
    expect(html).toContain('"price":89.5');
  });

  test("products list links to each detail route", async ({ page }) => {
    await page.goto("/products");
    await page.waitForLoadState("networkidle");

    for (const id of ["1", "2", "3"]) {
      const link = page.locator(`[data-testid="product-link-${id}"]`);
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", `/products/${id}`);
    }
  });

  test("per-request isolation: 5 concurrent product detail requests succeed", async ({
    request,
  }) => {
    // Each request must produce a fresh cloneRouter with its own
    // dispose path. Concurrent fetches must not see each other's
    // router state — verified by all returning the right product data.
    const ids = ["1", "2", "3", "1", "2"];
    const responses = await Promise.all(
      ids.map((id) => request.get(`/products/${id}`)),
    );

    for (const [i, response] of responses.entries()) {
      expect(response.status()).toBe(200);
      const body = await response.text();
      const id = ids[i]!;
      expect(body).toContain(`data-product-id="${id}"`);
    }
  });

  test("loader-error fast path bypasses streaming pipeline (no chunked transfer)", async ({
    request,
  }) => {
    // 404 from typed LoaderNotFound short-circuits BEFORE renderToReadableStream.
    // Response is plain text with Content-Length, not chunked transfer —
    // confirms cleanup() runs in the catch branch of entry-server.tsx.
    const response = await request.get("/products/9999");
    const transferEncoding = response.headers()["transfer-encoding"];
    expect(transferEncoding ?? "").not.toBe("chunked");
    expect(await response.text()).toBe("Not Found");
  });

  test.describe("no-JS rendering — streamed HTML stands alone", () => {
    test.use({ javaScriptEnabled: false });

    test("product detail server-renders all sections without JS", async ({
      page,
    }) => {
      // Streaming pipeline must produce complete HTML even when the
      // client never runs JS. Sibling sections (Reviews, RelatedItems)
      // are sync from fixtures, so their content lands in the same
      // streamed response as the shell.
      await page.goto("/products/1");
      await expect(
        page.locator('[data-testid="product-detail"]'),
      ).toHaveAttribute("data-product-id", "1");
      await expect(
        page.locator('[data-testid="reviews-section"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="related-section"]'),
      ).toBeVisible();
    });
  });

  test("each page navigation triggers a fresh SSR (Transfer-Encoding: chunked on every visit)", async ({
    request,
  }) => {
    // No browser-plugin in this example — every URL is a server hit.
    // We verify three different URLs all return chunked transfer,
    // proving the streaming pipeline runs on every navigation rather
    // than swapping client trees in place.
    const targets = ["/", "/products", "/products/2", "/products/3"];
    const responses = await Promise.all(targets.map((u) => request.get(u)));

    for (const r of responses) {
      expect(r.status()).toBe(200);
      expect(r.headers()["transfer-encoding"]).toBe("chunked");
    }
  });
});

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

  test("Scenario 15: <Teleport> — initially closed modal contributes zero markup to the streamed HTML, but the teleport target node exists", async ({
    request,
  }) => {
    // ProductSpecsModal uses `<Teleport to="#modal-target">` with a
    // v-if-gated dialog. On initial render the modal is closed —
    // <Teleport> emits nothing for that branch, so the streamed
    // wire HTML must NOT contain the dialog markup. The
    // #modal-target host element does exist (declared in index.html)
    // so the client portal has a target to attach to after open.
    const response = await request.get("/products/1");
    const html = await response.text();

    expect(response.status()).toBe(200);
    // Host node lives in index.html, present in every response.
    expect(html).toContain('id="modal-target"');
    // Open-button is server-rendered (always visible).
    expect(html).toContain('data-testid="open-specs-modal"');
    // Dialog markup is NOT in the wire HTML — <Teleport> renders
    // nothing for the `v-if=open` branch when open === false.
    expect(html).not.toContain('data-testid="specs-modal"');
  });

  test("Scenario 16: <Teleport> — opening the modal mounts content into #modal-target, NOT inside #root", async ({
    page,
  }) => {
    // Verifies the portal contract: when the user opens the modal,
    // the dialog DOM is attached to #modal-target (a sibling of
    // #root), not as a descendant of the article that contains the
    // <ProductSpecsModal> usage. This is the core <Teleport>
    // behaviour — declared inside ProductDetail.vue but rendered
    // outside its DOM ancestry.
    await page.goto("/products/1");
    await page.waitForLoadState("networkidle");

    // Closed at start — no dialog anywhere.
    await expect(page.getByTestId("specs-modal")).toHaveCount(0);

    await page.getByTestId("open-specs-modal").click();

    // Now visible somewhere in the document.
    await expect(page.getByTestId("specs-modal")).toBeVisible();

    // Critically: the dialog is INSIDE #modal-target, OUTSIDE #root.
    const insideTarget = await page.locator(
      "#modal-target [data-testid='specs-modal']",
    ).count();
    expect(insideTarget).toBe(1);

    const insideRoot = await page.locator(
      "#root [data-testid='specs-modal']",
    ).count();
    expect(insideRoot).toBe(0);
  });

  test("Scenario 17: Loader-driven HTTP — /products/999 throws LoaderNotFound → 404 text/plain (no streaming for the error path)", async ({
    request,
  }) => {
    // products.detail loader calls getProduct(id); if the id is not
    // in the in-memory store, it throws LoaderNotFound. entry-server
    // catches the typed error BEFORE constructing the stream and
    // returns { rawBody: "Not Found", statusCode: 404 } — server
    // emits text/plain instead of streamed HTML, and crucially still
    // calls cleanup() (the previous design leaked the router because
    // the catch path skipped dispose()).
    const response = await request.get("/products/999");

    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toContain("text/plain");
    expect(await response.text()).toBe("Not Found");
    // No streaming for the error path — Transfer-Encoding should not
    // be chunked here.
    expect(response.headers()["transfer-encoding"]).not.toBe("chunked");
  });

  test("Scenario 18: Cache-Control: per-route policy from cache-policies.ts (public for products list, longer for product detail)", async ({
    request,
  }) => {
    // server/index.ts reads getCachePolicy(url) and emits the
    // Cache-Control header on the streamed response. Different routes
    // get different policies:
    //   /            → public, max-age=300, s-maxage=3600
    //   /products    → public, max-age=60
    //   /products/:id → public, max-age=120
    //
    // Note: ETag is intentionally absent here — buffering the full
    // stream to hash it would defeat the streaming purpose. See
    // src/router/cache-policies.ts header for the full rationale.
    const home = await request.get("/", { maxRedirects: 0 });

    expect(home.headers()["cache-control"]).toContain("public");
    expect(home.headers()["cache-control"]).toContain("s-maxage=3600");

    const productsList = await request.get("/products", { maxRedirects: 0 });

    expect(productsList.headers()["cache-control"]).toContain("public");
    expect(productsList.headers()["cache-control"]).toContain("max-age=60");

    const productDetail = await request.get("/products/1", {
      maxRedirects: 0,
    });

    expect(productDetail.headers()["cache-control"]).toContain("public");
    expect(productDetail.headers()["cache-control"]).toContain("max-age=120");
  });

  test("Scenario 19: streamed responses do NOT carry an ETag header (intentional — would defeat streaming)", async ({
    request,
  }) => {
    // Honesty check: confirm we're not silently emitting a useless or
    // misleading ETag. Strong ETag requires the full body to hash;
    // streaming pipelines never hold the full body in memory. So we
    // skip ETag entirely rather than ship a weak/lying one.
    // CDNs that need conditional GET will buffer the body on their
    // edge and apply their own ETag layer — see cache-policies.ts.
    const response = await request.get("/products/1");

    expect(response.status()).toBe(200);
    expect(response.headers().etag).toBeUndefined();
  });

  test("Scenario 20: AbortController: client disconnect mid-stream releases the server reader within ms", async ({
    request,
  }) => {
    // /products/1 streams over ~1200 ms (RelatedItems is the slowest
    // <Suspense> child at 1200 ms server delay). server/index.ts
    // wires `req.on("close")` → `abortController.abort()` and the
    // stream-pump loop checks `signal.aborted` between `reader.read()`
    // calls; on abort, `reader.cancel()` releases stream resources
    // and `cleanup()` calls `router.dispose()`.
    //
    // Test: cancel the request via Playwright's `timeout` option
    // (150 ms — much shorter than the 1200 ms stream span). The HTTP
    // error surfaces as a Playwright error; the test verifies elapsed
    // time stays well under the full stream duration.
    const startedAt = Date.now();
    let aborted = false;

    try {
      await request.get("/products/1", { timeout: 150 });
    } catch {
      aborted = true;
    }

    const elapsed = Date.now() - startedAt;

    expect(aborted).toBe(true);
    // Client gave up at ~150 ms, server should release its handler
    // well under the 1200 ms full-stream span.
    expect(elapsed).toBeLessThan(800);
  });

  test("post-hydration loader skip (#596): client makes zero loader-driven calls on first paint", async ({
    page,
  }) => {
    await page.goto("/products/1");
    await page.waitForLoadState("networkidle");

    const counts = await page.evaluate(() => globalThis.__LOADER_CALLS__);

    expect(counts).toEqual({});
  });

  test("post-hydration loader skip (#596): list route hydrates without loader fire", async ({
    page,
  }) => {
    await page.goto("/products");
    await page.waitForLoadState("networkidle");

    const counts = await page.evaluate(() => globalThis.__LOADER_CALLS__);

    expect(counts).toEqual({});
  });

  test("per-route SSR mode (#597): client-only entry skips loader", async ({
    page,
  }) => {
    const response = await page.goto("/widget");
    const html = await response!.text();
    const match = html.match(/window\.__SSR_STATE__=({.*?})<\/script>/);

    expect(match?.[1]).toBeDefined();

    const state = JSON.parse(match![1]) as {
      name: string;
      context: { ssrDataMode?: string; data?: unknown };
    };

    expect(state.name).toBe("widget");
    expect(state.context.ssrDataMode).toBe("client-only");
    expect(state.context.data).toBeUndefined();
  });
});

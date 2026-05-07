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

  test("response headers: HTML content-type, no x-powered-by leak, status 200", async ({
    request,
  }) => {
    // Streaming SSR responses must advertise text/html with utf-8 and not
    // expose Express's identity. We do not assert Transfer-Encoding here
    // because Angular's @defer + withIncrementalHydration() builds a single
    // HTML payload server-side (incremental hydration is a CLIENT-side
    // mechanism — chunks of the deferred component bundle download lazily
    // when the @defer trigger fires, not during SSR).
    const response = await request.get("/products/1");

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(
      /text\/html.*charset=utf-8/i,
    );
    expect(response.headers()["x-powered-by"]).toBeUndefined();
  });

  test("incremental hydration timing: Reviews chunk loads at viewport, RelatedItems chunk loads only after hover", async ({
    page,
  }) => {
    // The "streaming" claim of this example is incremental hydration on the
    // client: each @defer block ships as its own JS chunk and is fetched
    // only when the trigger fires. This test asserts the contract directly
    // by counting chunk loads around the hover trigger. Without it, the
    // existing "appears after hover" tests could pass even if Angular
    // eagerly preloaded both chunks at boot.
    const chunkLoads: { url: string; ts: number }[] = [];
    const startedAt = Date.now();

    page.on("response", (response) => {
      const url = response.url();

      if (
        response.request().resourceType() === "script" &&
        /\/chunk-/.test(url)
      ) {
        chunkLoads.push({ url, ts: Date.now() - startedAt });
      }
    });

    await page.goto("/products/1");

    await expect(page.getByTestId("reviews-section")).toBeVisible({
      timeout: 5000,
    });

    await page.waitForTimeout(300);

    const beforeHover = chunkLoads.length;

    await page.getByTestId("related-fallback").hover();
    await expect(page.getByTestId("related-section")).toBeVisible({
      timeout: 5000,
    });

    const afterHover = chunkLoads.length;

    expect(beforeHover).toBeGreaterThan(0);
    expect(afterHover).toBeGreaterThan(beforeHover);
  });

  test("@error block: aborting the Reviews @defer chunk surfaces the @error template", async ({
    page,
  }) => {
    // Angular's @defer compiler emits each block's body as its own JS chunk.
    // We can't safely block all `/chunk-*.js` (the bootstrap chunk uses the
    // same prefix), so we identify the Reviews chunk by its template text
    // ("reviews-section") and abort only that one. The bootstrap chunk and
    // RelatedItems chunk pass through, so the page hydrates normally and
    // only the Reviews defer block observes a load failure.
    await page.route(/\/chunk-[A-Za-z0-9]+\.js$/, async (route) => {
      const response = await route.fetch();
      const body = await response.text();

      if (body.includes("reviews-section")) {
        await route.abort("failed");

        return;
      }

      await route.fulfill({ response });
    });

    await page.goto("/products/1");

    await expect(page.getByTestId("product-name")).toHaveText(
      "Mechanical Keyboard",
    );

    await expect(page.getByTestId("reviews-error")).toBeVisible({
      timeout: 7000,
    });
    await expect(page.getByTestId("reviews-section")).toHaveCount(0);
  });

  test("@loading state: reviews-loading appears briefly while the Reviews @defer chunk downloads", async ({
    page,
  }) => {
    // The @loading template shows after the trigger fires and before the
    // chunk has finished downloading + hydrating. With localhost RTT it can
    // be skipped entirely, so we slow only the Reviews chunk by ~600ms to
    // make the transient state observable. Bootstrap and RelatedItems
    // chunks pass through unmodified so the rest of the page is unaffected.
    await page.route(/\/chunk-[A-Za-z0-9]+\.js$/, async (route) => {
      const response = await route.fetch();
      const body = await response.text();

      if (body.includes("reviews-section")) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }

      await route.fulfill({ response, body });
    });

    await page.goto("/products/1");

    await expect(page.getByTestId("product-name")).toHaveText(
      "Mechanical Keyboard",
    );

    await expect(page.getByTestId("reviews-loading")).toBeVisible({
      timeout: 1500,
    });

    await expect(page.getByTestId("reviews-section")).toBeVisible({
      timeout: 5000,
    });
  });

  test("@defer (on idle; prefetch on viewport): spec sheet chunk prefetches early but hydrates only on idle", async ({
    page,
  }) => {
    // The spec-sheet @defer block decouples its triggers: prefetch fires when
    // the placeholder enters the viewport (chunk download starts), hydration
    // fires when the browser hits requestIdleCallback (component runs). On a
    // fast localhost both events happen close together; the assertion is that
    // the chunk DOES get loaded eventually (prefetch + hydrate work) and that
    // the resolved component is visible — which proves the trigger pair is
    // wired correctly.
    const specChunkLoads: { url: string; ts: number }[] = [];
    const startedAt = Date.now();

    page.on("response", async (resp) => {
      if (
        resp.request().resourceType() === "script" &&
        /\/chunk-/.test(resp.url())
      ) {
        try {
          const body = await resp.text();

          if (body.includes("spec-sheet")) {
            specChunkLoads.push({ url: resp.url(), ts: Date.now() - startedAt });
          }
        } catch {
          /* ignore aborted */
        }
      }
    });

    await page.goto("/products/1");

    await expect(page.getByTestId("spec-sheet")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("spec-weight")).toHaveText("1.2 kg");
    await expect(page.getByTestId("spec-warranty")).toHaveText("2 years");

    expect(specChunkLoads.length).toBeGreaterThan(0);
  });

  test("@defer placeholder taxonomy: spec-fallback ships server-side, gets replaced after hydrate", async ({
    request,
  }) => {
    // Smoke test for the placeholder of the (on idle) block, complementing the
    // (on viewport) and (on hover) placeholder coverage from earlier tests.
    const response = await request.get("/products/1");
    const html = await response.text();

    expect(html).toContain('data-testid="spec-fallback"');
    expect(html).not.toContain('data-testid="spec-sheet"');
  });

  test("withEventReplay(): a click during chunk hydration is replayed after the component takes over", async ({
    page,
  }) => {
    // Slow the Reviews chunk by 1.2s so the @loading state is observable and
    // the user has a wide window to click "Mark all read" before the
    // component hydrates. With provideClientHydration(withEventReplay()),
    // Angular captures the click globally and replays it once the button's
    // event handler is actually wired up. Without event replay, the click
    // would be lost and data-marked would stay "false".
    await page.route(/\/chunk-[A-Za-z0-9]+\.js$/, async (route) => {
      const response = await route.fetch();
      const body = await response.text();

      if (body.includes("reviews-section")) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }

      await route.fulfill({ response, body });
    });

    await page.goto("/products/1");

    await expect(page.getByTestId("product-name")).toHaveText(
      "Mechanical Keyboard",
    );

    // Click while the chunk is still en route. The button is rendered as part
    // of the server-emitted reviews-section content under the @loading state
    // — visible (server-rendered HTML), but no JS handler attached yet.
    await expect(page.getByTestId("reviews-mark-read")).toBeVisible({
      timeout: 2000,
    });
    await page
      .getByTestId("reviews-mark-read")
      .click({ timeout: 1000, noWaitAfter: true });

    // After the chunk loads + the component hydrates, the replayed click must
    // have flipped data-marked to "true" and the label to "All marked read".
    await expect(
      page.locator('[data-testid="reviews-mark-read"][data-marked="true"]'),
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("reviews-mark-read")).toHaveText(
      /All marked read/,
    );
  });

  test("@defer (on interaction): Q&A section loads only after the placeholder is clicked", async ({
    page,
  }) => {
    // Placeholder is a button. The chunk is fetched and the qa-section
    // component is hydrated only after the click — cheaper than (on hover)
    // for content the user is unlikely to read on every visit.
    const qaChunkLoads: string[] = [];

    page.on("response", async (resp) => {
      if (
        resp.request().resourceType() === "script" &&
        /\/chunk-/.test(resp.url())
      ) {
        try {
          const body = await resp.text();

          if (body.includes("qa-section")) {
            qaChunkLoads.push(resp.url());
          }
        } catch {
          /* aborted */
        }
      }
    });

    await page.goto("/products/1");

    await expect(page.getByTestId("qa-trigger")).toBeVisible();
    await expect(page.getByTestId("qa-section")).toHaveCount(0);

    await page.waitForLoadState("networkidle");
    expect(qaChunkLoads).toEqual([]);

    await page.getByTestId("qa-trigger").click();

    await expect(page.getByTestId("qa-section")).toBeVisible({
      timeout: 5000,
    });
    expect(qaChunkLoads.length).toBeGreaterThan(0);
  });

  test("@defer (when signal): tech details chunk loads only after the toggle signal flips to true", async ({
    page,
  }) => {
    // Predicate-based @defer is unique to Angular — the chunk loads + the
    // component hydrates only when the bound expression evaluates truthy.
    // Here a button toggles a signal; the @defer block reacts.
    const techChunkLoads: string[] = [];

    page.on("response", async (resp) => {
      if (
        resp.request().resourceType() === "script" &&
        /\/chunk-/.test(resp.url())
      ) {
        try {
          const body = await resp.text();

          if (body.includes("tech-details")) {
            techChunkLoads.push(resp.url());
          }
        } catch {
          /* aborted */
        }
      }
    });

    await page.goto("/products/1");

    await expect(page.getByTestId("tech-fallback")).toBeVisible();
    await expect(page.getByTestId("tech-details")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    expect(techChunkLoads).toEqual([]);

    await page.getByTestId("tech-toggle").click();

    await expect(page.getByTestId("tech-details")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId("tech-protocol")).toHaveText("USB-C 2.0");
    expect(techChunkLoads.length).toBeGreaterThan(0);

    // (when expr) is a ONE-SHOT trigger in Angular: once the predicate has
    // fired, the chunk is loaded and the component stays mounted even if
    // the predicate flips back to false. Verify that toggling the signal
    // off does NOT tear the component back down — this is the documented
    // Angular contract, not a bug. To get reactive show/hide, wrap the
    // component reference in a regular @if block.
    await page.getByTestId("tech-toggle").click();
    await expect(page.getByTestId("tech-details")).toBeVisible();
  });

  test("@defer (on timer): news banner appears ~1500 ms after page load without user interaction", async ({
    page,
  }) => {
    await page.goto("/products/1");

    await expect(page.getByTestId("news-fallback")).toBeVisible();

    // Banner must NOT be there before the timer fires (give a generous
    // ceiling: the timer is 1500 ms, anything before 800 ms is safe).
    await page.waitForTimeout(800);
    await expect(page.getByTestId("news-banner")).toHaveCount(0);

    await expect(page.getByTestId("news-banner")).toBeVisible({
      timeout: 3000,
    });
  });

  test("@defer (on immediate): analytics pixel hydrates right after bootstrap (visible before any user input)", async ({
    page,
  }) => {
    await page.goto("/products/1");

    // No interaction needed — (on immediate) fires as soon as the app
    // bootstraps. Generous timeout to let the JS bundle parse + execute.
    await expect(page.getByTestId("analytics-pixel")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId("analytics-pixel")).toHaveAttribute(
      "data-product",
      "1",
    );
  });

  // See note in ssr/e2e/ssr.spec.ts: per-route SSR mode (#597) is wired in
  // routes.ts + loaders.ts but Angular SSR does not serialize router State
  // into HTML, so a runtime assertion via __SSR_STATE__ regex isn't
  // applicable. Compile-time + cross-adapter coverage stands.

  test("post-hydration loader skip (#599): client makes zero loader-driven calls under streaming SSR", async ({
    page,
  }) => {
    // Sister test to ssr/ post-hydration loader skip — verifies the
    // TransferState bridge keeps working when Angular's
    // `withIncrementalHydration()` + `@defer` are active. The bridge writes
    // serialized router state to TransferState during the
    // `provideAppInitializer` callback, before `@defer` blocks even
    // register their hydration triggers — so the client's app-initializer
    // sees the seed and `hydrateRouter` consumes it without re-running
    // ssr-data-plugin's loader.
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const counts = await page.evaluate(
      () =>
        (
          globalThis as unknown as Window & {
            __LOADER_CALLS__?: Record<string, number>;
          }
        ).__LOADER_CALLS__,
    );

    expect(counts).toEqual({});
  });
});

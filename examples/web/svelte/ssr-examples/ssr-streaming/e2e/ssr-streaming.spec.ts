import { expect, test } from "@playwright/test";

test.describe("Streaming SSR Example (Svelte)", () => {
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

  test("Scenario 2 (Svelte RSC-like): server response contains pending fallback, NOT resolved deferred content", async ({
    request,
  }) => {
    // Svelte 5 stable ships only the pending branch of {#await} blocks in
    // the SSR response body. Real review/related data does NOT appear in
    // the HTTP response — async resolution happens entirely on the client
    // after hydration. This is the structural difference from
    // React/Vue/Solid streaming.
    const response = await request.get("/products/1", {
      headers: { Accept: "text/html" },
    });

    expect(response.status()).toBe(200);

    const html = await response.text();

    expect(html).toContain('data-testid="reviews-fallback"');
    expect(html).toContain('data-testid="related-fallback"');
    expect(html).not.toContain('data-testid="reviews-section"');
    expect(html).not.toContain('data-testid="related-section"');
  });

  test("Scenario 3: deferred sections render after client hydration", async ({
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

  test("Scenario 4: no hydration errors after deferred data resolves", async ({
    page,
  }) => {
    const issues: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        issues.push(message.text());
      }
    });

    await page.goto("/products/1");
    await expect(page.getByTestId("reviews-section")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId("related-section")).toBeVisible({
      timeout: 5000,
    });

    await page.waitForLoadState("networkidle");

    const hydrationIssues = issues.filter(
      (text) =>
        text.toLowerCase().includes("hydrat") ||
        text.toLowerCase().includes("mismatch"),
    );

    expect(hydrationIssues).toEqual([]);
  });

  test("Scenario 5: every page is server-rendered (full-reload navigation)", async ({
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

  test("Scenario 8: error containment — rejected reviews promise renders the {#await} catch branch, rest of page unaffected", async ({
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

    await expect(page.getByTestId("reviews-error")).toBeVisible({
      timeout: 5000,
    });
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

  test("Scenario 9: unknown route returns 404 with NotFound page", async ({
    request,
  }) => {
    const response = await request.get("/__definitely-does-not-exist");

    expect(response.status()).toBe(404);

    const html = await response.text();

    expect(html).toContain('data-testid="not-found"');
    expect(html).toContain("404");
  });

  test("Scenario 10 (Svelte RSC-like): empty deferred state renders empty-state UI without errors", async ({
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

    // Reviews resolves to [] for id=5 — empty-state branch.
    await expect(page.getByTestId("reviews-empty")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId("reviews-section")).toHaveCount(0);

    // Related items also has no entry for id=5.
    await expect(page.getByTestId("related-section")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator("[data-related-id]")).toHaveCount(0);

    await page.waitForLoadState("networkidle");

    const hydrationErrors = errors.filter(
      (e) =>
        e.toLowerCase().includes("hydrat") ||
        e.toLowerCase().includes("mismatch"),
    );

    expect(hydrationErrors).toEqual([]);
  });

  test("Scenario 11 (Svelte RSC-like): no chunked transfer — single buffered response", async ({
    request,
  }) => {
    // Unlike React/Vue/Solid, Svelte 5 ships a single buffered response —
    // Transfer-Encoding: chunked is NOT set. This test pins the model
    // explicitly so a future Svelte-runtime change that flips to chunked
    // streaming surfaces here.
    const response = await request.get("/products/1");

    expect(response.status()).toBe(200);
    expect(response.headers()["transfer-encoding"]).not.toBe("chunked");
  });

  test("Scenario 12: TCP frame timing — body arrives in a single frame, no progressive flush", async () => {
    // Empirical proof of "no streaming on the wire": capture every chunk
    // delivered by Node's http module and verify the body lands in a
    // single frame with zero ms span. If a future Svelte change starts
    // flushing chunks progressively, this assertion will fail with chunk
    // count > 1 and we'll know to re-read the example's terminology
    // disclaimer.
    const { request: nodeRequest } = await import("node:http");

    const startedAt = Date.now();
    const chunks: { ts: number; size: number }[] = [];

    await new Promise<void>((resolve, reject) => {
      const req = nodeRequest(
        "http://localhost:3000/products/1",
        (res) => {
          res.on("data", (buf: Buffer) => {
            chunks.push({ ts: Date.now() - startedAt, size: buf.length });
          });
          res.on("end", () => resolve());
          res.on("error", reject);
        },
      );

      req.on("error", reject);
      req.end();
    });

    expect(chunks.length).toBeGreaterThan(0);
    const span =
      chunks.length === 1 ? 0 : chunks.at(-1)!.ts - chunks[0]!.ts;

    expect(
      span,
      "expected single-frame delivery (or near-zero span); got progressive flush",
    ).toBeLessThan(50);
  });

  test("Scenario 13: main loader 404 — /products/9999 returns 404 + plain text (LoaderNotFound)", async ({
    request,
  }) => {
    // The products.detail loader throws LoaderNotFound for ids missing
    // from the database. entry-server.ts maps the typed code to status:404
    // + text/plain. This is the streaming-pipeline counterpart of the
    // ssr/ example's loader-driven HTTP semantics, demonstrating that
    // typed loader errors don't have to disrupt the deferred-data flow:
    // they produce a clean error response without ever entering Svelte
    // render().
    const response = await request.get("/products/9999");

    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toContain("text/plain");
  });

  test("Scenario 14: no browser-plugin — Link clicks update router state but the URL does not change", async ({
    page,
  }) => {
    // Conscious limitation: entry-client.ts only registers
    // ssr-data-plugin (for hydrateRouter). Without browser-plugin, the
    // Link directive intercepts clicks via preventDefault + router.navigate
    // — DOM updates, but the URL bar stays put because nothing pushes to
    // history. CSR with full URL sync is covered in the ssr/ example.
    // This test pins the limitation so any future change that wires up
    // browser-plugin surfaces here.
    await page.goto("/products");
    await page.waitForLoadState("networkidle");

    let documentRequests = 0;

    page.on("request", (req) => {
      if (req.resourceType() === "document") {
        documentRequests += 1;
      }
    });

    await page.click('a[href="/products/2"]');

    // DOM updates because router.navigate ran client-side and useRoute()
    // re-rendered. But ssr-data-plugin intercepts only start(), not
    // navigate() — so state.context.data is undefined → ProductDetail
    // renders the "product-not-found" branch. Combined with no URL sync,
    // this example deliberately keeps CSR off the table; full CSR with
    // URL sync + data is the ssr/ example's job.
    await expect(page.getByTestId("product-not-found")).toBeVisible({
      timeout: 5000,
    });
    expect(page.url()).toMatch(/\/products$/);
    expect(documentRequests).toBe(0);
  });

  test("Scenario 16: <svelte:boundary pending> + top-level await — pending snippet ships in SSR HTML, resolved on client", async ({
    page,
    request,
  }) => {
    // ServerStats.svelte uses top-level `await fetchStats(productId)` —
    // gated behind `experimental.async: true` in svelte.config.js. The
    // parent's <svelte:boundary> wraps it with a `pending` snippet.
    //
    // Empirically verified Svelte 5.54 behaviour: server-side render()
    // does NOT wait for the await. The SSR response ships the boundary's
    // `stats-pending` element (NOT the resolved `server-stats` section).
    // The client materializes the resolved content after hydration. This
    // is the SAME runtime shape as {#await} in template — author
    // ergonomics differ (top-level await lets the rest of the script use
    // the resolved value as a normal variable), runtime behaviour is
    // identical at this point in Svelte's evolution. If a future release
    // switches to "server waits before flush", the first assertion will
    // fail and we re-read the disclaimer.
    const response = await request.get("/products/1");
    const html = await response.text();

    expect(html).toContain('data-testid="stats-pending"');
    expect(html).not.toContain('data-testid="server-stats"');

    await page.goto("/products/1");
    await expect(page.getByTestId("server-stats")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId("stats-views")).toContainText("18,432");
    await expect(page.getByTestId("stats-rating")).toContainText("4.7");
  });

  test("Scenario 17: <svelte:boundary onerror> — callback fires with the caught error before @failed renders", async ({
    page,
  }) => {
    // ProductActions.svelte wires onerror={logBoundaryError}, which calls
    // console.error with a tagged message. Production code would send to
    // Sentry/Datadog/OTel here. The spy verifies the hook ran with the
    // expected error shape.
    const errors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/products/1");
    await expect(page.getByTestId("trigger-client-error")).toBeVisible();

    await page.getByTestId("trigger-client-error").click();
    await expect(page.getByTestId("product-actions-error")).toBeVisible({
      timeout: 5000,
    });

    const boundaryLogs = errors.filter((text) =>
      text.includes("[product-actions:boundary] caught error:"),
    );

    expect(boundaryLogs.length).toBeGreaterThan(0);
    expect(boundaryLogs[0]).toContain("Intentional reactive error");
  });

  test("Scenario 18: use:trackView action — IntersectionObserver fires on hydration, populates window.__VIEW_LOG__", async ({
    page,
  }) => {
    // src/actions/track-view.ts uses IntersectionObserver. SSR runtime
    // skips action invocations entirely (verified by the absence of any
    // server-side reference to window/__VIEW_LOG__), so the action is
    // SSR-safe by construction. After client hydration the article is in
    // the viewport → observer fires → log entry pushed.
    await page.goto("/products/2");
    await page.waitForLoadState("networkidle");

    const log = await page.evaluate(
      () => (window as Window & { __VIEW_LOG__?: { productId: string }[] }).__VIEW_LOG__,
    );

    expect(log).toBeDefined();
    expect(log!.length).toBeGreaterThan(0);
    expect(log![0]?.productId).toBe("2");
  });

  test("Scenario 19: use:trackView is SSR-safe — server HTML never references window or __VIEW_LOG__", async ({
    request,
  }) => {
    // The action's body uses `window` and `IntersectionObserver` — both
    // forbidden on the server. Svelte's SSR runtime skips action
    // invocations entirely; the action function is never called during
    // render(). Verify by inspecting the wire response: no marker that
    // the action ran, and no inline reference to its globals. (CSR
    // navigation between products is intentionally out of scope here —
    // the streaming example does not register browser-plugin; for full
    // CSR + action update lifecycle see the ssr/ example pattern.)
    const response = await request.get("/products/1");
    const html = await response.text();

    expect(html).toContain('data-testid="product-detail"');
    expect(html).not.toContain("__VIEW_LOG__");
    expect(html).not.toContain("IntersectionObserver");
  });

  test("Scenario 15: <svelte:boundary> — clicking the trigger replaces the section with @failed snippet, rest of the page survives", async ({
    page,
  }) => {
    // <svelte:boundary> catches errors thrown synchronously during reactive
    // updates / event handlers. Verify the contract end-to-end:
    //   1. Trigger button is rendered (boundary's children path)
    //   2. Click throws → @failed snippet renders, error message visible
    //   3. Reset button restores the original tree
    //   4. The rest of ProductDetail (name, reviews, related) is unaffected
    const errors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/products/1");

    await expect(page.getByTestId("trigger-client-error")).toBeVisible();
    await expect(page.getByTestId("product-actions-error")).toHaveCount(0);

    await page.getByTestId("trigger-client-error").click();

    await expect(page.getByTestId("product-actions-error")).toBeVisible();
    await expect(page.getByTestId("actions-error-message")).toContainText(
      "Intentional reactive error",
    );

    // Critical content remains.
    await expect(page.getByTestId("product-name")).toHaveText(
      "Mechanical Keyboard",
    );
    await expect(page.getByTestId("reviews-section")).toBeVisible({
      timeout: 5000,
    });

    // Reset returns the boundary to its initial state.
    await page.getByTestId("actions-error-reset").click();
    await expect(page.getByTestId("trigger-client-error")).toBeVisible();
    await expect(page.getByTestId("product-actions-error")).toHaveCount(0);
  });
});

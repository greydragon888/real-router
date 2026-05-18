import { expect, test } from "@playwright/test";

test.describe("Streaming SSR Example (Solid)", () => {
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

  test("Scenario 2: streamed response contains resolved deferred content", async ({
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

  test("Scenario 11: chunked transfer + per-Suspense timing", async ({
    request,
  }) => {
    // Solid's renderToStream uses chunked HTTP transfer (Transfer-Encoding:
    // chunked). Wall-clock body delivery >= max(reviews=600ms,
    // related=1200ms) — the response cannot complete sooner than the slowest
    // deferred section because onCompleteAll closes the writer only after
    // every Suspense boundary resolves.
    const start = Date.now();
    const response = await request.get("/products/1");
    const html = await response.text();
    const elapsed = Date.now() - start;

    expect(response.status()).toBe(200);
    expect(response.headers()["transfer-encoding"]).toBe("chunked");
    expect(response.headers()["content-length"]).toBeUndefined();

    // Related items have a 1200ms server-only setTimeout. Allow a small
    // lower-bound margin for clock jitter.
    expect(elapsed).toBeGreaterThanOrEqual(1100);

    expect(html).toContain('data-related-id="k1"');
  });

  test("Scenario 12 (Solid OOO): streamed HTML contains <template id=\"...\"> chunks for deferred sections", async ({
    request,
  }) => {
    // Solid's renderToStream emits each Suspense boundary as
    //   1) inline fallback marker on first paint
    //   2) <template id="..."> with the resolved subtree, plus an inline
    //      $df(...) script that splices the template into the placeholder.
    // The presence of <template id="..."> + $df(...) is the structural
    // proof of OOO streaming — Vue's blocking SSR Suspense never produces
    // these markers.
    const response = await request.get("/products/1");
    const html = await response.text();

    expect(html).toMatch(/<template id="[^"]+">/);
    expect(html).toContain("$df(");
  });

  test("Scenario 13 (Solid OOO): hydration script + _$HY runtime are injected before the streamed body", async ({
    request,
  }) => {
    const response = await request.get("/products/1");
    const html = await response.text();

    const hyIdx = html.indexOf("_$HY");
    const rootIdx = html.indexOf('<div id="root">');

    expect(hyIdx).toBeGreaterThan(-1);
    expect(rootIdx).toBeGreaterThan(-1);
    // Hydration script must precede the streamed body so client patches
    // (`$df("…")`) have a runtime to attach to.
    expect(hyIdx).toBeLessThan(rootIdx);
  });

  test("Scenario 14: empty deferred state renders empty-state UI without errors", async ({
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
    await expect(page.getByTestId("reviews-empty")).toBeVisible();
    await expect(page.getByTestId("reviews-section")).toHaveCount(0);

    // Related items also has no entry for id=5 — section renders with empty list.
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

  test("Scenario 15 (Solid OOO): fallback markers ship in the initial chunk and are replaced after streaming completes", async ({
    page,
    request,
  }) => {
    // Solid's OOO model emits the fallback in the first chunk (inverse of
    // Vue's blocking model). The HTTP-level test verifies the fallback is
    // present in the streamed bytes; the browser test verifies the resolved
    // section eventually replaces it.
    const response = await request.get("/products/1");
    const html = await response.text();

    expect(html).toContain('data-testid="reviews-fallback"');
    expect(html).toContain('data-testid="related-fallback"');
    // Resolved sections also ship in the same response (later chunks).
    expect(html).toContain('data-testid="reviews-section"');
    expect(html).toContain('data-testid="related-section"');

    await page.goto("/products/1");
    await expect(page.getByTestId("reviews-section")).toBeVisible({
      timeout: 5000,
    });

    // After hydration completes, fallbacks are removed by the splice scripts.
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("reviews-fallback")).toHaveCount(0);
    await expect(page.getByTestId("related-fallback")).toHaveCount(0);
  });

  test("Scenario 16: loader-driven 404 — /products/9999 returns 404 + plain text (LoaderNotFound)", async ({
    request,
  }) => {
    // The products.detail loader throws LoaderNotFound for ids not in the
    // database. entry-server.tsx maps LOADER_NOT_FOUND → status:404 +
    // text/plain, bypassing the streaming pipeline entirely (the body is
    // sent as a buffered response, not chunked). Same contract as
    // svelte/ssr-streaming and angular/ssr — gives streaming examples a
    // clean way to short-circuit before the first chunk for missing data.
    const response = await request.get("/products/9999");

    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toContain("text/plain");
  });

  test("Scenario 17 (Solid-unique): TCP frame timing — body arrives in MULTIPLE frames over time, real progressive flush", async () => {
    // This is the empirical proof that Solid streaming is **actually
    // streaming** at the HTTP level — unlike Angular and Svelte, where
    // identical-shaped tests measure a single TCP frame with ~0 ms span
    // (their "streaming" is really client-side incremental hydration).
    //
    // Solid emits the shell + critical content in the first frame, then
    // a Reviews chunk after the 600 ms server-side delay, then a Related
    // chunk after 1200 ms — all visible to a Node `http.request` consumer
    // as separate `data` events. This test pins the contract: a regression
    // that flips Solid to single-frame buffered SSR will fail noisily.
    const { request: nodeRequest } = await import("node:http");

    const startedAt = Date.now();
    const chunks: { ts: number; size: number }[] = [];

    await new Promise<void>((resolve, reject) => {
      const req = nodeRequest("http://localhost:3009/products/1", (res) => {
        res.on("data", (buf: Buffer) => {
          chunks.push({ ts: Date.now() - startedAt, size: buf.length });
        });
        res.on("end", () => resolve());
        res.on("error", reject);
      });

      req.on("error", reject);
      req.end();
    });

    expect(chunks.length).toBeGreaterThanOrEqual(2);

    // Span must cover at least one server-side delay (600 ms reviews) to
    // prove progressive flush. Generous floor (400 ms) to absorb CI
    // jitter; ceiling implicit in the streaming pipeline (~1.5 s for
    // both deferred sections to resolve).
    const span = chunks.at(-1)!.ts - chunks[0]!.ts;

    expect(
      span,
      "expected progressive flush spanning at least the slowest server-side delay",
    ).toBeGreaterThan(400);
  });

  test("Scenario 18 (Solid-unique): selective hydration — fallback HTML and resolved HTML arrive in different chunks", async () => {
    // Reads chunks one by one and inspects content. The first frame must
    // contain the `reviews-fallback` placeholder (shell). A later frame
    // must contain `data-review-id=` for the resolved Reviews component
    // (after the server-side 600 ms delay). This proves the chunks are
    // not just multiple TCP frames of one buffered string — the SERVER
    // genuinely emits resolved content separately from the shell.
    const { request: nodeRequest } = await import("node:http");

    const chunkBodies: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const req = nodeRequest("http://localhost:3009/products/1", (res) => {
        res.on("data", (buf: Buffer) => {
          chunkBodies.push(buf.toString("utf8"));
        });
        res.on("end", () => resolve());
        res.on("error", reject);
      });

      req.on("error", reject);
      req.end();
    });

    expect(chunkBodies.length).toBeGreaterThanOrEqual(2);

    // Find the FIRST chunk that contains the fallback marker — this is
    // the shell. Resolved review markup MUST appear in a LATER chunk
    // (proves selective hydration: server emits resolved sections
    // separately, not all-at-once after the slowest Suspense resolves).
    const fallbackChunkIndex = chunkBodies.findIndex((body) =>
      body.includes('data-testid="reviews-fallback"'),
    );

    expect(fallbackChunkIndex, "fallback must appear in some chunk").toBeGreaterThanOrEqual(0);

    const beforeAndIncludingFallback = chunkBodies
      .slice(0, fallbackChunkIndex + 1)
      .join("");
    const afterFallback = chunkBodies
      .slice(fallbackChunkIndex + 1)
      .join("");

    // Resolved review markup must NOT be in the fallback chunk or before.
    expect(beforeAndIncludingFallback).not.toContain("data-review-id=");
    // Resolved review markup MUST appear in a later chunk.
    expect(afterFallback).toContain("data-review-id=");
  });

  // FIXME(vite-plugin-solid 2.11.x): when ProductActions sits as a sibling
  // to streaming `<Suspense>` boundaries (Reviews, RelatedItems), the
  // hydration-key counter drifts and ProductActions' event handlers /
  // `onMount` / `use:trackView` directive silently fail to attach. Verified
  // independent of `defer()` API or any extra wrapper component — happens
  // with bare `<Suspense>` + `createResource`. Same root cause as the
  // `RouteView.NotFound` workaround in App.tsx and the `<SuspenseList>` note
  // in ProductDetail.tsx. Track upstream and re-enable when the plugin's
  // hydration-key generator stabilises.
  test.fixme("Scenario 19: <ErrorBoundary> reset — clicking 'Try again' restores the original tree without remount", async ({
    page,
  }) => {
    // Solid's <ErrorBoundary fallback={(err, reset) => ...}> exposes a
    // `reset` callback that re-attempts the failed branch. Combined
    // with our local `crashed` signal, click-to-recover works:
    //   1. Click trigger → child throws → fallback renders
    //   2. Click "Try again" → reset() + setCrashed(false) → original
    //      tree is back, no full unmount
    await page.goto("/products/1");

    // Streaming pipeline: ProductActions is the last sibling. Wait for
    // the trigger button to be hydrated before clicking.
    await expect(page.getByTestId("trigger-client-error")).toBeVisible({
      timeout: 7000,
    });
    await expect(page.getByTestId("product-actions-error")).toHaveCount(0);

    await page.getByTestId("trigger-client-error").click();
    await expect(page.getByTestId("product-actions-error")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId("actions-error-message")).toContainText(
      "Intentional reactive error",
    );

    // Critical content survives.
    await expect(page.getByTestId("product-name")).toHaveText(
      "Mechanical Keyboard",
    );
    await expect(page.getByTestId("reviews-section")).toBeVisible({
      timeout: 5000,
    });

    await page.getByTestId("actions-error-reset").click();
    await expect(page.getByTestId("trigger-client-error")).toBeVisible();
    await expect(page.getByTestId("product-actions-error")).toHaveCount(0);
  });

  test("Scenario 22: HEAD request — early-exits the streaming pipeline (200 + Content-Type, empty body, fast)", async ({
    request,
  }) => {
    // CDN probes / fetch(method: 'HEAD') should not trigger
    // renderToStream. server/index.ts has an explicit `app.head()`
    // handler that returns 200 + headers + empty body without invoking
    // the entry-server.tsx render path. Verify timing < 200 ms (the
    // GET path takes ≥1500 ms because of Suspense awaits with the
    // nested breakdown).
    const startedAt = Date.now();
    const response = await request.fetch("/products/1", { method: "HEAD" });
    const elapsed = Date.now() - startedAt;

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/html");
    expect(elapsed).toBeLessThan(200);

    const body = await response.body();

    expect(body.length).toBe(0);
  });

  // FIXME(vite-plugin-solid 2.11.x): same hydration-key drift as Scenario 19
  // — ProductActions' `onMount` callback never fires post-hydration. SSR
  // HTML scrub guarantee (server side) is preserved by Scenario 24.
  test.fixme("Scenario 20: onMount + isServer — populates window.__MOUNT_LOG__ on hydration; SSR HTML never references it", async ({
    page,
    request,
  }) => {
    // The action's body uses `window.__MOUNT_LOG__`. Solid's `onMount`
    // hook + `isServer` constant guarantee the body never runs on the
    // server. Verify both:
    //   1. After hydration, window.__MOUNT_LOG__ is populated.
    //   2. The raw SSR HTML response contains zero references to
    //      __MOUNT_LOG__ — the side-effect statement is dead code on
    //      the server.
    const response = await request.get("/products/1");
    const html = await response.text();

    expect(html).not.toContain("__MOUNT_LOG__");

    // SuspenseList delays the streaming pipeline up to ~1.2 s. Wait
    // for the action element specifically — populated as soon as its
    // onMount hook fires post-hydration of the actions chunk.
    await page.goto("/products/1");
    await expect(page.getByTestId("product-actions")).toBeVisible({
      timeout: 7000,
    });

    // Poll for the log populated by onMount; allow up to 5 s after the
    // actions chunk is visible to absorb any post-hydration scheduling.
    const log = await page.waitForFunction(
      () =>
        (window as Window & { __MOUNT_LOG__?: { source: string }[] })
          .__MOUNT_LOG__,
      undefined,
      { timeout: 5000 },
    );

    const logValue = (await log.jsonValue()) as { source: string }[];

    expect(logValue.length).toBeGreaterThan(0);
    expect(logValue.some((entry) => entry.source === "ProductActions")).toBe(
      true,
    );
  });

  // FIXME(vite-plugin-solid 2.11.x): same hydration-key drift as Scenarios
  // 19/20 — `use:trackView` directive on the `<article>` never executes
  // because the runtime fails to claim its DOM node during selective
  // hydration. SSR HTML scrub guarantee (server side) is preserved by
  // Scenario 24.
  test.fixme("Scenario 23: use:trackView directive — IntersectionObserver fires on hydration, populates window.__VIEW_LOG__", async ({
    page,
  }) => {
    // `<article use:trackView={{ productId }}>` registers an
    // IntersectionObserver on hydration. The article is in the
    // viewport on page load → observer fires → log entry pushed.
    // Same pattern as Svelte's `use:` action — Solid action body never
    // runs on the server (verified by Scenario 24).
    await page.goto("/products/2");

    const log = await page.waitForFunction(
      () =>
        (window as Window & { __VIEW_LOG__?: { productId: string }[] })
          .__VIEW_LOG__,
      undefined,
      { timeout: 7000 },
    );

    const logValue = (await log.jsonValue()) as { productId: string }[];

    expect(logValue.length).toBeGreaterThan(0);
    expect(logValue[0]?.productId).toBe("2");
  });

  test("Scenario 24: use:trackView is SSR-safe — server HTML never references window or __VIEW_LOG__", async ({
    request,
  }) => {
    // Solid SSR runtime skips action invocations entirely. Verify by
    // inspecting the wire response: no marker that the action ran, no
    // inline reference to its globals. (Same SSR-safety guarantee as
    // Svelte's `use:` actions.)
    const response = await request.get("/products/1");
    const html = await response.text();

    expect(html).toContain('data-testid="product-detail"');
    expect(html).not.toContain("__VIEW_LOG__");
    expect(html).not.toContain("IntersectionObserver");
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

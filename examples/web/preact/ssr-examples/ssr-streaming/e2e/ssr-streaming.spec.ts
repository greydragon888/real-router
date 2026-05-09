import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

    test("product detail server-renders the critical shell without JS; deferred sections need JS to swap from <preact-island> hidden", async ({
      page,
    }) => {
      // Critical content (product header, price, description) lands in the
      // initial stream synchronously. Deferred sections (Reviews,
      // RelatedItems via `defer()` + `<Await>`) emit a fallback inline and
      // park the resolved HTML inside `<preact-island hidden>` markers —
      // the custom-element bootstrap script swaps them on the client.
      // Without JS, the islands stay hidden (similar to React 19's
      // `<template>` + `$RC()` swap). The defer() formal API is
      // documented as DX-only for Preact streaming; see
      // `.claude/SSR_FEATURE_GAPS_RU.md` §7 ROI table.
      await page.goto("/products/1");
      await expect(
        page.locator('[data-testid="product-detail"]'),
      ).toHaveAttribute("data-product-id", "1");
      // Critical: product name visible.
      await expect(page.locator('[data-testid="product-name"]')).toBeVisible();
      // Deferred sections present in DOM but hidden inside <preact-island>.
      const reviewsCount = await page
        .locator('[data-testid="reviews-section"]')
        .count();

      expect(reviewsCount).toBe(1);
      const relatedCount = await page
        .locator('[data-testid="related-section"]')
        .count();

      expect(relatedCount).toBe(1);
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

  test.describe("lazy() + Suspense — code-split streaming via <preact-island>", () => {
    // Note on Preact 10's module-level cache:
    // `lazy(() => import("./X"))` caches the resolved module at module
    // scope. The Suspense fallback is therefore emitted ONLY on the
    // first SSR after the server starts; subsequent renders see the
    // cached module synchronously and skip the fallback. This matches
    // React's `React.lazy` behaviour and is the reason the React
    // streaming guide recommends `useMemo`-per-render promises for
    // visible-on-every-request streaming. Tests below assert what
    // holds REGARDLESS of cache state, plus filesystem-level proof
    // that code-splitting really happened.

    test("rendered specs section is present in the streamed HTML", async ({
      request,
    }) => {
      // After the lazy import settles (always, by the time Express
      // pipes the final byte), the resolved specs section must be in
      // the response. Holds for first or warmed cache.
      const html = await (await request.get("/products/1")).text();

      expect(html).toContain('data-testid="specs-section"');
      expect(html).toContain("Switch type");
      expect(html).toContain("Cherry MX Brown");
    });

    test("the <preact-island> bootstrap script ships when any deferred boundary is present", async ({
      request,
    }) => {
      // After the defer() refactor, Reviews and RelatedItems are deferred
      // boundaries — they ALWAYS emit `<preact-island>` markers regardless
      // of the lazy() module-cache state. The Suspense boundary plus
      // `<Await>` injects fallback HTML before the resolved island, and
      // preact-render-to-string ships the bootstrap script that swaps
      // them. Verify the bootstrap is present whenever the page has
      // any preact-island marker.
      const html = await (await request.get("/products/1")).text();
      const hasIsland = html.includes("<preact-island");
      const hasBootstrap = html.includes('customElements.define("preact-island"');

      expect(hasIsland).toBe(true);
      expect(hasBootstrap).toBe(true);
    });

    test("ProductSpecs is emitted as a separate code-split chunk", () => {
      // Filesystem-level proof: Vite saw the dynamic import and
      // emitted a separate chunk under dist/client/assets/. This
      // is the static guarantee — it doesn't depend on runtime
      // cache state.
      const assetsDir = path.resolve(
        __dirname,
        "..",
        "dist",
        "client",
        "assets",
      );
      const files = readdirSync(assetsDir);
      const specsChunk = files.find((f) => /^ProductSpecs-/.test(f));

      expect(specsChunk).toBeTruthy();
      expect(specsChunk).toMatch(/\.js$/);
    });

    test("post-hydration DOM shows resolved specs section", async ({
      page,
    }) => {
      // After hydration, the resolved specs section is visible.
      // (When the fallback is emitted, the <preact-island> custom
      // element's connectedCallback swaps it for the resolved
      // content; otherwise it was inlined directly.)
      await page.goto("/products/1");
      await page.waitForLoadState("networkidle");

      await expect(
        page.locator('[data-testid="specs-section"]'),
      ).toBeVisible();
      await expect(page.locator("text=Switch type")).toBeVisible();
    });
  });

  test.describe("Post-hydration loader skip (#596)", () => {
    test("client makes zero loader-driven calls on first paint", async ({
      page,
    }) => {
      await page.goto("/products/1");
      await page.waitForLoadState("networkidle");

      const counts = await page.evaluate(() => globalThis.__LOADER_CALLS__);

      expect(counts).toEqual({});
    });

    test("list route hydrates without loader fire", async ({ page }) => {
      await page.goto("/products");
      await page.waitForLoadState("networkidle");

      const counts = await page.evaluate(() => globalThis.__LOADER_CALLS__);

      expect(counts).toEqual({});
    });
  });

  test.describe("Per-route SSR mode (#597)", () => {
    test("client-only entry skips loader, mode marker is in __SSR_STATE__", async ({
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
});

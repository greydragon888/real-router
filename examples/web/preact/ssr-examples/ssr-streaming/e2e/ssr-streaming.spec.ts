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
});

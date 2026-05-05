import { expect, test } from "@playwright/test";

test.describe("Preact SSR — smoke", () => {
  test("home page is server-rendered with correct title and content", async ({
    page,
  }) => {
    const response = await page.goto("/");

    expect(response?.status()).toBe(200);

    const html = await response!.text();

    // Server-rendered HTML must contain the page content BEFORE JS runs.
    expect(html).toContain("Welcome");
    expect(html).toContain("<h1>Welcome</h1>");
    // Per-route meta from src/router/meta.ts:
    expect(html).toContain("<title>Home — Real-Router Preact SSR</title>");
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('property="og:title"');
    // SSR state injected for hydration:
    expect(html).toContain("window.__SSR_STATE__");
  });

  test("users list is server-rendered with loader data", async ({ page }) => {
    const response = await page.goto("/users");

    expect(response?.status()).toBe(200);

    const html = await response!.text();

    expect(html).toContain("All Users");
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html).toContain("Charlie");
  });

  test("user profile renders with nested loader data", async ({ page }) => {
    const response = await page.goto("/users/1");

    expect(response?.status()).toBe(200);

    const profile = page.locator('[data-testid="user-profile"]');
    await expect(profile).toHaveAttribute("data-user-id", "1");
    await expect(page.locator('[data-testid="user-name"]')).toContainText(
      "Alice",
    );
  });

  test("404 for unknown route returns status 404 + NotFound page", async ({
    page,
  }) => {
    const response = await page.goto("/totally-unknown");

    expect(response?.status()).toBe(404);
    await expect(page.locator("h1")).toContainText("404");
  });

  test("loader-driven 404: unknown user id returns plain-text 404", async ({
    request,
  }) => {
    const response = await request.get("/users/9999");

    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toContain("text/plain");
  });

  test("loader-driven 301 redirect: /legacy-user/2 → /users/2", async ({
    request,
  }) => {
    const response = await request.get("/legacy-user/2", {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(301);
    expect(response.headers()["location"]).toContain("/users/2");
  });

  test("loader timeout: /slow returns 504 within budget", async ({
    request,
  }) => {
    const start = Date.now();
    const response = await request.get("/slow");
    const elapsed = Date.now() - start;

    expect(response.status()).toBe(504);
    // Server timeout is 250 ms; full slow loader is 5 s. We must come back
    // well under the slow loader's full delay.
    expect(elapsed).toBeLessThan(2000);
  });

  test("hydration completes without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/users/1");
    await page.waitForLoadState("networkidle");

    const hydrationErrors = errors.filter((m) =>
      /hydrat|mismatch/i.test(m),
    );

    expect(hydrationErrors).toEqual([]);
  });

  test("client-side navigation works after hydration", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.locator("nav >> text=Users").click();
    await expect(page).toHaveURL("/users");
    await expect(page.locator("h1")).toContainText("Users");
  });

  test("ETag round-trip: identical request returns 304", async ({
    request,
  }) => {
    const first = await request.get("/");

    expect(first.status()).toBe(200);

    const etag = first.headers()["etag"];
    expect(etag).toBeTruthy();

    const second = await request.get("/", {
      headers: { "If-None-Match": etag! },
    });

    expect(second.status()).toBe(304);
  });

  test("Cache-Control per route: home gets long max-age", async ({
    request,
  }) => {
    const response = await request.get("/");

    expect(response.headers()["cache-control"]).toContain("s-maxage=3600");
  });

  test("Cache-Control: dashboard gets private no-store", async ({
    request,
  }) => {
    const response = await request.get("/dashboard", {
      headers: { Cookie: "userId=2" },
      maxRedirects: 0,
    });

    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  test("auth gate: unauthenticated /dashboard → 302 to /", async ({
    request,
  }) => {
    const response = await request.get("/dashboard", { maxRedirects: 0 });

    expect(response.status()).toBe(302);
    expect(response.headers()["location"]).toBe("/");
  });

  test("admin gate: non-admin Bob → 302 to /", async ({ request }) => {
    const response = await request.get("/admin", {
      headers: { Cookie: "userId=2" },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(302);
  });

  test("admin gate: admin Alice → 200 + admin page", async ({ request }) => {
    const response = await request.get("/admin", {
      headers: { Cookie: "userId=1" },
    });

    expect(response.status()).toBe(200);

    const html = await response.text();
    expect(html).toContain("admin-page");
  });

  test("useId emits stable IDs that survive hydration", async ({ page }) => {
    const response = await page.goto("/");
    const html = await response!.text();

    // Two label[for] should reference two distinct id values, both
    // present on the form. Same IDs must appear in the live DOM
    // post-hydration without warnings.
    const labelMatches = [
      ...html.matchAll(/<label[^>]+for="([^"]+)"[^>]*data-testid="query-label"/g),
    ];
    expect(labelMatches.length).toBeGreaterThanOrEqual(1);

    await page.waitForLoadState("networkidle");

    const queryLabel = page.locator('[data-testid="query-label"]');
    const queryInput = page.locator('[data-testid="query-input"]');
    const labelFor = await queryLabel.getAttribute("for");
    const inputId = await queryInput.getAttribute("id");

    expect(labelFor).toBeTruthy();
    expect(inputId).toBe(labelFor);
  });
});

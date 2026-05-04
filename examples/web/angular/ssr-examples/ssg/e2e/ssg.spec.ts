import { test, expect } from "@playwright/test";

test.describe("SSG (Angular)", () => {
  test("static HTML contains pre-rendered home page", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/");

    await expect(page.locator("nav")).toContainText("Home");
    await expect(page.getByTestId("home-page")).toBeVisible();
    await expect(page.locator("main")).toContainText("Welcome");

    await context.close();
  });

  test("static HTML contains pre-rendered users list", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/users");

    await expect(page.locator("main")).toContainText("Alice");
    await expect(page.locator("main")).toContainText("Bob");
    await expect(page.locator("main")).toContainText("Charlie");

    await context.close();
  });

  test("dynamic routes are pre-rendered with correct data", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/users/1");

    await expect(page.getByTestId("user-profile")).toBeVisible();
    await expect(page.getByTestId("user-name")).toHaveText("Name: Alice");

    await context.close();
  });

  test("Angular convention: <base href> present in pre-rendered HTML", async ({
    page,
  }) => {
    const response = await page.goto("/users/1");
    const html = await response!.text();

    expect(html).toMatch(/<base href="\/"\s*\/?>/);
  });

  test("zoneless proof: no zone.js artifacts in pre-rendered HTML", async ({
    page,
  }) => {
    const response = await page.goto("/");
    const html = await response!.text();

    expect(html).not.toContain("zone.js");
    expect(html).not.toContain("ng-zone");
  });

  test("no hydration mismatch warnings", async ({ page }) => {
    const errors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const hydrationErrors = errors.filter(
      (e) =>
        e.includes("hydrat") ||
        e.includes("mismatch") ||
        e.includes("did not match"),
    );

    expect(hydrationErrors).toHaveLength(0);
  });

  test("client-side navigation works after hydration", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.evaluate(() => {
      (
        globalThis as unknown as Window & { __NAV_MARKER__?: boolean }
      ).__NAV_MARKER__ = true;
    });

    await page.click("text=Users");
    await expect(page).toHaveURL(/\/users/);
    await expect(page.locator("main")).toContainText("Users");

    const marker = await page.evaluate(
      () =>
        (globalThis as unknown as Window & { __NAV_MARKER__?: boolean })
          .__NAV_MARKER__,
    );

    expect(marker).toBe(true);
  });

  test("loader output is baked into static HTML", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    const response = await page.goto("/users");
    const html = await response!.text();

    expect(html).toMatch(/Alice/);
    expect(html).toMatch(/Bob/);
    expect(html).toMatch(/Charlie/);

    await context.close();
  });

  test("dynamic-route loader output is baked per pre-rendered URL", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    for (const id of ["1", "2", "3"]) {
      const response = await page.goto(`/users/${id}`);
      const html = await response!.text();

      expect(html).toContain(`data-user-id="${id}"`);
    }

    await context.close();
  });

  test("per-page meta tags: home, users list, dynamic profile have distinct title + description", async ({
    request,
  }) => {
    const cases = [
      {
        path: "/",
        title: "Home — Real-Router Angular SSG",
        description: "Welcome page of the Real-Router Angular SSG demo.",
      },
      {
        path: "/users/",
        title: "All Users — Real-Router Angular SSG",
        description: "Browse the full list of pre-rendered users.",
      },
      {
        path: "/users/1/",
        title: "Alice — Real-Router Angular SSG",
        description: "Profile page for Alice (id: 1).",
      },
      {
        path: "/users/3/",
        title: "Charlie — Real-Router Angular SSG",
        description: "Profile page for Charlie (id: 3).",
      },
    ];

    for (const { path, title, description } of cases) {
      const response = await request.get(path);

      expect(response.status(), path).toBe(200);

      const html = await response.text();

      expect(html, `${path} title`).toContain(`<title>${title}</title>`);
      expect(html, `${path} description`).toContain(`content="${description}"`);
    }
  });

  test("404.html: pre-rendered fallback has not-found meta", async ({
    request,
  }) => {
    const response = await request.get("/404.html");

    expect(response.status()).toBe(200);

    const html = await response.text();

    expect(html).toContain(
      "<title>Page Not Found — Real-Router Angular SSG</title>",
    );
    expect(html).toContain(
      'content="The page you are looking for does not exist."',
    );
  });

  test("sitemap.xml: lists all pre-rendered URLs with site origin", async ({
    request,
  }) => {
    const response = await request.get("/sitemap.xml");

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("xml");

    const xml = await response.text();

    expect(xml).toContain("<urlset");
    expect(xml).toContain("<loc>https://example.com/</loc>");
    expect(xml).toContain("<loc>https://example.com/users</loc>");
    expect(xml).toContain("<loc>https://example.com/users/1</loc>");
    expect(xml).toContain("<loc>https://example.com/users/2</loc>");
    expect(xml).toContain("<loc>https://example.com/users/3</loc>");
  });

  test("static output isolation: each pre-rendered URL ships its own resolved data", async ({
    request,
  }) => {
    const targets = [
      { path: "/users/1/", expectedName: "Alice" },
      { path: "/users/2/", expectedName: "Bob" },
      { path: "/users/3/", expectedName: "Charlie" },
    ];

    const responses = await Promise.all(
      targets.map(({ path }) => request.get(path)),
    );

    await Promise.all(
      responses.map(async (response, i) => {
        const { expectedName, path } = targets[i];

        expect(response.status(), path).toBe(200);

        const html = await response.text();

        expect(html, `${path} name`).toContain(expectedName);
      }),
    );
  });

  test("nested deep-link has no flash: profile content visible immediately and survives hydration", async ({
    page,
  }) => {
    await page.goto("/users/1/", { waitUntil: "commit" });

    await expect(page.locator("main")).toContainText("Alice");
    await expect(page.locator("main")).toContainText("ID: 1");
    await expect(page.locator("main")).toContainText("Name: Alice");

    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toContainText("Alice");
    await expect(page.locator("main")).toContainText("ID: 1");
    await expect(page.locator("main")).toContainText("Name: Alice");
  });

  test("CSR navigation post-hydration: navigating to dynamic route shows User not found (SSR-only plugin contract)", async ({
    page,
  }) => {
    // /users initial visit: hydrateRouter calls start("/users") → loader runs
    // → state.context.data is populated. Alice/Bob/Charlie render normally.
    // After hydration, clicking a user triggers CSR navigation; the
    // ssr-data-plugin only intercepts start(), not navigate(), so
    // state.context.data is undefined → "User not found" renders.
    // This is the same contract as ssr/ — see that example's README.
    await page.goto("/users/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).toContainText("Alice");

    await page.click("text=Alice");
    await expect(page).toHaveURL(/\/users\/1\/?$/);
    await expect(page.getByTestId("user-not-found")).toBeVisible();
  });
});

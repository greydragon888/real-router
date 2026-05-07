import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { test, expect } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BROWSER_DIST = resolve(
  __dirname,
  "../dist/ssg-angular-example/browser",
);

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

  test("filesystem layout: dist contains exactly one index.html per pre-rendered route + nested posts pages", async () => {
    // Sanity-check the on-disk shape that a CDN would deploy. The build is
    // expected to produce: index.html (home), users/index.html (list),
    // users/{1,2,3}/index.html (profiles), users/{1,2,3}/posts/index.html
    // (nested posts pages), 404.html, sitemap.xml. Any extra index.html
    // under users/ would mean a bug in entries.ts or in getStaticPaths —
    // overfetch would inflate CDN object count and ship stale pages.
    expect(existsSync(BROWSER_DIST)).toBe(true);

    expect(existsSync(resolve(BROWSER_DIST, "index.html"))).toBe(true);
    expect(existsSync(resolve(BROWSER_DIST, "404.html"))).toBe(true);
    expect(existsSync(resolve(BROWSER_DIST, "sitemap.xml"))).toBe(true);

    expect(
      existsSync(resolve(BROWSER_DIST, "users/index.html")),
    ).toBe(true);

    for (const id of ["1", "2", "3"]) {
      expect(
        existsSync(resolve(BROWSER_DIST, `users/${id}/index.html`)),
        `users/${id}/index.html`,
      ).toBe(true);
      expect(
        existsSync(resolve(BROWSER_DIST, `users/${id}/posts/index.html`)),
        `users/${id}/posts/index.html`,
      ).toBe(true);
    }
  });

  test("overfetch protection: only ids declared in entries.ts are pre-rendered", async () => {
    // entries.ts returns {1, 2, 3} → exactly three /users/<id>/ subdirectories
    // must exist. If getStaticPaths or entries grew silently, /users/4 would
    // appear here and inflate sitemap.xml / dist.
    const usersDir = resolve(BROWSER_DIST, "users");
    const subdirs = readdirSync(usersDir).filter((name) =>
      statSync(resolve(usersDir, name)).isDirectory(),
    );

    expect(subdirs.toSorted()).toEqual(["1", "2", "3"]);

    expect(existsSync(resolve(usersDir, "4"))).toBe(false);
    expect(existsSync(resolve(usersDir, "999"))).toBe(false);
  });

  test("canonical + OpenGraph meta: each pre-rendered route ships SEO-ready tags", async ({
    request,
  }) => {
    // SSG output must include rel=canonical (deduplication signal for search
    // engines) plus og:type / og:title / og:url / og:image (link previews on
    // social platforms). These cost almost nothing to inject and are
    // expected to be there even for a demo example.
    const cases = [
      {
        path: "/",
        canonical: "https://example.com/",
        ogType: "website",
      },
      {
        path: "/users/",
        canonical: "https://example.com/users",
        ogType: "website",
      },
      {
        path: "/users/1/",
        canonical: "https://example.com/users/1",
        ogType: "profile",
      },
      {
        path: "/users/3/",
        canonical: "https://example.com/users/3",
        ogType: "profile",
      },
      {
        path: "/users/2/posts/",
        canonical: "https://example.com/users/2/posts",
        ogType: "article",
      },
    ];

    for (const { path, canonical, ogType } of cases) {
      const response = await request.get(path);

      expect(response.status(), path).toBe(200);

      const html = await response.text();

      expect(html, `${path} canonical`).toContain(
        `<link rel="canonical" href="${canonical}" />`,
      );
      expect(html, `${path} og:url`).toContain(
        `<meta property="og:url" content="${canonical}" />`,
      );
      expect(html, `${path} og:type`).toContain(
        `<meta property="og:type" content="${ogType}" />`,
      );
      expect(html, `${path} og:image present`).toContain(
        'property="og:image"',
      );
      expect(html, `${path} twitter:card`).toContain(
        '<meta name="twitter:card" content="summary_large_image" />',
      );
    }
  });

  test("canonical for profile is per-id (not the parent /users URL)", async () => {
    // Detect a stale-meta regression where every dynamic page shares the
    // parent canonical: that would tank SEO for individual profiles.
    const aliceHtml = readFileSync(
      resolve(BROWSER_DIST, "users/1/index.html"),
      "utf8",
    );
    const charlieHtml = readFileSync(
      resolve(BROWSER_DIST, "users/3/index.html"),
      "utf8",
    );

    expect(aliceHtml).toContain(
      '<link rel="canonical" href="https://example.com/users/1" />',
    );
    expect(charlieHtml).toContain(
      '<link rel="canonical" href="https://example.com/users/3" />',
    );

    expect(aliceHtml).not.toContain(
      '<link rel="canonical" href="https://example.com/users" />',
    );
  });

  test("sitemap.xml matches the on-disk pre-rendered set (no extras, no missing)", async () => {
    // Cross-check sitemap entries against the actual filesystem: every URL
    // listed must correspond to a generated file, and every generated page
    // must be listed.
    const xml = readFileSync(resolve(BROWSER_DIST, "sitemap.xml"), "utf8");
    const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)];
    const urls = matches.map((entry) => entry[1]);

    expect(urls.toSorted()).toEqual(
      [
        "https://example.com/",
        "https://example.com/users",
        "https://example.com/users/1",
        "https://example.com/users/1/posts",
        "https://example.com/users/2",
        "https://example.com/users/2/posts",
        "https://example.com/users/3",
        "https://example.com/users/3/posts",
      ].toSorted(),
    );
  });

  test("nested route pre-rendering: /users/:id/posts gets its own static HTML with loader data", async ({
    request,
  }) => {
    // Intermediate (users.profile) AND leaf (users.profile.posts) routes
    // both pre-render. Posts page must contain post titles in the static
    // HTML — proves the nested-loader runs at build time and writes data
    // into the bundled __SSR_STATE__ via the in-process SSR pipeline.
    const response = await request.get("/users/1/posts/");

    expect(response.status()).toBe(200);

    const html = await response.text();

    expect(html).toContain('data-testid="user-posts"');
    expect(html).toContain("Hello world");
    expect(html).toContain("On routing");
  });

  test("nested route empty state: /users/3/posts ships empty-posts UI", async ({
    request,
  }) => {
    // User 3 has no posts in the in-memory database. The loader returns
    // an empty array; the empty-state branch of UserPostsComponent must
    // render at build time.
    const response = await request.get("/users/3/posts/");
    const html = await response.text();

    expect(html).toContain('data-testid="user-posts-empty"');
  });

  test("nested route per-id title + canonical: /users/1/posts is distinct from /users/2/posts", async () => {
    // Stale-meta regression check: each posts page must reference its own
    // user id in title + canonical, not share the parent /users/:id URL.
    const alicePosts = readFileSync(
      resolve(BROWSER_DIST, "users/1/posts/index.html"),
      "utf8",
    );
    const bobPosts = readFileSync(
      resolve(BROWSER_DIST, "users/2/posts/index.html"),
      "utf8",
    );

    expect(alicePosts).toContain(
      "<title>Alice's posts — Real-Router Angular SSG</title>",
    );
    expect(alicePosts).toContain(
      '<link rel="canonical" href="https://example.com/users/1/posts" />',
    );
    expect(alicePosts).toContain(
      '<meta property="og:type" content="article" />',
    );

    expect(bobPosts).toContain(
      "<title>Bob's posts — Real-Router Angular SSG</title>",
    );
    expect(bobPosts).toContain(
      '<link rel="canonical" href="https://example.com/users/2/posts" />',
    );

    // Critically: posts page does NOT share the profile canonical.
    expect(alicePosts).not.toContain(
      '<link rel="canonical" href="https://example.com/users/1" />',
    );
  });

  test("post-hydration loader skip (#599): SSG-prerendered HTML carries TransferState seed; client skips loader on hydration", async ({
    page,
  }) => {
    // SSG generates static HTML at build time via in-process AngularNodeAppEngine
    // (scripts/ssg-build.ts). Each prerendered page contains
    // `<script id="ng-state" type="application/json">…</script>` with the
    // SSR-resolved router state — written by provideRealRouterFactory's
    // TransferState bridge (#599) during the build pass. On client hydration,
    // the same bridge consumes the seed via hydrateRouter(...) and ssr-data-plugin
    // reuses the server-resolved state.context.data — counter stays empty.
    await page.goto("/users/1");
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

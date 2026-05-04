import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { test, expect } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "../dist");

test.describe("SSG (Solid)", () => {
  test("static HTML contains pre-rendered home page", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/");

    await expect(page.locator("nav")).toContainText("Home");
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

    await expect(page.locator("main")).toContainText("User Profile");
    await expect(page.locator("main")).toContainText("Alice");

    await context.close();
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
      (globalThis as unknown as Window & { __NAV_MARKER__?: boolean })
        .__NAV_MARKER__ = true;
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

  test("loader output is baked into static HTML and __SSR_STATE__", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    const response = await page.goto("/users");
    const html = await response!.text();

    expect(html).toMatch(/Alice/);
    expect(html).toMatch(/Bob/);
    expect(html).toMatch(/Charlie/);

    const ssrStateMatch = html.match(/window\.__SSR_STATE__=({.*?})<\/script>/);

    expect(ssrStateMatch?.[1]).toBeDefined();

    const ssrState = JSON.parse(ssrStateMatch![1]) as {
      name: string;
      path: string;
      context?: { data?: { users?: { id: string; name: string }[] } };
    };

    expect(ssrState.name).toBe("users");
    expect(ssrState.path).toBe("/users");
    expect(ssrState.context?.data?.users).toEqual([
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
      { id: "3", name: "Charlie" },
    ]);

    await context.close();
  });

  test("dynamic-route loader output is baked into __SSR_STATE__ per pre-rendered URL", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    for (const id of ["1", "2", "3"]) {
      const response = await page.goto(`/users/${id}`);
      const html = await response!.text();
      const ssrStateMatch = html.match(
        /window\.__SSR_STATE__=({.*?})<\/script>/,
      );

      expect(ssrStateMatch?.[1]).toBeDefined();

      const ssrState = JSON.parse(ssrStateMatch![1]) as {
        params: { id: string };
        context?: { data?: { user?: { id: string; name: string } } };
      };

      expect(ssrState.params.id).toBe(id);
      expect(ssrState.context?.data?.user?.id).toBe(id);
      expect(ssrState.context?.data?.user?.name).toBeDefined();
    }

    await context.close();
  });

  test("build determinism: every pre-rendered HTML embeds canonical __SSR_STATE__ shape", async ({
    request,
  }) => {
    const paths = ["/", "/users", "/users/1", "/users/2", "/users/3"];

    for (const path of paths) {
      const response = await request.get(path);

      expect(response.status(), `GET ${path}`).toBe(200);

      const html = await response.text();

      expect(html, `${path} __SSR_STATE__ presence`).toContain(
        "window.__SSR_STATE__",
      );
      expect(html, `${path} no transition`).not.toContain('"transition"');
    }
  });

  test("per-page meta tags: home, users list, dynamic profile carry distinct title + description", async ({
    request,
  }) => {
    const cases = [
      {
        path: "/",
        title: "Home — Real-Router Solid SSG",
        description: "Welcome page of the Real-Router Solid SSG demo.",
      },
      {
        path: "/users/",
        title: "All Users — Real-Router Solid SSG",
        description: "Browse the full list of pre-rendered users.",
      },
      {
        path: "/users/1/",
        title: "Alice — Real-Router Solid SSG",
        description: "Profile page for Alice (id: 1).",
      },
      {
        path: "/users/3/",
        title: "Charlie — Real-Router Solid SSG",
        description: "Profile page for Charlie (id: 3).",
      },
    ];

    for (const { path, title, description } of cases) {
      const response = await request.get(path);

      expect(response.status(), path).toBe(200);

      const html = await response.text();

      expect(html, `${path} title`).toContain(`<title>${title}</title>`);
      expect(html, `${path} description`).toContain(
        `content="${description}"`,
      );
    }
  });

  test("404.html: pre-rendered fallback has not-found meta and no __SSR_STATE__", async ({
    request,
  }) => {
    const response = await request.get("/404.html");

    expect(response.status()).toBe(200);

    const html = await response.text();

    expect(html).toContain(
      "<title>Page Not Found — Real-Router Solid SSG</title>",
    );
    expect(html).toContain(
      'content="The page you are looking for does not exist."',
    );
    expect(html).not.toContain("window.__SSR_STATE__");
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

  test("static output isolation: each pre-rendered URL ships its own resolved __SSR_STATE__ snapshot", async ({
    request,
  }) => {
    const targets = [
      { path: "/users/1", expectedId: "1", expectedName: "Alice" },
      { path: "/users/2", expectedId: "2", expectedName: "Bob" },
      { path: "/users/3", expectedId: "3", expectedName: "Charlie" },
    ];

    const responses = await Promise.all(
      targets.map(({ path }) => request.get(`${path}/`)),
    );

    await Promise.all(
      responses.map(async (response, i) => {
        const { expectedId, expectedName, path } = targets[i];

        expect(response.status(), path).toBe(200);

        const html = await response.text();
        const ssrStateMatch = html.match(
          /window\.__SSR_STATE__=({.*?})<\/script>/,
        );

        expect(ssrStateMatch?.[1], `${path} __SSR_STATE__ found`).toBeDefined();

        const ssrState = JSON.parse(ssrStateMatch![1]) as {
          params: { id: string };
          context?: { data?: { user?: { id: string; name: string } } };
        };

        expect(ssrState.params.id, `${path} param id`).toBe(expectedId);
        expect(ssrState.context?.data?.user?.id, `${path} loader id`).toBe(
          expectedId,
        );
        expect(ssrState.context?.data?.user?.name, `${path} loader name`).toBe(
          expectedName,
        );
      }),
    );
  });

  test("ssgServe middleware 301-redirects extensionless paths to trailing-slash form", async ({
    request,
  }) => {
    // vite.config.ts ships a configurePreviewServer plugin that
    // 301-redirects requests like /users/1 → /users/1/ so vite preview can
    // serve dist/users/1/index.html. Without it, /users/1 hits the SPA
    // fallback (or 404) on static hosts that don't auto-resolve directories.
    const cases = [
      { from: "/users/1", to: "/users/1/" },
      { from: "/users/2", to: "/users/2/" },
      { from: "/users", to: "/users/" },
    ];

    for (const { from, to } of cases) {
      const response = await request.get(from, { maxRedirects: 0 });

      expect(response.status(), `GET ${from}`).toBe(301);
      expect(response.headers().location, `Location for ${from}`).toBe(to);
    }

    // Files with extensions are NOT redirected (e.g. /sitemap.xml, /404.html).
    const xml = await request.get("/sitemap.xml", { maxRedirects: 0 });

    expect(xml.status()).toBe(200);
  });

  test("CSR navigation to dynamic route: state.context.data is undefined post-navigate (SSR-only plugin contract)", async ({
    page,
  }) => {
    // /users initial visit: hydrateRouter calls start("/users") → loader
    // runs → state.context.data is populated. Alice/Bob/Charlie render.
    await page.goto("/users/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).toContainText("Alice");

    await page.evaluate(() => {
      (
        globalThis as unknown as Window & { __NAV_MARKER__?: boolean }
      ).__NAV_MARKER__ = true;
    });

    // Click "Alice" — Link triggers router.navigate() (CSR via browser-plugin).
    // ssr-data-plugin intercepts start(), NOT navigate(), so the
    // users.profile loader DOES NOT run. UserProfile reads
    // routeState().route.context.data, finds undefined, renders "User not found".
    await page.click("text=Alice");
    await expect(page).toHaveURL(/\/users\/1\/?$/);
    await expect(page.locator("main")).toContainText("User not found");

    const marker = await page.evaluate(
      () =>
        (globalThis as unknown as Window & { __NAV_MARKER__?: boolean })
          .__NAV_MARKER__,
    );

    expect(marker).toBe(true);
  });

  test("pre-rendered HTML references client bundle via absolute path", async ({
    request,
  }) => {
    const paths = ["/", "/users/", "/users/1/", "/users/2/", "/users/3/"];

    for (const path of paths) {
      const response = await request.get(path);
      const html = await response.text();

      expect(html, `${path} script tag absolute`).toMatch(
        /<script [^>]*src="\/assets\//,
      );
      expect(html, `${path} no relative ./assets`).not.toMatch(
        /<script [^>]*src="\.\/assets\//,
      );
      expect(html, `${path} no parent ../assets`).not.toMatch(
        /<script [^>]*src="\.\.\/assets\//,
      );
    }
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

  test("Solid hydration script (_$HY) injected into every pre-rendered HTML", async ({
    request,
  }) => {
    // generateHydrationScript() must be embedded in each pre-rendered file
    // so client `hydrate()` finds the SSR snapshot and avoids a full
    // re-render. Without it, the dual-mode mount picks `hydrate` (root has
    // children) and Solid emits hydration mismatch warnings.
    const paths = ["/", "/users/", "/users/1/"];

    for (const path of paths) {
      const response = await request.get(path);
      const html = await response.text();

      expect(html, `${path} _$HY presence`).toContain("_$HY");
    }
  });

  test("filesystem layout: dist contains exactly one index.html per pre-rendered route + nested posts pages", async () => {
    // Sanity-check the on-disk shape that a CDN would deploy. Build is
    // expected to produce: index.html (home), users/index.html (list),
    // users/{1,2,3}/index.html (profiles), users/{1,2,3}/posts/index.html
    // (nested posts pages), 404.html, sitemap.xml. Any extra index.html
    // under users/ would mean a bug in entries.ts or in getStaticPaths —
    // overfetch would inflate CDN object count and ship stale pages.
    expect(existsSync(DIST)).toBe(true);

    expect(existsSync(resolve(DIST, "index.html"))).toBe(true);
    expect(existsSync(resolve(DIST, "404.html"))).toBe(true);
    expect(existsSync(resolve(DIST, "sitemap.xml"))).toBe(true);

    expect(existsSync(resolve(DIST, "users/index.html"))).toBe(true);

    for (const id of ["1", "2", "3"]) {
      expect(
        existsSync(resolve(DIST, `users/${id}/index.html`)),
        `users/${id}/index.html`,
      ).toBe(true);
      expect(
        existsSync(resolve(DIST, `users/${id}/posts/index.html`)),
        `users/${id}/posts/index.html`,
      ).toBe(true);
    }
  });

  test("overfetch protection: only ids declared in entries.ts are pre-rendered", async () => {
    // entries.ts → 3 ids. SSG must produce exactly 3 user subdirectories,
    // not more. If getStaticPaths or entries grew silently, /users/4 would
    // appear here and inflate sitemap.xml + dist size.
    const usersDir = resolve(DIST, "users");
    const subdirs = readdirSync(usersDir).filter((name) =>
      statSync(resolve(usersDir, name)).isDirectory(),
    );

    expect(subdirs.toSorted()).toEqual(["1", "2", "3"]);
    expect(existsSync(resolve(usersDir, "4"))).toBe(false);
    expect(existsSync(resolve(usersDir, "999"))).toBe(false);
  });

  test("nested route pre-rendering: /users/:id/posts gets its own static HTML with loader data", async ({
    request,
  }) => {
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
    const response = await request.get("/users/3/posts/");
    const html = await response.text();

    expect(html).toContain('data-testid="user-posts-empty"');
  });

  test("canonical + OpenGraph meta: each pre-rendered route ships SEO-ready tags", async ({
    request,
  }) => {
    // SSG output must include rel=canonical + og:type / og:title / og:url /
    // og:image (link previews on social platforms) + twitter:card.
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
    const aliceHtml = readFileSync(
      resolve(DIST, "users/1/index.html"),
      "utf8",
    );
    const charlieHtml = readFileSync(
      resolve(DIST, "users/3/index.html"),
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
    const xml = readFileSync(resolve(DIST, "sitemap.xml"), "utf8");
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
});

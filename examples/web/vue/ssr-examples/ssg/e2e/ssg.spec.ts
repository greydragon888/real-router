import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { test, expect } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_ROOT = path.resolve(__dirname, "../dist");

test.describe("SSG (Vue)", () => {
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
      (globalThis as unknown as Window & { __NAV_MARKER__?: boolean }).__NAV_MARKER__ =
        true;
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
        title: "Home — Real-Router SSG",
        description: "Welcome page of the Real-Router SSG demo.",
      },
      {
        path: "/users/",
        title: "All Users — Real-Router SSG",
        description: "Browse the full list of pre-rendered users.",
      },
      {
        path: "/users/1/",
        title: "Alice — Real-Router SSG",
        description: "Profile page for Alice (id: 1).",
      },
      {
        path: "/users/3/",
        title: "Charlie — Real-Router SSG",
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

    expect(html).toContain("<title>Page Not Found — Real-Router SSG</title>");
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
    // vite.config.ts ships a custom configurePreviewServer plugin that
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
    // /users initial visit: hydrateRouter calls start("/users") → loader runs
    // → state.context.data is populated. Alice/Bob/Charlie render normally.
    await page.goto("/users/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).toContainText("Alice");

    // Inject marker before CSR navigation to prove no full reload happens.
    await page.evaluate(() => {
      (
        globalThis as unknown as Window & { __NAV_MARKER__?: boolean }
      ).__NAV_MARKER__ = true;
    });

    // Click "Alice" — Link triggers router.navigate() (CSR, browser-plugin).
    // ssr-data-plugin intercepts start(), NOT navigate(), so the
    // users.profile loader DOES NOT run. UserProfile reads
    // route.value.context.data, finds undefined, renders "User not found".
    await page.click("text=Alice");
    await expect(page).toHaveURL(/\/users\/1\/?$/);
    await expect(page.locator("main")).toContainText("User not found");

    // Marker survived → no reload happened, this was a CSR transition.
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
    // Nested URLs (/users/1/) must reference the bundle by absolute path
    // (/assets/...). A relative-path script tag would resolve against the
    // current directory and break hydration on every nested page.
    const paths = ["/", "/users/", "/users/1/", "/users/2/", "/users/3/"];

    for (const path of paths) {
      const response = await request.get(path);
      const html = await response.text();

      expect(html, `${path} script tag absolute`).toMatch(
        /<script [^>]*src="\/assets\//,
      );
      // No accidental relative paths.
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
    // The pre-rendered file dist/users/1/index.html contains the resolved
    // profile UI. After the document commits, "Alice" should be in the DOM
    // before any client JS executes — and stay there after hydration runs.
    await page.goto("/users/1/", { waitUntil: "commit" });

    await expect(page.locator("main")).toContainText("Alice");
    await expect(page.locator("main")).toContainText("ID: 1");
    await expect(page.locator("main")).toContainText("Name: Alice");

    await page.waitForLoadState("networkidle");

    // Still visible after hydration — no flicker, no replacement with
    // "User not found" (which would happen if hydrateRouter mismatched).
    await expect(page.locator("main")).toContainText("Alice");
    await expect(page.locator("main")).toContainText("ID: 1");
    await expect(page.locator("main")).toContainText("Name: Alice");
  });

  test("Nested SSG: /users/:id/posts gets its own pre-rendered HTML with loader data", async ({
    request,
  }) => {
    // entries.ts emits one URL per id for both `users.profile` and
    // `users.profile.posts`. The build script writes
    // dist/users/<id>/posts/index.html for each. Alice has 2 posts;
    // they must appear in the static HTML before any JS runs.
    const response = await request.get("/users/1/posts/");
    const html = await response.text();

    expect(response.status()).toBe(200);
    expect(html).toContain('data-testid="user-posts"');
    expect(html).toContain("Hello world");
    expect(html).toContain("On routing");
  });

  test("Nested SSG empty state: /users/3/posts ships empty-posts UI (Charlie has no posts)", async ({
    request,
  }) => {
    // database/loaders.ts: Charlie (id "3") authored zero posts. The
    // posts loader resolves with `posts: []`; UserPosts.vue's
    // empty-state branch renders. Verifies the build doesn't skip
    // empty arrays — the static page exists with the right UI.
    const response = await request.get("/users/3/posts/");
    const html = await response.text();

    expect(response.status()).toBe(200);
    expect(html).toContain('data-testid="user-posts-empty"');
    expect(html).toContain("No posts yet.");
    expect(html).not.toContain("Hello world");
  });

  test("canonical + OpenGraph: each pre-rendered route ships SEO-ready tags", async ({
    request,
  }) => {
    // Each profile gets a per-id canonical URL (NOT the parent
    // /users URL) and matching og:url. Without per-page canonicals,
    // search engines collapse all profile pages to one, and OG
    // previews for shared URLs fall back to the home page.
    const response = await request.get("/users/2/");
    const html = await response.text();

    expect(html).toMatch(
      /<link rel="canonical" href="https:\/\/example\.com\/users\/2"\s*\/?>/,
    );
    expect(html).toMatch(
      /<meta property="og:url" content="https:\/\/example\.com\/users\/2"\s*\/?>/,
    );
    expect(html).toMatch(/<meta property="og:title" content="Bob"\s*\/?>/);
    expect(html).toMatch(
      /<meta property="og:description" content="Profile page for Bob\."\s*\/?>/,
    );
  });

  test("canonical for profile is per-id (not the parent /users URL)", async ({
    request,
  }) => {
    // Sanity check: both profile pages produce DISTINCT canonicals.
    // If meta.ts incorrectly returned the parent /users URL for
    // children, both responses would have the same canonical.
    const aliceResponse = await request.get("/users/1/");
    const aliceCanonical = /<link rel="canonical" href="([^"]+)"/.exec(
      await aliceResponse.text(),
    )?.[1];

    const bobResponse = await request.get("/users/2/");
    const bobCanonical = /<link rel="canonical" href="([^"]+)"/.exec(
      await bobResponse.text(),
    )?.[1];

    expect(aliceCanonical).toBe("https://example.com/users/1");
    expect(bobCanonical).toBe("https://example.com/users/2");
    expect(aliceCanonical).not.toBe(bobCanonical);
  });

  test("filesystem layout: dist contains exactly one index.html per pre-rendered route + nested posts pages", async () => {
    // Walks dist/ on disk and verifies the EXACT set of pre-rendered
    // HTML files. Catches accidental regressions like
    // (a) entries.ts ids no longer in the database (extra dirs),
    // (b) a route added without an entry (missing dirs),
    // (c) the build script writing files outside the expected layout.
    const expected = new Set([
      "index.html",
      "users/index.html",
      "users/1/index.html",
      "users/2/index.html",
      "users/3/index.html",
      "users/1/posts/index.html",
      "users/2/posts/index.html",
      "users/3/posts/index.html",
      "404.html",
    ]);

    function walk(dir: string, prefix: string): string[] {
      const out: string[] = [];

      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        const rel = prefix ? `${prefix}/${entry}` : entry;

        if (statSync(full).isDirectory()) {
          if (entry === "assets") continue;
          out.push(...walk(full, rel));
        } else if (entry.endsWith(".html")) {
          out.push(rel);
        }
      }

      return out;
    }

    const actual = new Set(walk(DIST_ROOT, ""));

    expect(actual).toEqual(expected);
  });

  test("overfetch protection: only ids declared in entries.ts are pre-rendered", async () => {
    // database.ts holds users with ids "1", "2", "3". entries.ts
    // emits all of them. If we'd hardcoded e.g. "999" in entries.ts
    // it would have been rejected at build by the LoaderNotFound
    // throw (already covered by the build-failure test). Here we
    // verify the inverse: dist/users/ contains exactly the directories
    // for ids in the database, no extras.
    const dirs = readdirSync(path.resolve(DIST_ROOT, "users"))
      .filter((entry) =>
        statSync(path.resolve(DIST_ROOT, "users", entry)).isDirectory(),
      )
      .sort();

    expect(dirs).toEqual(["1", "2", "3"]);
  });

  test("sitemap.xml matches the on-disk pre-rendered set (no extras, no missing)", async ({
    request,
  }) => {
    // sitemap.xml is the SEO contract surface — search engines fetch
    // every URL in it. Drift between sitemap and on-disk files is
    // worse than failing the build: it ships a broken contract. The
    // test parses sitemap.xml and asserts every URL has a matching
    // pre-rendered file.
    const response = await request.get("/sitemap.xml");
    const xml = await response.text();
    const urls = [...xml.matchAll(/<loc>https:\/\/example\.com(\/[^<]*)<\/loc>/g)]
      .map((m) => m[1] as string);

    for (const url of urls) {
      const filePath =
        url === "/"
          ? path.resolve(DIST_ROOT, "index.html")
          : path.resolve(DIST_ROOT, url.slice(1), "index.html");

      expect(
        existsSync(filePath),
        `sitemap claims ${url} exists, but ${filePath} is missing`,
      ).toBe(true);
    }

    // Verify the count matches: 1 home + 1 users + 3 profiles + 3 posts.
    expect(urls).toHaveLength(8);
  });

  test("Loader-driven build: render() throws LoaderNotFound for an id absent from the database (catches stale entries.ts entries at build time)", async () => {
    // Import the compiled entry-server module that ssg-build.ts uses.
    // Calling render('/users/9999') must reject with the typed
    // LoaderNotFound error — proving that if entries.ts listed an
    // id no longer in the database, the build script's try/catch
    // would surface it as a failure (vs. silently emitting an empty
    // "user not found" page).
    // The compiled bundle doesn't ship type declarations; we build
    // the spec for the public surface ourselves. ts-expect-error
    // because vue-tsc -b can't resolve the .js file's types.
    // @ts-expect-error — compiled artifact, no .d.ts
    const module_ = (await import("../dist/server/entry-server.js")) as {
      render: (url: string) => Promise<{
        html: string;
        ssrJson: string;
        statusCode: number;
        meta: { title: string; description: string };
      }>;
    };
    const { render } = module_;

    let caught: { code?: string; resource?: string } | undefined;

    try {
      await render("/users/9999");
    } catch (error) {
      caught = error as { code?: string; resource?: string };
    }

    expect(caught).toBeDefined();
    expect(caught?.code).toBe("LOADER_NOT_FOUND");
    expect(caught?.resource).toBe("user:9999");
  });

  test("Cache-Control: per-route policy from vite.config.ts ssgServe middleware (long for home, shorter for users list / profile)", async ({
    request,
  }) => {
    // The ssgServe Vite plugin attaches getCachePolicy() to every
    // preview response. Static files therefore carry per-route
    // Cache-Control directives matching the runtime SSR example:
    //   /          → public, max-age=300, s-maxage=3600
    //   /users/    → public, max-age=60
    //   /users/:id/ → public, max-age=120
    const home = await request.get("/");

    expect(home.headers()["cache-control"]).toContain("public");
    expect(home.headers()["cache-control"]).toContain("s-maxage=3600");

    const users = await request.get("/users/");

    expect(users.headers()["cache-control"]).toContain("public");
    expect(users.headers()["cache-control"]).toContain("max-age=60");

    const profile = await request.get("/users/1/");

    expect(profile.headers()["cache-control"]).toContain("public");
    expect(profile.headers()["cache-control"]).toContain("max-age=120");
  });

  test("ETag: static-file layer emits weak ETag (auto from mtime), conditional GET returns 304", async ({
    request,
  }) => {
    // Vite preview's static handler attaches a weak ETag derived from
    // file mtime. Pre-rendered SSG files are written once at build
    // time, so two consecutive GETs hit the same mtime → same ETag →
    // 304 on If-None-Match. We do NOT compute a content-derived
    // strong ETag here (that's the job of the runtime SSR server) —
    // the SSG layer only verifies the static handler's freshness
    // contract.
    const first = await request.get("/users/");

    expect(first.status()).toBe(200);

    const etag = first.headers().etag;

    // Vite's static handler emits a weak ETag like W/"<size>-<mtime>".
    expect(etag).toMatch(/^W?\/?".+"$/);

    const conditional = await request.get("/users/", {
      headers: { "If-None-Match": etag },
    });

    expect(conditional.status()).toBe(304);
    expect((await conditional.body()).length).toBe(0);
  });
});

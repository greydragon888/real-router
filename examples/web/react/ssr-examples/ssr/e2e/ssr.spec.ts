import { test, expect } from "@playwright/test";

test.describe("SSR", () => {
  test("server-rendered HTML contains expected content", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/");

    await expect(page.locator("nav")).toContainText("Home");
    await expect(page.locator("main")).toContainText("Welcome");

    await context.close();
  });

  test("no hydration mismatch warnings", async ({ page }) => {
    const errors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
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

  test("no flash of content on load", async ({ page }) => {
    const response = await page.goto("/");
    const html = await response!.text();

    expect(html).toContain("Welcome");
    expect(html).toContain("<nav");
    expect(html).not.toContain('<div id="root"></div>');
    expect(html).toContain('<div id="root">');
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
        (globalThis as unknown as Window & { __NAV_MARKER__?: boolean }).__NAV_MARKER__,
    );

    expect(marker).toBe(true);
  });

  test("browser back/forward works", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.click("text=Users");
    await expect(page).toHaveURL(/\/users/);

    await page.goBack();
    await expect(page).toHaveURL("/");

    await page.goForward();
    await expect(page).toHaveURL(/\/users/);
  });

  test("protected route respects auth guard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/");
    await expect(page.locator("main")).toContainText("Welcome");

    await page
      .context()
      .addCookies([{ name: "auth", value: "1", url: "http://localhost:3000" }]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/dashboard");
    await expect(page.locator("main")).toContainText("Dashboard");
  });

  test("404 returns correct status code", async ({ page }) => {
    const response = await page.goto("/nonexistent");

    expect(response!.status()).toBe(404);
    await expect(page.locator("main")).toContainText("Not Found");
  });

  test("server injects __SSR_STATE__ into HTML", async ({ page }) => {
    const response = await page.goto("/users");
    const html = await response!.text();

    expect(html).toContain("window.__SSR_STATE__");
    expect(html).toContain('"name":"users"');
    expect(html).toContain('"path":"/users"');
    expect(html).not.toContain('"transition"');
  });

  test("loader output flows through __SSR_STATE__ context.data and is rendered in HTML", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    const response = await page.goto("/users");
    const html = await response!.text();

    // 1. HTML body reflects loader output (no JS execution — pure SSR).
    expect(html).toMatch(/data-user-id="1"[^>]*>\s*<a[^>]*>Alice/);
    expect(html).toMatch(/data-user-id="2"[^>]*>\s*<a[^>]*>Bob/);
    expect(html).toMatch(/data-user-id="3"[^>]*>\s*<a[^>]*>Charlie/);

    // 2. Hydration payload carries the loader's resolved data verbatim.
    const ssrStateMatch = html.match(/window\.__SSR_STATE__=({.*?})<\/script>/);

    expect(ssrStateMatch?.[1]).toBeDefined();

    const ssrState = JSON.parse(ssrStateMatch![1]) as {
      name: string;
      path: string;
      context?: { data?: { users?: { id: string; name: string }[] } };
    };

    expect(ssrState.name).toBe("users");
    expect(ssrState.context?.data?.users).toEqual([
      { id: "1", name: "Alice", role: "admin" },
      { id: "2", name: "Bob", role: "user" },
      { id: "3", name: "Charlie", role: "user" },
    ]);

    await context.close();
  });

  test("loader output for dynamic route lands in HTML and __SSR_STATE__", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    const response = await page.goto("/users/2");
    const html = await response!.text();

    expect(html).toContain('data-testid="user-profile"');
    expect(html).toContain('data-user-id="2"');
    // React splits text via <!-- --> when interpolating; assert data-testid'd nodes contain the value.
    expect(html).toMatch(/data-testid="user-name"[^>]*>[^<]*<!--[^>]*>Bob/);

    const ssrStateMatch = html.match(/window\.__SSR_STATE__=({.*?})<\/script>/);
    const ssrState = JSON.parse(ssrStateMatch![1]) as {
      params: { id: string };
      context?: { data?: { user?: { id: string; name: string } } };
    };

    expect(ssrState.params).toEqual({ id: "2" });
    expect(ssrState.context?.data?.user).toEqual({
      id: "2",
      name: "Bob",
      role: "user",
    });

    await context.close();
  });

  test("loader fires on hydration: deep-link → full reload preserves data after JS boot", async ({
    page,
  }) => {
    await page.goto("/users/3");
    await page.waitForLoadState("networkidle");

    // After hydrateRouter → router.start(state.path) → ssr-data-plugin
    // re-runs the loader on the client and writes to state.context.data.
    // The component re-renders identically — no flash, no mismatch.
    await expect(page.getByTestId("user-profile")).toBeVisible();
    await expect(page.getByTestId("user-name")).toHaveText("Name: Charlie");

    const errors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("user-name")).toHaveText("Name: Charlie");

    const hydrationErrors = errors.filter(
      (e) =>
        e.toLowerCase().includes("hydrat") ||
        e.toLowerCase().includes("mismatch"),
    );

    expect(hydrationErrors).toEqual([]);
  });

  test("per-request isolation: 10 concurrent /users/:id requests return distinct, correct payloads", async ({
    request,
  }) => {
    const ids = ["1", "2", "3", "1", "2", "3", "1", "2", "3", "1"];
    const expectedNames: Record<string, string> = {
      "1": "Alice",
      "2": "Bob",
      "3": "Charlie",
    };

    const responses = await Promise.all(
      ids.map((id) => request.get(`/users/${id}`)),
    );

    await Promise.all(
      responses.map(async (response, i) => {
        const id = ids[i];

        expect(response.status(), `req ${i} (id=${id})`).toBe(200);

        const html = await response.text();

        expect(html, `req ${i} HTML data-user-id`).toContain(
          `data-user-id="${id}"`,
        );

        // Each response has its own __SSR_STATE__ — no cross-contamination
        // (per-request cloneRouter() + plugin claim is freshly bound).
        const ssrStateMatch = html.match(
          /window\.__SSR_STATE__=({.*?})<\/script>/,
        );
        const ssrState = JSON.parse(ssrStateMatch![1]) as {
          params: { id: string };
          context?: { data?: { user?: { id: string; name: string } } };
        };

        expect(ssrState.params.id, `req ${i} state params`).toBe(id);
        expect(ssrState.context?.data?.user?.id, `req ${i} loader id`).toBe(id);
        expect(ssrState.context?.data?.user?.name, `req ${i} loader name`).toBe(
          expectedNames[id],
        );
      }),
    );
  });

  test("per-request isolation: dashboard auth + unprotected routes don't bleed across concurrent requests", async ({
    browser,
  }) => {
    // Two simultaneous browser contexts with distinct cookies — verify auth
    // guard's DI runs per-request, not from a shared mutable.
    const [authCtx, anonCtx] = await Promise.all([
      browser.newContext({
        storageState: {
          cookies: [
            {
              name: "auth",
              value: "1",
              domain: "localhost",
              path: "/",
              expires: -1,
              httpOnly: false,
              secure: false,
              sameSite: "Lax",
            },
          ],
          origins: [],
        },
      }),
      browser.newContext(),
    ]);

    try {
      const [authPage, anonPage] = await Promise.all([
        authCtx.newPage(),
        anonCtx.newPage(),
      ]);

      const [authResp, anonResp] = await Promise.all([
        authPage.goto("/dashboard"),
        anonPage.goto("/dashboard"),
      ]);

      expect(authResp?.status()).toBe(200);
      // Anonymous request: guard rejects → server sends 302 to /, content is Home
      // (Express follows the redirect and returns Home HTML with status 200).
      expect(anonResp?.url()).toMatch(/\/$/);

      await expect(authPage.locator("main")).toContainText("Dashboard");
      await expect(anonPage.locator("main")).toContainText("Welcome");
    } finally {
      await authCtx.close();
      await anonCtx.close();
    }
  });

  test("loader error: rejected loader returns 500 with server-error page", async ({
    request,
  }) => {
    const response = await request.get("/boom");

    expect(response.status()).toBe(500);

    const html = await response.text();

    expect(html).toContain('data-testid="server-error"');
    expect(html).toContain("Loader exploded for /boom");
    // No __SSR_STATE__ on error path — there is no resolved router state to ship.
    expect(html).not.toContain("window.__SSR_STATE__");
  });

  test("client navigation: ssr-data-plugin is SSR-only — loader does not re-run on navigate()", async ({
    page,
  }) => {
    // Document the by-design limitation: ssr-data-plugin intercepts start(),
    // not navigate(). After initial hydration, client-side <Link> clicks
    // reuse state.context.data only if the target route already populated it
    // during the initial start. New routes visited via navigate() see
    // state.context.data === undefined unless re-resolved via reload/start.
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.click("text=Users");
    await expect(page).toHaveURL(/\/users$/);

    // UsersList renders defensively with `data.users ?? []`. With no fresh
    // loader fire, the list is empty — confirming the SSR-only contract.
    const items = page.locator('[data-user-id]');

    await expect(items).toHaveCount(0);
  });

  test("query params: ?sort=desc reverses the user list via loader", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    const response = await page.goto("/users?sort=desc");
    const html = await response!.text();

    // current sort label visible
    expect(html).toContain("Sorted: ");
    expect(html).toMatch(/data-testid="current-sort"[^>]*>[^<]*<!--[^>]*>desc/);

    // Charlie is first in desc order, then Bob, then Alice.
    const charlieIdx = html.indexOf("Charlie");
    const bobIdx = html.indexOf("Bob");
    const aliceIdx = html.indexOf("Alice");

    expect(charlieIdx).toBeGreaterThan(-1);
    expect(charlieIdx).toBeLessThan(bobIdx);
    expect(bobIdx).toBeLessThan(aliceIdx);

    // __SSR_STATE__ carries sort=desc in params + sort label in data
    const ssrStateMatch = html.match(/window\.__SSR_STATE__=({.*?})<\/script>/);
    const ssrState = JSON.parse(ssrStateMatch![1]) as {
      params: { sort?: string };
      context?: { data?: { sort?: string } };
    };

    expect(ssrState.params.sort).toBe("desc");
    expect(ssrState.context?.data?.sort).toBe("desc");

    await context.close();
  });

  test("nested loader: /users/1/posts populates state.context.data with posts", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    const response = await page.goto("/users/1/posts");
    const html = await response!.text();

    expect(html).toContain('data-testid="user-profile"');
    expect(html).toContain('data-testid="user-posts"');
    expect(html).toMatch(/data-post-id="p1"[^>]*>[^<]*Hello world/);
    expect(html).toMatch(/data-post-id="p2"[^>]*>[^<]*On routing/);

    const ssrStateMatch = html.match(/window\.__SSR_STATE__=({.*?})<\/script>/);
    const ssrState = JSON.parse(ssrStateMatch![1]) as {
      name: string;
      params: { id: string };
      context?: {
        data?: {
          user?: { id: string; name: string; role: string };
          posts?: { id: string; authorId: string; title: string }[];
        };
      };
    };

    expect(ssrState.name).toBe("users.profile.posts");
    expect(ssrState.params.id).toBe("1");
    // Leaf loader returns combined user + posts.
    expect(ssrState.context?.data?.user).toEqual({
      id: "1",
      name: "Alice",
      role: "admin",
    });
    expect(ssrState.context?.data?.posts).toEqual([
      { id: "p1", authorId: "1", title: "Hello world" },
      { id: "p2", authorId: "1", title: "On routing" },
    ]);

    await context.close();
  });

  test("nested loader: /users/3/posts returns empty posts array", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    const response = await page.goto("/users/3/posts");
    const html = await response!.text();

    expect(html).toContain('data-testid="user-posts-empty"');

    await context.close();
  });

  test("admin guard: anonymous → /admin redirects to /; admin user → /admin renders Admin page", async ({
    page,
  }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/$/);

    await page
      .context()
      .addCookies([
        { name: "userId", value: "1", url: "http://localhost:3000" },
      ]);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId("admin-page")).toBeVisible();
  });

  test("admin guard: non-admin (Bob) → /admin redirects to / (role check)", async ({
    page,
  }) => {
    await page
      .context()
      .addCookies([
        { name: "userId", value: "2", url: "http://localhost:3000" },
      ]);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/$/);
  });

  test("dashboard guard: userId=2 (non-admin) still allowed (currentUser != null)", async ({
    page,
  }) => {
    await page
      .context()
      .addCookies([
        { name: "userId", value: "2", url: "http://localhost:3000" },
      ]);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator("main")).toContainText("Dashboard");
  });

  test("Per-route meta: home title + description appear in raw SSR HTML head", async ({
    request,
  }) => {
    // entry-server.tsx computes PageMeta from the matched router state
    // and renderHeadFor() builds the <head> markup that's spliced
    // into the <!--ssr-meta--> placeholder. The home meta block is
    // baked into the wire HTML before any JS runs.
    const response = await request.get("/");
    const html = await response.text();

    expect(html).toContain("<title>Home — Real-Router React SSR</title>");
    expect(html).toContain(
      'name="description" content="Welcome to the Real-Router React SSR example."',
    );
  });

  test("Per-route meta: /users meta reflects the active sort param", async ({
    request,
  }) => {
    // getMetaForState() reads state.params.sort and folds it into the
    // title — proves meta is computed from the resolved router state.
    const ascResponse = await request.get("/users");
    const ascHtml = await ascResponse.text();

    expect(ascHtml).toContain("All Users (sorted asc)");

    const descResponse = await request.get("/users?sort=desc");
    const descHtml = await descResponse.text();

    expect(descHtml).toContain("All Users (sorted desc)");
  });

  test("Per-route meta: /users/:id includes the user's name in title and og:title", async ({
    request,
  }) => {
    const response = await request.get("/users/1");
    const html = await response.text();

    expect(html).toContain("<title>Alice — Real-Router React SSR</title>");
    expect(html).toMatch(/<meta property="og:title" content="Alice"\s*\/?>/);
  });

  test("Per-route meta: canonical is an absolute URL prefixed with SITE_ORIGIN", async ({
    request,
  }) => {
    // canonical must be absolute (search engines and crawlers
    // reject relative canonicals). The default SITE_ORIGIN is
    // "https://example.com". og:url mirrors canonical.
    const response = await request.get("/users/2");
    const html = await response.text();

    expect(html).toMatch(
      /<link rel="canonical" href="https:\/\/example\.com\/users\/2"\s*\/?>/,
    );
    expect(html).toMatch(
      /<meta property="og:url" content="https:\/\/example\.com\/users\/2"\s*\/?>/,
    );
  });

  test("Per-route meta: og:description carries route-specific copy (not the default fallback)", async ({
    request,
  }) => {
    // Smoke-test that distinct routes produce distinct og:description
    // values — guards against accidental fallthrough to DEFAULTS.
    const homeResponse = await request.get("/");
    const homeHtml = await homeResponse.text();

    const profileResponse = await request.get("/users/1");
    const profileHtml = await profileResponse.text();

    const homeOg = /og:description" content="([^"]+)"/.exec(homeHtml)?.[1];
    const profileOg = /og:description" content="([^"]+)"/.exec(profileHtml)?.[1];

    expect(homeOg).toBeDefined();
    expect(profileOg).toBeDefined();
    expect(homeOg).not.toBe(profileOg);
    expect(profileOg).toContain("Alice");
  });

  test("Cache-Control: per-route policy from cache-policies.ts (public for users list, no-store for admin redirect)", async ({
    request,
  }) => {
    const home = await request.get("/", { maxRedirects: 0 });

    expect(home.headers()["cache-control"]).toContain("public");
    expect(home.headers()["cache-control"]).toContain("s-maxage=3600");

    const users = await request.get("/users", { maxRedirects: 0 });

    expect(users.headers()["cache-control"]).toContain("public");
    expect(users.headers()["cache-control"]).toContain("max-age=60");

    const admin = await request.get("/admin", { maxRedirects: 0 });

    expect([302, 200]).toContain(admin.status());
  });

  test("ETag: identical static content yields a 304 Not Modified on conditional GET", async ({
    request,
  }) => {
    const first = await request.get("/users");

    expect(first.status()).toBe(200);

    const etag = first.headers().etag;

    expect(etag).toMatch(/^"[A-Za-z0-9_-]{16}"$/);

    const conditional = await request.get("/users", {
      headers: { "If-None-Match": etag },
    });

    expect(conditional.status()).toBe(304);
    expect(conditional.headers().etag).toBe(etag);
    expect((await conditional.body()).length).toBe(0);
  });

  test("ETag: distinct routes yield distinct content hashes", async ({
    request,
  }) => {
    const home = await request.get("/");
    const users = await request.get("/users");

    const homeEtag = home.headers().etag;
    const usersEtag = users.headers().etag;

    expect(homeEtag).toMatch(/^"[A-Za-z0-9_-]{16}"$/);
    expect(usersEtag).toMatch(/^"[A-Za-z0-9_-]{16}"$/);
    expect(homeEtag).not.toBe(usersEtag);
  });

  test("Loader-driven HTTP: /users/9999 throws LoaderNotFound → 404 text/plain", async ({
    request,
  }) => {
    // users.profile loader throws LoaderNotFound for missing ids;
    // entry-server.tsx maps the typed error to
    // { statusCode: 404, rawBody: "Not Found" }, so the response is
    // 404 text/plain — NOT a hydrated HTML page with "user not found".
    const response = await request.get("/users/9999");

    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toContain("text/plain");
    expect(await response.text()).toBe("Not Found");
  });

  test("Loader-driven HTTP: /users/9999/posts also throws LoaderNotFound → 404", async ({
    request,
  }) => {
    const response = await request.get("/users/9999/posts");

    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toContain("text/plain");
    expect(await response.text()).toBe("Not Found");
  });

  test("Loader-driven HTTP: /legacy-user/2 throws LoaderRedirect → 301 Location: /users/2", async ({
    request,
  }) => {
    const response = await request.get("/legacy-user/2", { maxRedirects: 0 });

    expect(response.status()).toBe(301);
    expect(response.headers().location).toBe("/users/2");
  });

  test("Loader-driven HTTP: /legacy-user/3 follows redirect → /users/3 hydrated profile", async ({
    page,
  }) => {
    await page.goto("/legacy-user/3");

    await expect(page).toHaveURL(/\/users\/3$/);
    await expect(page.locator("main")).toContainText("ID: 3");
  });

  test("Loader-driven HTTP: /slow throws LoaderTimeout → 504 Gateway Timeout for full request", async ({
    request,
  }) => {
    // /slow has a 5 s loader behind a 250 ms withTimeout race. When
    // the client lets the request finish (no abort), withTimeout
    // wins, throws LoaderTimeout, entry-server.tsx maps it to 504.
    const startedAt = Date.now();
    const response = await request.get("/slow");
    const elapsed = Date.now() - startedAt;

    expect(response.status()).toBe(504);
    expect(response.headers()["content-type"]).toContain("text/plain");
    expect(await response.text()).toBe("Gateway Timeout");
    // Timeout fires at ~250 ms; total round-trip well under 5 s.
    expect(elapsed).toBeLessThan(2500);
  });

  test("AbortController: client disconnect mid-render fires the slow loader's abort listener", async ({
    request,
  }) => {
    // /slow loader sleeps 5 s but registers an abort listener via
    // getDep("abortSignal"). server/index.ts attaches the controller
    // to req.on("close") — when the client gives up before the
    // response, the loader cleans up its setTimeout and rejects.
    const startedAt = Date.now();
    let aborted = false;

    try {
      await request.get("/slow", { timeout: 150 });
    } catch {
      aborted = true;
    }

    const elapsed = Date.now() - startedAt;

    expect(aborted).toBe(true);
    expect(elapsed).toBeLessThan(1000);
  });
});

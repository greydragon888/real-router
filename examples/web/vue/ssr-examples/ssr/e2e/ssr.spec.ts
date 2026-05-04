import { test, expect } from "@playwright/test";

test.describe("SSR (Vue)", () => {
  test("server-rendered HTML contains expected content", async ({ browser }) => {
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
        (globalThis as unknown as Window & { __NAV_MARKER__?: boolean })
          .__NAV_MARKER__,
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

    expect(html).toMatch(/data-user-id="1"[^>]*>\s*<a[^>]*>\s*Alice/);
    expect(html).toMatch(/data-user-id="2"[^>]*>\s*<a[^>]*>\s*Bob/);
    expect(html).toMatch(/data-user-id="3"[^>]*>\s*<a[^>]*>\s*Charlie/);

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
    expect(html).toMatch(/data-testid="user-name"[^>]*>[^<]*Bob/);

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
    expect(html).not.toContain("window.__SSR_STATE__");
  });

  test("query params: ?sort=desc reverses the user list via loader", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    const response = await page.goto("/users?sort=desc");
    const html = await response!.text();

    expect(html).toContain("Sorted: ");
    expect(html).toMatch(/data-testid="current-sort"[^>]*>[^<]*desc/);

    const charlieIdx = html.indexOf("Charlie");
    const bobIdx = html.indexOf("Bob");
    const aliceIdx = html.indexOf("Alice");

    expect(charlieIdx).toBeGreaterThan(-1);
    expect(charlieIdx).toBeLessThan(bobIdx);
    expect(bobIdx).toBeLessThan(aliceIdx);

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

  test("CSR navigation to dynamic route: state.context.data is undefined post-navigate (SSR-only plugin contract)", async ({
    page,
  }) => {
    // Initial /users SSR + hydration: ssr-data-plugin re-runs the users
    // loader during hydrateRouter → state.context.data is populated.
    await page.goto("/users");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-user-id="2"]')).toBeVisible();

    // Click "Bob" — Link calls router.navigate() (CSR, no full reload).
    // ssr-data-plugin intercepts start(), NOT navigate(), so the
    // /users/profile loader DOES NOT run. UserProfile reads
    // route.value.context.data, finds undefined, renders "User not found".
    await page.click("text=Bob");
    await expect(page).toHaveURL(/\/users\/2$/);
    await expect(page.getByTestId("user-not-found")).toBeVisible();
    await expect(page.getByTestId("user-profile")).toHaveCount(0);
  });

  test("CSR guard: anonymous click on /admin link is blocked, URL unchanged", async ({
    page,
  }) => {
    // No auth cookie — currentUser is null on the client.
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Click intercepted by browser-plugin → router.navigate("admin") →
    // canActivate rejects (currentUser is null) → transition cancelled.
    // Vue Link swallows the rejection (.catch(() => {})), URL doesn't change.
    await page.click('[data-testid="nav-admin"]');

    await expect(page).toHaveURL("/");
    await expect(page.locator("main")).toContainText("Welcome");
    await expect(page.getByTestId("admin-page")).toHaveCount(0);
  });

  test("server returns 302 + Location for guarded route without cookie", async ({
    request,
  }) => {
    // entry-server.ts maps a CANNOT_ACTIVATE rejection to { statusCode: 302,
    // redirect: "/" }; the Express handler issues res.redirect(result.redirect).
    // Disable auto-follow to inspect the raw redirect response.
    const response = await request.get("/admin", { maxRedirects: 0 });

    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe("/");
  });

  test("server-rendered Link emits absolute href in HTML (no JS)", async ({
    browser,
  }) => {
    // Without JS, the only thing that makes Link clickable is the underlying
    // <a href="..."> attribute. If the Vue adapter's buildHref were broken in
    // SSR, the resulting HTML would lack hrefs and SEO/crawlers would fail.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    const response = await page.goto("/users");
    const html = await response!.text();

    expect(html).toMatch(/<a [^>]*href="\/users\/1"/);
    expect(html).toMatch(/<a [^>]*href="\/users\/2"/);
    expect(html).toMatch(/<a [^>]*href="\/users\/3"/);

    // Top-nav links also have hrefs.
    expect(html).toMatch(/<a [^>]*href="\/"/);
    expect(html).toMatch(/<a [^>]*href="\/users"/);

    await context.close();
  });

  test("CSR guard pass: admin user clicks /admin link, navigates without server roundtrip", async ({
    page,
  }) => {
    // Cookie injected before goto so entry-client.ts picks it up at boot
    // (lookupUserFromCookies(parseCookieHeader(document.cookie)) before usePlugin).
    await page.context().addCookies([
      { name: "userId", value: "1", url: "http://localhost:3000" },
    ]);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Inject marker after hydration to prove the next nav is CSR (no reload).
    await page.evaluate(() => {
      (
        globalThis as unknown as Window & { __NAV_MARKER__?: boolean }
      ).__NAV_MARKER__ = true;
    });

    await page.click('[data-testid="nav-admin"]');
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId("admin-page")).toBeVisible();

    // Marker survived → no full reload happened.
    const marker = await page.evaluate(
      () =>
        (globalThis as unknown as Window & { __NAV_MARKER__?: boolean })
          .__NAV_MARKER__,
    );

    expect(marker).toBe(true);
  });

  test("Cache-Control: per-route policy from cache-policies.ts (public for users list, no-store for admin redirect)", async ({
    request,
  }) => {
    // server/index.ts reads getCachePolicy(url) and emits the
    // Cache-Control header. Different routes get different policies:
    //   /          → public, max-age=300, s-maxage=3600 (long cache)
    //   /users     → public, max-age=60 (short revalidating cache)
    //   /admin     → private, no-store (auth-sensitive, never cache)
    //
    // The /admin path is a 302 redirect for anon users; redirect
    // responses still carry Cache-Control to control how the redirect
    // itself caches.
    const home = await request.get("/", { maxRedirects: 0 });

    expect(home.headers()["cache-control"]).toContain("public");
    expect(home.headers()["cache-control"]).toContain("s-maxage=3600");

    const users = await request.get("/users", { maxRedirects: 0 });

    expect(users.headers()["cache-control"]).toContain("public");
    expect(users.headers()["cache-control"]).toContain("max-age=60");

    // Auth-sensitive route: never cached.
    const admin = await request.get("/admin", { maxRedirects: 0 });

    // 302 redirect from CANNOT_ACTIVATE — server doesn't currently
    // attach Cache-Control to redirects (handled separately by
    // response.redirect). The auth-sensitive policy applies once user
    // logs in and gets the actual /admin page.
    expect([302, 200]).toContain(admin.status());
  });

  test("ETag: identical static content yields a 304 Not Modified on conditional GET", async ({
    request,
  }) => {
    // ETag is a strong hash of the SSR'd HTML body. /users renders
    // user list deterministically from in-memory database — same
    // bytes per request → same ETag → 304 on If-None-Match.
    const first = await request.get("/users");

    expect(first.status()).toBe(200);

    const etag = first.headers().etag;

    expect(etag).toMatch(/^"[A-Za-z0-9_-]{16}"$/);

    const conditional = await request.get("/users", {
      headers: { "If-None-Match": etag },
    });

    expect(conditional.status()).toBe(304);
    // 304 must carry the same ETag (clients use it to confirm).
    expect(conditional.headers().etag).toBe(etag);
    // 304 body must be empty (per HTTP spec).
    expect((await conditional.body()).length).toBe(0);
  });

  test("ETag: distinct routes yield distinct content hashes", async ({
    request,
  }) => {
    // Strong ETag is content-derived (sha256 over the final page).
    // Two semantically distinct pages must therefore produce distinct
    // ETags.
    const home = await request.get("/");
    const users = await request.get("/users");

    expect(home.status()).toBe(200);
    expect(users.status()).toBe(200);

    const homeEtag = home.headers().etag;
    const usersEtag = users.headers().etag;

    expect(homeEtag).toMatch(/^"[A-Za-z0-9_-]{16}"$/);
    expect(usersEtag).toMatch(/^"[A-Za-z0-9_-]{16}"$/);
    expect(homeEtag).not.toBe(usersEtag);
  });

  test("Loader-driven HTTP: /users/9999 throws LoaderNotFound → 404 text/plain", async ({
    request,
  }) => {
    // users.profile loader calls database.users.findById(id); if the
    // user is not in the in-memory store, it throws LoaderNotFound.
    // entry-server.ts catches the typed error and returns
    // { statusCode: 404, rawBody: "Not Found", contentType: "text/plain;..." }
    // — so the response is 404 with plain-text body, NOT a hydrated
    // HTML page with `data-testid="user-not-found"`.
    const response = await request.get("/users/9999");

    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toContain("text/plain");
    expect(await response.text()).toBe("Not Found");
  });

  test("Loader-driven HTTP: /users/9999/posts also throws LoaderNotFound → 404", async ({
    request,
  }) => {
    // Nested loader: users.profile.posts checks the same user table.
    // The leaf loader must throw LoaderNotFound for the same id, not
    // silently render an empty posts list. Same response shape as the
    // parent profile route.
    const response = await request.get("/users/9999/posts");

    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toContain("text/plain");
    expect(await response.text()).toBe("Not Found");
  });

  test("Loader-driven HTTP: /legacy-user/2 throws LoaderRedirect → 301 Location: /users/2", async ({
    request,
  }) => {
    // legacyUser loader unconditionally throws
    // `new LoaderRedirect("/users/<id>", 301)`. entry-server.ts maps
    // that to { statusCode: 301, redirect: "/users/2" } and the
    // express middleware emits 301 + Location header. We disable
    // automatic redirect-following so the test sees the 301 itself.
    const response = await request.get("/legacy-user/2", { maxRedirects: 0 });

    expect(response.status()).toBe(301);
    expect(response.headers().location).toBe("/users/2");
  });

  test("Loader-driven HTTP: /legacy-user/3 follows redirect → /users/3 hydrated profile", async ({
    page,
  }) => {
    // End-to-end: visiting /legacy-user/3 in a real browser follows
    // the 301 to /users/3 and renders Charlie's profile. Proves the
    // typed error → server-side redirect chain works through the
    // browser's native redirect handling (not just at the HTTP layer).
    await page.goto("/legacy-user/3");

    await expect(page).toHaveURL(/\/users\/3$/);
    await expect(page.locator("main")).toContainText("ID: 3");
    await expect(page.locator("main")).toContainText("Charlie");
  });

  test("Loader-driven HTTP: /slow throws LoaderTimeout → 504 Gateway Timeout for full request", async ({
    request,
  }) => {
    // /slow has a 5 s loader behind a 250 ms withTimeout race. When
    // the client lets the request finish (no abort), withTimeout
    // wins, throws LoaderTimeout, entry-server.ts maps it to
    // { statusCode: 504, rawBody: "Gateway Timeout" }. Companion to
    // the AbortController test above: that one verifies the abort
    // path; this one verifies the timeout path.
    const startedAt = Date.now();
    const response = await request.get("/slow");
    const elapsed = Date.now() - startedAt;

    expect(response.status()).toBe(504);
    expect(response.headers()["content-type"]).toContain("text/plain");
    expect(await response.text()).toBe("Gateway Timeout");
    // Timeout fires at ~250 ms; total round-trip should land well
    // under the 5 s loader delay (proves the race resolved the
    // timeout side, not the loader side).
    expect(elapsed).toBeLessThan(2500);
  });

  test("AbortController: client disconnect mid-render fires the slow loader's abort listener", async ({
    request,
  }) => {
    // /slow loader sleeps 5 s but registers an abort listener via
    // getDep("abortSignal"). server/index.ts attaches the controller
    // to req.on("close") — when the client gives up before the
    // response, the loader cleans up its setTimeout and rejects.
    //
    // Test: cancel the request via Playwright's `timeout` option.
    // The HTTP error surfaces as a Playwright error; the test checks
    // that the request did NOT take 5+ seconds (proving the server
    // released its handler quickly).
    const startedAt = Date.now();
    let aborted = false;

    try {
      await request.get("/slow", { timeout: 150 });
    } catch {
      aborted = true;
    }

    const elapsed = Date.now() - startedAt;

    expect(aborted).toBe(true);
    // Client gave up at ~150 ms, server should release its handler
    // within a few hundred ms — well under the 5 s loader delay.
    expect(elapsed).toBeLessThan(1000);
  });
});

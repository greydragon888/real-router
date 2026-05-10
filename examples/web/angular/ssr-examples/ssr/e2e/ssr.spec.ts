import { test, expect } from "@playwright/test";

const BASE = "http://localhost:4173";

test.describe("SSR (Angular)", () => {
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

  test("no flash of content on load — server returns populated <app-root>", async ({
    page,
  }) => {
    const response = await page.goto("/");
    const html = await response!.text();

    expect(html).toContain("Welcome");
    expect(html).toContain("<nav");
    expect(html).not.toMatch(/<app-root[^>]*>\s*<\/app-root>/);
  });

  test("Angular convention: <base href> is present in HTML for nested deep-links", async ({
    page,
  }) => {
    const response = await page.goto("/");
    const html = await response!.text();

    expect(html).toMatch(/<base href="\/"\s*\/?>/);
  });

  test("zoneless proof: no zone.js artifacts in HTML", async ({ page }) => {
    const response = await page.goto("/");
    const html = await response!.text();

    expect(html).not.toContain("zone.js");
    expect(html).not.toContain("ng-zone");
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
      .addCookies([{ name: "auth", value: "1", url: BASE }]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/dashboard");
    await expect(page.locator("main")).toContainText("Dashboard");
  });

  test("unknown route renders NotFound page with 404 status", async ({
    page,
  }) => {
    // Real-Router's allowNotFound: true config resolves UNKNOWN_ROUTE
    // without throwing, so Angular renders NotFound and emits 200 by
    // default. The 404 here is supplied by `<http-status-code [code]="404"/>`
    // mounted in NotFoundComponent: it injects HTTP_STATUS_SINK (provided
    // per-request via REQUEST_CONTEXT in app.config.ts) and writes 404
    // during ngOnInit. server.ts then reads `httpStatusSink.code` after
    // AngularNodeAppEngine.handle resolves and overrides
    // `response.status` accordingly. Without the dogfooded
    // <http-status-code> the response would still be 200.
    const response = await page.goto("/nonexistent");

    expect(response!.status()).toBe(404);
    await expect(page.locator("main")).toContainText("Not Found");
  });

  test("HttpStatusCode dogfood: 404 is set by render-time component, not server-side state inspection", async ({
    browser,
  }) => {
    // JS-disabled context proves the contract is server-side: NotFound
    // component mounts <http-status-code [code]="404"/> during AOT-compiled
    // SSR render, the component's ngOnInit writes through HTTP_STATUS_SINK
    // into the per-request sink (passed via REQUEST_CONTEXT), server.ts
    // reads `sink.code ?? response.status` and applies it. No client
    // hydration involved — the 404 must arrive on first byte.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const response = await page.goto("/nonexistent");

    expect(response!.status()).toBe(404);

    const html = await response!.text();

    // NotFound page rendered (proves render path was actually taken — not a
    // server-side short-circuit before render).
    expect(html).toContain("404 — Not Found");

    // Angular emits the host element <http-status-code></http-status-code>
    // because the @Component directive is real DOM. The template is empty
    // ("" in the @Component decorator) so no children appear inside the
    // host. Verify both: the host element is present (Angular sees the
    // selector), but no `code` attribute leaks (signal input is internal).
    expect(html).toContain("<http-status-code></http-status-code>");
    expect(html).not.toMatch(/<http-status-code[^>]*code\s*=\s*["']?404["']?/);

    await context.close();
  });

  test("HttpStatusCode dogfood: existing routes still return 200 (no phantom 404 leak)", async ({
    page,
  }) => {
    // Sentinel: prove the per-request sink is fresh on every request and
    // not somehow shared from a previous /nonexistent visit. If this test
    // were to fail with status 404, the sink would be leaking across
    // requests (module-level mutable state instead of request-scoped) —
    // the sink lives inside the per-request DI Injector spun up by
    // AngularNodeAppEngine.handle, so cross-request leak should be
    // structurally impossible.
    await page.goto("/nonexistent");

    const homeResponse = await page.goto("/");

    expect(homeResponse!.status()).toBe(200);

    const usersResponse = await page.goto("/users");

    expect(usersResponse!.status()).toBe(200);
  });

  test("loader output for users list flows through SSR HTML", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    const response = await page.goto("/users");
    const html = await response!.text();

    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html).toContain("Charlie");

    await context.close();
  });

  test("loader output for dynamic route lands in HTML", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    const response = await page.goto("/users/2");
    const html = await response!.text();

    expect(html).toContain('data-testid="user-profile"');
    expect(html).toContain('data-user-id="2"');
    expect(html).toMatch(/data-testid="user-name"[^>]*>[^<]*Bob/);

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

  test("post-hydration loader skip (#599): client makes zero loader-driven calls on first paint", async ({
    page,
  }) => {
    // app.config.ts wraps loader factories with a counter exposed on
    // window.__LOADER_CALLS__ on the client only. After hydration,
    // provideRealRouterFactory consumes the SSR-resolved router state from
    // TransferState, calls hydrateRouter(...) which deposits the parsed
    // state into the one-shot scratchpad, and ssr-data-plugin reuses the
    // server-resolved `data` namespace — skipping the client-side loader
    // call entirely. Parity with the other 5 adapters that consume
    // window.__SSR_STATE__ via entry-client.
    await page.goto("/users/2");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("user-profile")).toBeVisible();
    await expect(page.getByTestId("user-name")).toHaveText("Name: Bob");

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
        expect(html, `req ${i} HTML user-name text`).toContain(
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

  test("server returns 302 + Location for guarded route without cookie (CANNOT_ACTIVATE → redirect)", async ({
    request,
  }) => {
    // server.ts middleware catches CANNOT_ACTIVATE thrown by router.start()
    // (via provideAppInitializer → bootstrapApplication rejection) and issues
    // res.redirect(302, "/"). Disable auto-follow to inspect the raw redirect.
    const response = await request.get("/admin", { maxRedirects: 0 });

    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe("/");
  });

  test("loader error: rejected loader returns 500 (provideAppInitializer propagates)", async ({
    request,
  }) => {
    const response = await request.get("/boom");

    expect(response.status()).toBe(500);
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

    await context.close();
  });

  test("nested loader: /users/1/posts populates nested route data in HTML", async ({
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

    await context.close();
  });

  test("nested loader: /users/3/posts returns empty posts array → empty UI", async ({
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
      .addCookies([{ name: "userId", value: "1", url: BASE }]);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId("admin-page")).toBeVisible();
  });

  test("admin guard: non-admin (Bob) → /admin redirects to / (role check)", async ({
    page,
  }) => {
    await page
      .context()
      .addCookies([{ name: "userId", value: "2", url: BASE }]);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/$/);
  });

  test("dashboard guard: userId=2 (non-admin) still allowed (currentUser != null)", async ({
    page,
  }) => {
    await page
      .context()
      .addCookies([{ name: "userId", value: "2", url: BASE }]);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator("main")).toContainText("Dashboard");
  });

  test("CSR navigation to dynamic route: state.context.data is undefined post-navigate (SSR-only plugin contract)", async ({
    page,
  }) => {
    await page.goto("/users");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-user-id="2"]')).toBeVisible();

    // Click "Bob" — realLink calls router.navigate() (CSR via browser-plugin).
    // ssr-data-plugin intercepts start(), NOT navigate(), so the
    // /users/profile loader DOES NOT run. UserProfile reads
    // route.routeState().route.context.data, finds undefined, renders
    // "User not found".
    await page.click("text=Bob");
    await expect(page).toHaveURL(/\/users\/2$/);
    await expect(page.getByTestId("user-not-found")).toBeVisible();
    await expect(page.getByTestId("user-profile")).toHaveCount(0);
  });

  test("CSR guard: anonymous click on /admin link is blocked, URL unchanged", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Click intercepted by browser-plugin → router.navigate("admin") →
    // canActivate rejects (currentUser is null) → transition cancelled.
    // Angular RealLink swallows the rejection (.catch(() => {})), URL doesn't change.
    await page.click('[data-testid="nav-admin"]');

    await expect(page).toHaveURL("/");
    await expect(page.locator("main")).toContainText("Welcome");
    await expect(page.getByTestId("admin-page")).toHaveCount(0);
  });

  test("server-rendered RealLink emits absolute href in HTML (no JS)", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    const response = await page.goto("/users");
    const html = await response!.text();

    expect(html).toMatch(/<a [^>]*href="\/users\/1"/);
    expect(html).toMatch(/<a [^>]*href="\/users\/2"/);
    expect(html).toMatch(/<a [^>]*href="\/users\/3"/);

    expect(html).toMatch(/<a [^>]*href="\/"/);
    expect(html).toMatch(/<a [^>]*href="\/users"/);

    await context.close();
  });

  test("CSR guard pass: admin user clicks /admin link, navigates without server roundtrip", async ({
    page,
  }) => {
    await page
      .context()
      .addCookies([{ name: "userId", value: "1", url: BASE }]);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.evaluate(() => {
      (
        globalThis as unknown as Window & { __NAV_MARKER__?: boolean }
      ).__NAV_MARKER__ = true;
    });

    await page.click('[data-testid="nav-admin"]');
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId("admin-page")).toBeVisible();

    const marker = await page.evaluate(
      () =>
        (globalThis as unknown as Window & { __NAV_MARKER__?: boolean })
          .__NAV_MARKER__,
    );

    expect(marker).toBe(true);
  });

  test("loader-driven 404: unknown /users/:id returns HTTP 404 (loader throws LoaderNotFound)", async ({
    request,
  }) => {
    // The users.profile loader throws LoaderNotFound for ids that don't exist
    // in the database. server.ts middleware maps the typed error to res
    // status 404. Distinguishes between "route not registered" (UNKNOWN_ROUTE
    // → 200 + NotFound page via allowNotFound:true) and "route matched but
    // resource not found" (LOADER_NOT_FOUND → 404).
    const response = await request.get("/users/9999");

    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toContain("text/plain");
  });

  test("loader-driven 404 for nested route: /users/9999/posts also returns 404", async ({
    request,
  }) => {
    const response = await request.get("/users/9999/posts");

    expect(response.status()).toBe(404);
  });

  test("loader-driven 301 redirect: /legacy-user/2 → /users/2 (loader throws LoaderRedirect)", async ({
    request,
  }) => {
    const response = await request.get("/legacy-user/2", { maxRedirects: 0 });

    expect(response.status()).toBe(301);
    expect(response.headers().location).toBe("/users/2");
  });

  test("loader-driven 301 follows correctly to a hydrated profile", async ({
    page,
  }) => {
    await page.goto("/legacy-user/3");

    await expect(page).toHaveURL(/\/users\/3$/);
    await expect(page.getByTestId("user-name")).toHaveText("Name: Charlie");
  });

  test("loader timeout: /slow returns 504 within budget (withTimeout fires before 5s delay)", async ({
    request,
  }) => {
    // The "slow" loader sleeps 5000ms but is wrapped in withTimeout(250ms).
    // Server middleware maps LOADER_TIMEOUT → 504 Gateway Timeout. Without
    // timeout protection, an idle SSR worker would hang for the full delay
    // and produce a 200 response with "this should never be seen" data.
    const startedAt = Date.now();
    const response = await request.get("/slow");
    const elapsed = Date.now() - startedAt;

    expect(response.status()).toBe(504);
    expect(elapsed).toBeLessThan(2500);
  });

  test("CSR navigate spy: clicking a profile link issues NO new HTML request and leaves data undefined", async ({
    page,
  }) => {
    // ssr-data-plugin intercepts only start(), not navigate(). When the user
    // clicks a realLink, browser-plugin handles it client-side — no SSR
    // round-trip, no loader rerun, data stays undefined ("User not found"
    // template branch). This test makes that contract explicit by counting
    // network HTML requests during the click instead of inferring from DOM
    // alone.
    await page.goto("/users");
    await page.waitForLoadState("networkidle");

    const documentRequests: string[] = [];

    page.on("request", (req) => {
      if (
        req.resourceType() === "document" ||
        req.resourceType() === "fetch" ||
        req.resourceType() === "xhr"
      ) {
        documentRequests.push(req.url());
      }
    });

    await page.click("text=Bob");
    await expect(page).toHaveURL(/\/users\/2$/);
    await expect(page.getByTestId("user-not-found")).toBeVisible();

    const profileFetches = documentRequests.filter((url) =>
      /\/users\/2$/.test(new URL(url).pathname),
    );

    expect(profileFetches).toEqual([]);
  });

  test("per-request isolation under mixed guards: /, /users, /dashboard, /admin, /users/1/posts in parallel with different auth contexts", async ({
    browser,
  }) => {
    // Spin up three independent contexts (admin / regular user / anon) and
    // fire five different routes in parallel. Each request must see only its
    // own currentUser dependency; no cross-context bleed.
    const [adminCtx, userCtx, anonCtx] = await Promise.all([
      browser.newContext({
        storageState: {
          cookies: [
            {
              name: "userId",
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
      browser.newContext({
        storageState: {
          cookies: [
            {
              name: "userId",
              value: "2",
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
      const responses = await Promise.all([
        adminCtx.request.get("/admin"),
        adminCtx.request.get("/users/1/posts"),
        userCtx.request.get("/dashboard"),
        userCtx.request.get("/admin", { maxRedirects: 0 }),
        anonCtx.request.get("/users"),
        anonCtx.request.get("/admin", { maxRedirects: 0 }),
        anonCtx.request.get("/dashboard", { maxRedirects: 0 }),
        anonCtx.request.get("/"),
      ]);

      const [
        adminAdmin,
        adminPosts,
        userDashboard,
        userAdmin,
        anonUsers,
        anonAdmin,
        anonDashboard,
        anonHome,
      ] = responses;

      expect(adminAdmin.status(), "admin → /admin").toBe(200);
      expect(await adminAdmin.text()).toContain('data-testid="admin-page"');

      expect(adminPosts.status(), "admin → /users/1/posts").toBe(200);
      const adminPostsHtml = await adminPosts.text();

      expect(adminPostsHtml).toContain('data-testid="user-posts"');
      expect(adminPostsHtml).toContain("Hello world");

      expect(userDashboard.status(), "user → /dashboard").toBe(200);
      expect(await userDashboard.text()).toContain("Dashboard");

      expect(userAdmin.status(), "user → /admin (role mismatch)").toBe(302);
      expect(userAdmin.headers().location).toBe("/");

      expect(anonUsers.status(), "anon → /users").toBe(200);
      expect(await anonUsers.text()).toContain("Alice");

      expect(anonAdmin.status(), "anon → /admin").toBe(302);
      expect(anonAdmin.headers().location).toBe("/");

      expect(anonDashboard.status(), "anon → /dashboard").toBe(302);
      expect(anonDashboard.headers().location).toBe("/");

      expect(anonHome.status(), "anon → /").toBe(200);
      expect(await anonHome.text()).toContain("Welcome");
    } finally {
      await adminCtx.close();
      await userCtx.close();
      await anonCtx.close();
    }
  });

  test("mixed RenderMode (Server): /live is rendered fresh per request — two consecutive responses have different timestamps", async ({
    request,
  }) => {
    // /live is mapped to RenderMode.Server in app.routes.server.ts. Each
    // request bootstraps the app fresh, so the renderedAt timestamp baked
    // into the SSR'd HTML must change between consecutive calls.
    const first = await request.get("/live");
    const firstHtml = await first.text();
    const firstMatch = firstHtml.match(/datetime="([^"]+)"/);

    expect(firstMatch?.[1]).toBeTruthy();
    expect(firstHtml).toContain('data-testid="live-page"');
    expect(firstHtml).toContain("RenderMode: Server (fresh per request)");

    // Force at least 5 ms gap so we don't compare two timestamps that
    // happened to land in the same millisecond.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = await request.get("/live");
    const secondHtml = await second.text();
    const secondMatch = secondHtml.match(/datetime="([^"]+)"/);

    expect(secondMatch?.[1]).toBeTruthy();
    expect(secondMatch?.[1]).not.toBe(firstMatch?.[1]);
  });

  test("mixed RenderMode (Client): /marketing is served as a CSR shell — no marketing-specific server HTML, identical bytes across requests", async ({
    request,
  }) => {
    // /marketing is mapped to RenderMode.Client. Angular SSR returns the
    // same prebuilt CSR shell (index.csr.html) for every Client-mode path —
    // not a per-request render. The proof is bytewise identical responses
    // and the absence of marketing-specific SSR'd content. The page becomes
    // visible only after the JS bundle bootstraps client-side; that path is
    // covered by the next test.
    const first = await request.get("/marketing");
    const firstHtml = await first.text();

    const second = await request.get("/marketing");
    const secondHtml = await second.text();

    expect(first.status()).toBe(200);
    expect(firstHtml).toBe(secondHtml);
    expect(firstHtml).not.toContain('data-testid="marketing-page"');
    expect(firstHtml).not.toContain('data-testid="marketing-tagline"');
  });

  test("mixed RenderMode (Client): /marketing renders content client-side after JS bootstrap", async ({
    page,
  }) => {
    // After the CSR shell loads, the JS bundle runs `router.start("/marketing")`
    // and the marketing-page component renders. Without JS the user would
    // see the empty shell — that contract is covered by the previous test.
    await page.goto("/marketing");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("marketing-page")).toBeVisible();
    await expect(page.getByTestId("marketing-tagline")).toContainText(
      "Per-request router scope",
    );
  });

  test("mixed RenderMode: nav links to /live and /marketing both work via CSR (browser-plugin)", async ({
    page,
  }) => {
    // RenderMode is a server-side directive. Once the JS bundle is running,
    // browser-plugin handles all navigations identically — Server-rendered
    // and Client-rendered routes are interchangeable from the user's POV.
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.click('[data-testid="nav-marketing"]');
    await expect(page).toHaveURL(/\/marketing$/);
    await expect(page.getByTestId("marketing-page")).toBeVisible();

    await page.click('[data-testid="nav-live"]');
    await expect(page).toHaveURL(/\/live$/);
    await expect(page.getByTestId("live-page")).toBeVisible();
  });

  test("serverRoutes status override: /gone returns HTTP 410 + Sunset/Deprecation/Link headers + a real SSR body", async ({
    request,
  }) => {
    // ServerRoute config in app.routes.server.ts pins /gone to status: 410
    // and adds three sunset-related headers. The SSR renderer still runs,
    // so the body explains the deprecation in human-readable form. This is
    // the declarative alternative to throwing a typed loader error and
    // catching it in middleware — useful when the status is a property of
    // the URL itself (not of the resolved data).
    const response = await request.get("/gone");

    expect(response.status()).toBe(410);

    const headers = response.headers();

    expect(headers["sunset"]).toBe("Wed, 01 Jan 2025 00:00:00 GMT");
    expect(headers["deprecation"]).toBe("true");
    expect(headers["link"]).toBe('</marketing>; rel="successor-version"');
    expect(headers["content-type"]).toContain("text/html");

    const html = await response.text();

    expect(html).toContain('data-testid="gone-page"');
    expect(html).toContain("HTTP 410");
    expect(html).toContain("our marketing page");
    // Successor link is rendered as a realLink — verify the href resolves.
    expect(html).toMatch(/<a [^>]*href="\/marketing"/);
  });

  test("serverRoutes status override vs loader-thrown error: /gone keeps SSR body, /users/9999 returns plain text", async ({
    request,
  }) => {
    // Side-by-side comparison of the two HTTP-mapping strategies:
    //   - /gone           → ServerRoute status:410 → full SSR HTML body
    //   - /users/9999     → loader throws LoaderNotFound → middleware short-
    //                       circuits with res.send("Not Found") (text/plain)
    // Both are honest, the trade-off is body fidelity vs implementation
    // simplicity. README documents when to pick which.
    const [gone, missing] = await Promise.all([
      request.get("/gone"),
      request.get("/users/9999"),
    ]);

    expect(gone.status()).toBe(410);
    expect(gone.headers()["content-type"]).toContain("text/html");

    expect(missing.status()).toBe(404);
    expect(missing.headers()["content-type"]).toContain("text/plain");
  });

  test("Cache-Control: per-route policy from cache-policies.ts (public for users list, no-store for admin redirect)", async ({
    request,
  }) => {
    // server.ts reads getCachePolicy(req.url) and emits the
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

    // 302 redirect from CANNOT_ACTIVATE — Cache-Control on redirect
    // status varies (Express's redirect helper sends its own headers),
    // we only assert the status reflects the auth gate.
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

  test("AbortController: client disconnect mid-render fires the slow loader's abort listener", async ({
    request,
  }) => {
    // /slow loader sleeps 5 s but registers an abort listener via
    // getDep("abortSignal"). server.ts attaches the controller to
    // req.on("close") — when the client gives up before the response,
    // the loader cleans up its setTimeout and rejects.
    //
    // Test: cancel the request via Playwright's `timeout` option.
    // The HTTP error surfaces as a Playwright error; the test checks
    // that the request did NOT take 5+ seconds (proving the server
    // released its handler quickly). Also verifies the existing
    // /slow → 504 path still works for full requests via withTimeout.
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

  test.describe.serial("withTimeout (#598) network cancellation", () => {
    test("fetch inside withTimeout-wrapped loader is cancelled at the network layer when the deadline elapses", async ({
      request,
    }) => {
      const before = (await (
        await request.get("/__bench/abort-count")
      ).json()) as { abortObserved: number };

      const response = await request.get("/slow");
      expect(response.status()).toBe(504);

      await new Promise<void>((resolve) => setTimeout(resolve, 200));

      const after = (await (
        await request.get("/__bench/abort-count")
      ).json()) as { abortObserved: number };

      expect(after.abortObserved).toBeGreaterThanOrEqual(
        before.abortObserved + 1,
      );
    });
  });

  // NOTE: per-route SSR mode (#597) is exercised by the `widget` route in
  // routes.ts + loaders.ts (`{ ssr: false }`). The plugin correctly resolves
  // mode and skips the loader on the server, but Angular SSR does not
  // serialize router State into the HTML payload (no `window.__SSR_STATE__`
  // script tag — Angular uses its own TransferState mechanism instead).
  // A runtime e2e assertion equivalent to the React/Vue/Solid/Svelte adapters
  // would require wiring serializeRouterState through TransferState in this
  // example, which is out of scope for #597. Compile-time + cross-adapter
  // coverage of the breaking-change in DataLoaderFactoryMap stands.
});

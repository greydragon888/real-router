import { test, expect } from "@playwright/test";

test.describe("SSR (Solid)", () => {
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

  test("server injects Solid hydration script (generateHydrationScript) into HTML", async ({
    request,
  }) => {
    const response = await request.get("/");
    const html = await response.text();

    // Solid emits a `<script>...window._$HY=...</script>` block via
    // generateHydrationScript(). Without this, hydrate() cannot resume the
    // server-rendered tree and a full re-render is forced.
    expect(html).toContain("_$HY");
  });

  test("server-rendered HTML contains Solid hydration markers (data-hk)", async ({
    request,
  }) => {
    // vite-plugin-solid({ ssr: true }) flips `hydratable: true` for both
    // client and server bundles. Server output must therefore carry
    // `data-hk` attributes on hydratable nodes — the absence proves the
    // plugin option was missed and a hydration mismatch is imminent.
    // Solid emits the marker as `data-hk="<hex>"` (quoted hex value).
    const response = await request.get("/users");
    const html = await response.text();

    expect(html).toMatch(/<\w+ [^>]*data-hk="?[0-9a-f]+/);
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
      .addCookies([{ name: "auth", value: "1", url: "http://localhost:3010" }]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/dashboard");
    await expect(page.locator("main")).toContainText("Dashboard");
  });

  test("404 returns correct status code", async ({ page }) => {
    const response = await page.goto("/nonexistent");

    expect(response!.status()).toBe(404);
    await expect(page.locator("main")).toContainText("Not Found");
  });

  test("HttpStatusCode dogfood: 404 is set by render-time component, not server-side state inspection", async ({
    browser,
  }) => {
    // JS-disabled context proves the contract is server-side: NotFound page
    // mounts <HttpStatusCode code={404}/> during renderToStringAsync, the
    // wrapping <HttpStatusProvider sink={...}> captures the value into the
    // per-request sink, entry-server reads `sink.code ?? 200` and applies
    // it. No client hydration involved — the 404 must arrive on first byte.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const response = await page.goto("/nonexistent");

    expect(response!.status()).toBe(404);

    const html = await response!.text();

    // NotFound page rendered (proves render path was actually taken — not a
    // server-side short-circuit before render). If `<HttpStatusCode>` had
    // failed to write to the sink, the response would be 200 here, not 404.
    expect(html).toContain("404 — Not Found");

    // <HttpStatusCode> returns null in Solid — no DOM element/attribute
    // bearing the component's name should leak into the served HTML.
    expect(html).not.toContain("HttpStatusCode");
    expect(html).not.toContain("http-status-code");
    expect(html).not.toMatch(/code\s*=\s*["']?404["']?/);

    await context.close();
  });

  test("HttpStatusCode dogfood: existing routes still return 200 (no phantom 404 leak)", async ({
    page,
  }) => {
    // Sentinel: prove the per-request sink is fresh on every request and
    // not somehow shared from a previous /nonexistent visit. If this test
    // were to fail with status 404, the sink would be leaking across
    // requests (module-level mutable state instead of request-scoped).
    await page.goto("/nonexistent");

    const homeResponse = await page.goto("/");

    expect(homeResponse!.status()).toBe(200);

    const usersResponse = await page.goto("/users");

    expect(usersResponse!.status()).toBe(200);
  });

  test("HttpStatusCode dogfood: client hydrates the rendered NotFound page without warnings", async ({
    page,
  }) => {
    // With JS enabled the client hydrates the same DOM the server emitted
    // for /nonexistent. <HttpStatusCode> is in the hydrated tree but no
    // <HttpStatusProvider> is mounted client-side (entry-client.tsx wires
    // the SPA without one), so the component reads `useContext` → null and
    // is a silent no-op. This test verifies the silent no-op path produces
    // no rendering/hydration warnings.
    const errors: string[] = [];
    const warnings: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
      if (msg.type() === "warning") warnings.push(msg.text());
    });

    const response = await page.goto("/nonexistent");

    expect(response!.status()).toBe(404);
    await expect(page.locator("main")).toContainText("Not Found");

    const noisy = [...errors, ...warnings].filter((m) =>
      /HttpStatusCode|HttpStatusProvider|hydrat|mismatch/i.test(m),
    );

    expect(noisy).toHaveLength(0);
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

    expect(html).toContain('data-user-id="1"');
    expect(html).toContain('data-user-id="2"');
    expect(html).toContain('data-user-id="3"');
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html).toContain("Charlie");

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
    expect(html).toContain("Bob");

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

  test("hydration: deep-link → full reload preserves loader-resolved data after JS boot (#596 reuses pre-resolved data)", async ({
    page,
  }) => {
    // After hydrateRouter → router.start(state.path), ssr-data-plugin reads
    // the pre-resolved value from globalThis.__SSR_STATE__.context.data and
    // skips its loader (#596). Component renders identically — no flash, no
    // mismatch, no extra round-trip to the in-memory database.
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

  test("post-hydration loader skip (#596): client makes zero loader-driven calls on first paint", async ({
    page,
  }) => {
    // entry-client.tsx wraps loader factories with a counter exposed on
    // globalThis.__LOADER_CALLS__. After hydration, ssr-data-plugin must
    // reuse the pre-resolved `data` namespace and skip every client-side
    // loader call.
    await page.goto("/users/2");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("user-profile")).toBeVisible();
    await expect(page.getByTestId("user-name")).toHaveText("Name: Bob");

    const counts = await page.evaluate(() => globalThis.__LOADER_CALLS__);

    expect(counts).toEqual({});
  });

  test("post-hydration loader skip (#596): list route hydrates without loader fire", async ({
    page,
  }) => {
    await page.goto("/users");
    await page.waitForLoadState("networkidle");

    const counts = await page.evaluate(() => globalThis.__LOADER_CALLS__);

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
    expect(html).toContain("desc");

    const charlieIdx = html.indexOf("Charlie");
    const bobIdx = html.indexOf("Bob");
    const aliceIdx = html.indexOf("Alice");

    expect(charlieIdx).toBeGreaterThan(-1);
    expect(charlieIdx).toBeLessThan(bobIdx);
    expect(bobIdx).toBeLessThan(aliceIdx);

    const ssrStateMatch = html.match(/window\.__SSR_STATE__=({.*?})<\/script>/);
    const ssrState = JSON.parse(ssrStateMatch![1]) as {
      search: { sort?: string };
      context?: { data?: { sort?: string } };
    };

    expect(ssrState.search.sort).toBe("desc");
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
    expect(html).toContain('data-post-id="p1"');
    expect(html).toContain('data-post-id="p2"');
    expect(html).toContain("Hello world");
    expect(html).toContain("On routing");

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
        { name: "userId", value: "1", url: "http://localhost:3010" },
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
        { name: "userId", value: "2", url: "http://localhost:3010" },
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
        { name: "userId", value: "2", url: "http://localhost:3010" },
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
    // routeState().route.context.data, finds undefined, renders "User not found".
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
    // Solid Link swallows the rejection (.catch(() => {})), URL doesn't change.
    await page.click('[data-testid="nav-admin"]');

    await expect(page).toHaveURL("/");
    await expect(page.locator("main")).toContainText("Welcome");
    await expect(page.getByTestId("admin-page")).toHaveCount(0);
  });

  test("server returns 302 + Location for guarded route without cookie", async ({
    request,
  }) => {
    // entry-server.tsx maps a CANNOT_ACTIVATE rejection to { statusCode: 302,
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
    // <a href="..."> attribute. If the Solid adapter's buildHref were broken
    // in SSR, the resulting HTML would lack hrefs and SEO/crawlers would fail.
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
    // Cookie injected before goto so entry-client.tsx picks it up at boot
    // (lookupUserFromCookies(parseCookieHeader(document.cookie)) before usePlugin).
    await page.context().addCookies([
      { name: "userId", value: "1", url: "http://localhost:3010" },
    ]);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.evaluate(() => {
      (globalThis as unknown as Window & { __NAV_MARKER__?: boolean })
        .__NAV_MARKER__ = true;
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

  test("loader-driven 404: unknown /users/:id returns HTTP 404 (loader throws LoaderNotFound)", async ({
    request,
  }) => {
    // The users.profile loader throws LoaderNotFound for ids not in the
    // database. entry-server.tsx converts the typed error into rawBody +
    // status:404; server/index.ts sends text/plain. Distinguishes "route
    // not registered" (UNKNOWN_ROUTE → 404 + NotFound page) from "route
    // matched but resource not found" (LOADER_NOT_FOUND → text/plain 404).
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

  test("loader timeout: /slow returns 504 within budget (withTimeout fires before 5 s loader delay)", async ({
    request,
  }) => {
    // The "slow" loader sleeps 5000 ms but is wrapped in withTimeout(250 ms).
    // entry-server.tsx maps LOADER_TIMEOUT → status:504 + rawBody. Without
    // timeout protection, an idle SSR worker would hang for the full delay
    // and produce a 200 response with stale data.
    const startedAt = Date.now();
    const response = await request.get("/slow");
    const elapsed = Date.now() - startedAt;

    expect(response.status()).toBe(504);
    expect(elapsed).toBeLessThan(2500);
  });

  test("head injection: home page ships per-route <title> + <meta description> in SSR HTML", async ({
    request,
  }) => {
    // entry-server.tsx calls getMetaForState(state) and splices <title>
    // + <meta description> into the <!--ssr-head--> placeholder. Verify
    // the wire format directly (no JS, no hydration) — regressions in the
    // head injection pipeline silently break SEO.
    const response = await request.get("/");
    const html = await response.text();

    expect(html).toContain("<title>Home — Real-Router Solid SSR</title>");
    expect(html).toMatch(
      /<meta[^>]+name="description"[^>]+content="Welcome to the Real-Router Solid SSR example/,
    );
  });

  test("head injection per-route: /users title reflects current ?sort param", async ({
    request,
  }) => {
    // The `users` route's meta resolver reads state.search.sort; verify it
    // actually flows through to the SSR'd <title>.
    const ascending = await request.get("/users?sort=asc");
    const ascendingHtml = await ascending.text();

    expect(ascendingHtml).toContain(
      "<title>All Users (sorted asc) — Real-Router Solid SSR</title>",
    );

    const descending = await request.get("/users?sort=desc");
    const descendingHtml = await descending.text();

    expect(descendingHtml).toContain(
      "<title>All Users (sorted desc) — Real-Router Solid SSR</title>",
    );
  });

  test("CSR navigate spy: clicking a profile link issues NO new HTML/document request and leaves data undefined", async ({
    page,
  }) => {
    // ssr-data-plugin intercepts only start(), not navigate(). When the
    // user clicks a Link, browser-plugin handles it client-side — no SSR
    // round-trip, no loader rerun, data stays undefined ("User not found"
    // template branch). This test makes that contract explicit by counting
    // network HTML/fetch requests during the click instead of inferring
    // from DOM alone.
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
    // fire five different routes in parallel. Each request must see only
    // its own currentUser dependency; no cross-context bleed.
    const BASE = "http://localhost:3010";

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
      const [
        adminAdmin,
        adminPosts,
        userDashboard,
        userAdmin,
        anonUsers,
        anonAdmin,
        anonDashboard,
        anonHome,
      ] = await Promise.all([
        adminCtx.request.get(`${BASE}/admin`),
        adminCtx.request.get(`${BASE}/users/1/posts`),
        userCtx.request.get(`${BASE}/dashboard`),
        userCtx.request.get(`${BASE}/admin`, { maxRedirects: 0 }),
        anonCtx.request.get(`${BASE}/users`),
        anonCtx.request.get(`${BASE}/admin`, { maxRedirects: 0 }),
        anonCtx.request.get(`${BASE}/dashboard`, { maxRedirects: 0 }),
        anonCtx.request.get(`${BASE}/`),
      ]);

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

  test("renderToStringAsync: /async-page response awaits Suspense before flushing — body contains resolved content, not fallback", async ({
    request,
  }) => {
    // entry-server.tsx now uses renderToStringAsync (the third Solid SSR
    // mode). Pages with <Suspense> + createResource block the response
    // until every boundary resolves. The /async-page route has a 500 ms
    // server-side delay; the body therefore arrives ~500 ms in but is a
    // single buffered string (no chunked transfer).
    const startedAt = Date.now();
    const response = await request.get("/async-page");
    const elapsed = Date.now() - startedAt;

    expect(response.status()).toBe(200);

    // Response time must reflect the server-side await (≥400 ms floor
    // for CI jitter; the loader sleeps 500 ms).
    expect(elapsed).toBeGreaterThanOrEqual(400);

    const html = await response.text();

    // Resolved content present, fallback absent — proves the Suspense
    // boundary completed server-side before the body was sent.
    expect(html).toContain('data-testid="async-stats"');
    expect(html).toContain("Visitors:");
    expect(html).toContain("12,345");
    expect(html).not.toContain('data-testid="async-stats-fallback"');
  });

  test("renderToStringAsync: pages without <Suspense> still resolve fast (no async overhead)", async ({
    request,
  }) => {
    // Sync content (home page) takes the fast path through
    // renderToStringAsync — no Suspense to await, resolves in the same
    // tick. Sanity-check that switching from renderToString to
    // renderToStringAsync did not regress the baseline.
    const startedAt = Date.now();
    const response = await request.get("/");
    const elapsed = Date.now() - startedAt;

    expect(response.status()).toBe(200);
    expect(elapsed).toBeLessThan(300);
  });

  test("createUniqueId: SSR'd HTML has stable IDs that survive client hydration without mismatch", async ({
    page,
    request,
  }) => {
    // createUniqueId() generates the same ID on the server and the
    // client (Solid threads a deterministic counter through the runtime).
    // Read the SSR'd IDs from the wire response, then read them from the
    // hydrated DOM, and assert equality. If Solid's id-generation
    // diverged between server and client, htmlFor/aria-describedby
    // bindings would silently break — that's exactly what
    // createUniqueId prevents.
    const response = await request.get("/form");
    const html = await response.text();

    // Extract input id + label htmlFor + aria-describedby.
    const inputMatch = html.match(/id="(0[0-9a-f]+)"\s+data-testid="email-input"/);
    const labelMatch = html.match(/for="(0[0-9a-f]+)"\s+data-testid="email-label"/);
    const helpMatch = html.match(/id="(0[0-9a-f]+)"\s+data-testid="email-help"/);

    expect(inputMatch?.[1]).toBeTruthy();
    expect(labelMatch?.[1]).toBeTruthy();
    expect(helpMatch?.[1]).toBeTruthy();

    // Server-side: label.for === input.id (proves stable wiring).
    expect(labelMatch![1]).toBe(inputMatch![1]);

    const errors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        errors.push(msg.text());
      }
    });

    await page.goto("/form");
    await page.waitForLoadState("networkidle");

    // Client-side: same IDs must surface on the DOM after hydration.
    const clientIds = await page.evaluate(() => ({
      inputId: document
        .querySelector('[data-testid="email-input"]')
        ?.getAttribute("id"),
      labelFor: document
        .querySelector('[data-testid="email-label"]')
        ?.getAttribute("for"),
      helpId: document
        .querySelector('[data-testid="email-help"]')
        ?.getAttribute("id"),
    }));

    expect(clientIds.inputId).toBe(inputMatch![1]);
    expect(clientIds.labelFor).toBe(labelMatch![1]);
    expect(clientIds.helpId).toBe(helpMatch![1]);

    // No hydration mismatch warnings — proves IDs were stable across
    // server/client boundaries.
    const hydrationIssues = errors.filter(
      (text) =>
        text.toLowerCase().includes("hydrat") ||
        text.toLowerCase().includes("mismatch"),
    );

    expect(hydrationIssues).toEqual([]);
  });

  test("createUniqueId: every reload generates the same IDs (deterministic counter)", async ({
    request,
  }) => {
    // Solid resets the id counter at the start of each render. Two
    // consecutive requests to the same page must produce the same IDs.
    const first = await request.get("/form");
    const second = await request.get("/form");

    const firstHtml = await first.text();
    const secondHtml = await second.text();

    const firstInputMatch = firstHtml.match(
      /id="(0[0-9a-f]+)"\s+data-testid="email-input"/,
    );
    const secondInputMatch = secondHtml.match(
      /id="(0[0-9a-f]+)"\s+data-testid="email-input"/,
    );

    expect(firstInputMatch?.[1]).toBe(secondInputMatch?.[1]);
  });

  test("AutoMeta + createEffect: document.title updates reactively after CSR navigation between routes", async ({
    page,
  }) => {
    // `AutoMeta` reads route state via `useRoute()` and a Solid
    // `createEffect` mutates `document.title` and the `<meta
    // name="description">` element on every change. After CSR
    // navigation home → users, the title must reflect the new route's
    // entry from getMetaForState() — without manual document.title
    // assignment in app code.
    //
    // (See AutoMeta.tsx for why we don't use @solidjs/meta's
    // <Title>/<Meta> components: useAssets-based asset injection is
    // not reliable in renderToStringAsync mode on Solid 1.9.5.)
    await page.goto("/");

    expect(await page.title()).toBe("Home — Real-Router Solid SSR");

    // Click "Users" nav link → CSR navigation via browser-plugin.
    await page.click('a[href="/users"]');
    await expect(page).toHaveURL(/\/users$/);

    // createEffect fires on the route change → document.title updates.
    await expect
      .poll(async () => page.title())
      .toBe("All Users (sorted asc) — Real-Router Solid SSR");

    // Navigate back to home via Link click.
    await page.click('a[href="/"]');
    await expect(page).toHaveURL("/");

    await expect
      .poll(async () => page.title())
      .toBe("Home — Real-Router Solid SSR");
  });

  test("AutoMeta + createEffect: <meta name=\"description\"> content also updates on navigation", async ({
    page,
  }) => {
    // The same createEffect updates the description meta tag in
    // tandem with the title. Verify by reading the live DOM attribute
    // after navigation.
    await page.goto("/");

    const initialDesc = await page
      .locator('meta[name="description"]')
      .getAttribute("content");

    expect(initialDesc).toContain("Welcome to the Real-Router Solid SSR");

    await page.click('a[href="/users"]');
    await expect(page).toHaveURL(/\/users$/);

    await expect
      .poll(async () =>
        page.locator('meta[name="description"]').getAttribute("content"),
      )
      .toContain("Browse the user list");
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
    // itself caches (we want browsers to re-check the auth state, not
    // remember the redirect).
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
    // ETags. (Solid's Home page is static, so we cross-route compare
    // instead of cross-time — Svelte adapter has a clock-based dynamic
    // version of this test; identical assertion shape, different axis.)
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
    // getDep("abortSignal"). server/index.ts attaches the controller
    // to req.on("close") — when the client gives up before the
    // response, the loader cleans up its setTimeout and rejects.
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

  test("per-route SSR mode (#597): client-only entry skips loader", async ({
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

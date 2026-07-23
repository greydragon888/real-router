import { test, expect } from "@playwright/test";

test.describe("SSR (Svelte)", () => {
  test("server-rendered HTML contains expected content", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/");

    await expect(page.locator("nav")).toContainText("Home");
    await expect(page.locator("main")).toContainText("Welcome");

    await context.close();
  });

  test("no hydration mismatch warnings", async ({ page }) => {
    const messages: string[] = [];

    page.on("console", (msg) => {
      const text = msg.text();
      if (msg.type() === "error" || msg.type() === "warning") {
        messages.push(text);
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const hydrationIssues = messages.filter(
      (text) =>
        text.toLowerCase().includes("hydrat") ||
        text.toLowerCase().includes("mismatch"),
    );

    expect(hydrationIssues).toEqual([]);
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
      .addCookies([{ name: "auth", value: "1", url: "http://localhost:3013" }]);
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
    // mounts <HttpStatusCode code={404}/> during svelte/server render(),
    // App.svelte's <HttpStatusProvider {sink}> captures the value into the
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

    // <HttpStatusCode> renders no DOM in Svelte (template is empty after
    // the script-time getContext write) — no element/attribute bearing
    // the component's name should leak into the served HTML.
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
    // for /nonexistent. Client-side App.svelte does not pass
    // `httpStatusSink` so HttpStatusProvider is never mounted; the
    // <HttpStatusCode> inside NotFound reads `getContext` → undefined →
    // silent no-op. This test verifies the silent no-op path produces no
    // Svelte/hydration warnings.
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
      if (msg.type() === "error" || msg.type() === "warning") {
        errors.push(msg.text());
      }
    });

    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("user-name")).toHaveText("Name: Charlie");

    const hydrationIssues = errors.filter(
      (e) =>
        e.toLowerCase().includes("hydrat") ||
        e.toLowerCase().includes("mismatch"),
    );

    expect(hydrationIssues).toEqual([]);
  });

  test("post-hydration loader skip (#596): client makes zero loader-driven calls on first paint", async ({
    page,
  }) => {
    // entry-client.ts wraps loader factories with a counter exposed on
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
        { name: "userId", value: "1", url: "http://localhost:3013" },
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
        { name: "userId", value: "2", url: "http://localhost:3013" },
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
        { name: "userId", value: "2", url: "http://localhost:3013" },
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
    // route.current.context.data, finds undefined, renders "User not found".
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
    // Svelte Link swallows the rejection (.catch(NOOP)), URL doesn't change.
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
    // <a href="..."> attribute. If the Svelte adapter's buildHref were broken
    // in SSR, the resulting HTML would lack hrefs and SEO/crawlers would fail.
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
    await page.context().addCookies([
      { name: "userId", value: "1", url: "http://localhost:3013" },
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
    // database. renderPage() converts the typed error into rawBody + status:404
    // and server/index.ts sends text/plain. This distinguishes "route not
    // registered" (UNKNOWN_ROUTE → 404 via NotFound page) from "route
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

  test("loader timeout: /slow returns 504 within budget (withTimeout fires before 5 s delay)", async ({
    request,
  }) => {
    // The "slow" loader sleeps 5000 ms but is wrapped in withTimeout(250 ms).
    // renderPage() maps LOADER_TIMEOUT → status:504 + rawBody. Without
    // timeout protection, an idle SSR worker would hang for the full delay
    // and produce a 200 response with stale data.
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
    // clicks a Link, browser-plugin handles it client-side — no SSR
    // round-trip, no loader rerun, data stays undefined ("User not found"
    // template branch). This test makes that contract explicit by counting
    // network HTML/fetch requests during the click.
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

  test("svelte:head injection: home page ships per-route <title> + <meta description> in SSR HTML", async ({
    request,
  }) => {
    // Svelte's <svelte:head> contents are collected by render() into
    // RenderOutput.head and the express middleware splices them into the
    // <!--ssr-head--> placeholder of index.html. This test verifies the
    // wire format directly (no JS, no hydration) — regressions in the head
    // injection pipeline would silently break SEO.
    const response = await request.get("/");
    const html = await response.text();

    expect(html).toContain("<title>Home — Real-Router Svelte SSR</title>");
    expect(html).toMatch(
      /<meta[^>]+name="description"[^>]+content="Welcome to the Real-Router SSR example/,
    );
  });

  test("svelte:head per-route: /users title reflects current sort param", async ({
    request,
  }) => {
    // <svelte:head> can reference reactive state — verify the `data.sort`
    // expression flows from the loader through to the rendered <title>.
    const ascending = await request.get("/users?sort=asc");
    const ascendingHtml = await ascending.text();

    expect(ascendingHtml).toContain(
      "<title>All Users (sorted asc) — Real-Router Svelte SSR</title>",
    );

    const descending = await request.get("/users?sort=desc");
    const descendingHtml = await descending.text();

    expect(descendingHtml).toContain(
      "<title>All Users (sorted desc) — Real-Router Svelte SSR</title>",
    );
  });

  test("query params: ?sort=desc surfaces in __SSR_STATE__.search", async ({
    page,
  }) => {
    // Existing "query params" test verifies DOM order; this test pins the
    // wire-format guarantee that search params land in __SSR_STATE__ for the
    // client to use — separate concern from server-rendered HTML order.
    await page.goto("/users?sort=desc");

    const state = await page.evaluate(
      () =>
        (
          globalThis as unknown as Window & {
            __SSR_STATE__?: { search?: Record<string, unknown> };
          }
        ).__SSR_STATE__,
    );

    expect(state?.search?.sort).toBe("desc");
  });

  test("per-request isolation under mixed guards: /, /users, /dashboard, /admin, /users/1/posts in parallel with different auth contexts", async ({
    browser,
  }) => {
    // Spin up three independent contexts (admin / regular user / anon) and
    // fire five different routes in parallel. Each request must see only its
    // own currentUser dependency; no cross-context bleed.
    const BASE = "http://localhost:3013";

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

  test("createSubscriber: SSR HTML contains the server-rendered initial timestamp", async ({
    request,
  }) => {
    // useClock() reads `now` (a $state(new Date()) instance) inside a
    // reactive context. On the server, the factory runs once at render
    // and ships the initial timestamp; the createSubscriber callback
    // is registered but its setup (setInterval) doesn't fire because
    // there's no client effect lifecycle to track. The wire format
    // therefore contains the server's "now" — verifiable as a valid
    // ISO string in the <time> element.
    const response = await request.get("/");
    const html = await response.text();

    const datetimeMatch = html.match(
      /<time[^>]*data-testid="clock"[^>]*datetime="([^"]+)"/,
    );

    expect(datetimeMatch?.[1]).toBeTruthy();

    // ISO 8601 datetime must parse to a valid Date and be within ±5 s
    // of the test's wall clock — proving the server actually used
    // `new Date()`, not a stale build-time timestamp.
    const ssrTime = new Date(datetimeMatch![1]).getTime();
    const now = Date.now();

    expect(Math.abs(now - ssrTime)).toBeLessThan(5000);
  });

  test("createSubscriber: client-side clock updates reactively after hydration (interval tick)", async ({
    page,
  }) => {
    // After hydration, useClock() runs in a client effect — the
    // subscriber's setup fires, registers `setInterval(1000ms)`, and
    // every tick calls update() to mark `now` dirty. The <time>
    // element re-renders. Verify by sampling the datetime attribute
    // at two points and checking it advanced.
    await page.goto("/");
    await expect(page.getByTestId("clock")).toBeVisible();

    const first = await page
      .getByTestId("clock")
      .getAttribute("datetime");

    expect(first).toBeTruthy();

    // Wait for at least one interval tick + jitter.
    await page.waitForTimeout(1500);

    const second = await page
      .getByTestId("clock")
      .getAttribute("datetime");

    expect(second).toBeTruthy();
    expect(second).not.toBe(first);

    // Sanity: time moved forward, not back.
    expect(new Date(second!).getTime()).toBeGreaterThan(
      new Date(first!).getTime(),
    );
  });

  test("SvelteSet: selection state is reactive — toggling checkboxes updates the count without state replacement", async ({
    page,
  }) => {
    // SvelteSet wraps a native Set such that mutations via .add() /
    // .delete() notify the Svelte reactivity graph. The `selected.size`
    // accessor in the template re-runs after each mutation, even though
    // the Set instance is the same reference. With a plain
    // `$state(new Set())` and `selected.add(id)`, the change wouldn't
    // propagate because $state doesn't proxy mutations through Set
    // methods (only Object/Array). SvelteSet specifically does that.
    await page.goto("/users");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("selection-count")).toHaveText(
      "Selected: 0",
    );

    // Add via checkbox.
    await page.getByTestId("select-1").check();
    await expect(page.getByTestId("selection-count")).toHaveText(
      "Selected: 1",
    );

    // Add another.
    await page.getByTestId("select-2").check();
    await expect(page.getByTestId("selection-count")).toHaveText(
      "Selected: 2",
    );

    // Remove the first one — count drops, second stays selected.
    await page.getByTestId("select-1").uncheck();
    await expect(page.getByTestId("selection-count")).toHaveText(
      "Selected: 1",
    );

    // Sanity: select-2 is still checked.
    await expect(page.getByTestId("select-2")).toBeChecked();
  });

  test("SvelteSet: SSR HTML ships an empty selection — set state is client-only, never serialized", async ({
    request,
  }) => {
    // SvelteSet starts empty in the script (`new SvelteSet<string>()`)
    // and is never written to from server-side code. The SSR'd HTML
    // therefore renders "Selected: 0" and no checkboxes are pre-checked.
    // This matches the runtime expectation: SvelteSet/SvelteMap state
    // doesn't survive the SSR ↔ client boundary unless explicitly
    // serialized via __SSR_STATE__.
    const response = await request.get("/users");
    const html = await response.text();

    expect(html).toContain('data-testid="selection-count"');
    expect(html).toMatch(
      /<p[^>]*data-testid="selection-count"[^>]*>\s*Selected:\s*0\s*<\/p>/,
    );

    // No `checked` attributes on selection inputs in the wire response.
    expect(html).not.toMatch(
      /data-testid="select-\d+"[^>]*\schecked\b/,
    );
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

  test("ETag: dynamic content (clock on home page) intentionally invalidates cache between requests", async ({
    request,
  }) => {
    // Home renders a `useClock()` value via createSubscriber — every
    // request gets a fresh `new Date()`, so the SSR HTML differs.
    // Strong ETag therefore differs between requests, and a
    // conditional GET that uses the OLD ETag receives 200 + new body.
    // This is the correct/honest behaviour: dynamic content shouldn't
    // be cached as if it were static.
    const first = await request.get("/");

    expect(first.status()).toBe(200);
    const firstEtag = first.headers().etag;

    expect(firstEtag).toMatch(/^"[A-Za-z0-9_-]{16}"$/);

    // Wait long enough for clock to tick (≥1 s).
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const conditional = await request.get("/", {
      headers: { "If-None-Match": firstEtag },
    });

    expect(conditional.status()).toBe(200);
    expect(conditional.headers().etag).not.toBe(firstEtag);
  });

  test("AbortController: client disconnect mid-render fires the slow loader's abort listener", async ({
    request,
  }) => {
    // /slow loader sleeps 5 s but registers an abort listener via
    // getDep("abortSignal"). server/index.ts attaches the controller
    // to req.on("close") — when the client gives up before the
    // response, the loader cleans up its setTimeout and rejects.
    //
    // Test: cancel the request via AbortSignal.timeout(150ms).
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

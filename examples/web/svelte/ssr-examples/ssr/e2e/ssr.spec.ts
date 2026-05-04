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

  test("loader fires on hydration: deep-link → full reload preserves data after JS boot", async ({
    page,
  }) => {
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
      { name: "userId", value: "1", url: "http://localhost:3000" },
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

  test("query params: ?sort=desc surfaces in __SSR_STATE__.params", async ({
    page,
  }) => {
    // Existing "query params" test verifies DOM order; this test pins the
    // wire-format guarantee that params land in __SSR_STATE__ for the client
    // to use — separate concern from server-rendered HTML order.
    await page.goto("/users?sort=desc");

    const state = await page.evaluate(
      () =>
        (
          globalThis as unknown as Window & {
            __SSR_STATE__?: { params?: Record<string, unknown> };
          }
        ).__SSR_STATE__,
    );

    expect(state?.params?.sort).toBe("desc");
  });

  test("per-request isolation under mixed guards: /, /users, /dashboard, /admin, /users/1/posts in parallel with different auth contexts", async ({
    browser,
  }) => {
    // Spin up three independent contexts (admin / regular user / anon) and
    // fire five different routes in parallel. Each request must see only its
    // own currentUser dependency; no cross-context bleed.
    const BASE = "http://localhost:3000";

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
});

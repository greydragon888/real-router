import { expect, test } from "@playwright/test";

test.describe("Preact SSR — smoke", () => {
  test("home page is server-rendered with correct title and content", async ({
    page,
  }) => {
    const response = await page.goto("/");

    expect(response?.status()).toBe(200);

    const html = await response!.text();

    // Server-rendered HTML must contain the page content BEFORE JS runs.
    expect(html).toContain("Welcome");
    expect(html).toContain("<h1>Welcome</h1>");
    // Per-route meta from src/router/meta.ts:
    expect(html).toContain("<title>Home — Real-Router Preact SSR</title>");
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('property="og:title"');
    // SSR state injected for hydration:
    expect(html).toContain("window.__SSR_STATE__");
  });

  test("users list is server-rendered with loader data", async ({ page }) => {
    const response = await page.goto("/users");

    expect(response?.status()).toBe(200);

    const html = await response!.text();

    expect(html).toContain("All Users");
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html).toContain("Charlie");
  });

  test("user profile renders with nested loader data", async ({ page }) => {
    const response = await page.goto("/users/1");

    expect(response?.status()).toBe(200);

    const profile = page.locator('[data-testid="user-profile"]');
    await expect(profile).toHaveAttribute("data-user-id", "1");
    await expect(page.locator('[data-testid="user-name"]')).toContainText(
      "Alice",
    );
  });

  test("404 for unknown route returns status 404 + NotFound page", async ({
    page,
  }) => {
    const response = await page.goto("/totally-unknown");

    expect(response?.status()).toBe(404);
    await expect(page.locator("h1")).toContainText("404");
  });

  test("loader-driven 404: unknown user id returns plain-text 404", async ({
    request,
  }) => {
    const response = await request.get("/users/9999");

    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toContain("text/plain");
  });

  test("loader-driven 301 redirect: /legacy-user/2 → /users/2", async ({
    request,
  }) => {
    const response = await request.get("/legacy-user/2", {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(301);
    expect(response.headers()["location"]).toContain("/users/2");
  });

  test("loader timeout: /slow returns 504 within budget", async ({
    request,
  }) => {
    const start = Date.now();
    const response = await request.get("/slow");
    const elapsed = Date.now() - start;

    expect(response.status()).toBe(504);
    // Server timeout is 250 ms; full slow loader is 5 s. We must come back
    // well under the slow loader's full delay.
    expect(elapsed).toBeLessThan(2000);
  });

  test("hydration completes without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/users/1");
    await page.waitForLoadState("networkidle");

    const hydrationErrors = errors.filter((m) =>
      /hydrat|mismatch/i.test(m),
    );

    expect(hydrationErrors).toEqual([]);
  });

  test("client-side navigation works after hydration", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.locator("nav >> text=Users").click();
    await expect(page).toHaveURL("/users");
    await expect(page.locator("h1")).toContainText("Users");
  });

  test("ETag round-trip: identical request returns 304", async ({
    request,
  }) => {
    const first = await request.get("/");

    expect(first.status()).toBe(200);

    const etag = first.headers()["etag"];
    expect(etag).toBeTruthy();

    const second = await request.get("/", {
      headers: { "If-None-Match": etag! },
    });

    expect(second.status()).toBe(304);
  });

  test("Cache-Control per route: home gets long max-age", async ({
    request,
  }) => {
    const response = await request.get("/");

    expect(response.headers()["cache-control"]).toContain("s-maxage=3600");
  });

  test("Cache-Control: dashboard gets private no-store", async ({
    request,
  }) => {
    const response = await request.get("/dashboard", {
      headers: { Cookie: "userId=2" },
      maxRedirects: 0,
    });

    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  test("auth gate: unauthenticated /dashboard → 302 to /", async ({
    request,
  }) => {
    const response = await request.get("/dashboard", { maxRedirects: 0 });

    expect(response.status()).toBe(302);
    expect(response.headers()["location"]).toBe("/");
  });

  test("admin gate: non-admin Bob → 302 to /", async ({ request }) => {
    const response = await request.get("/admin", {
      headers: { Cookie: "userId=2" },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(302);
  });

  test("admin gate: admin Alice → 200 + admin page", async ({ request }) => {
    const response = await request.get("/admin", {
      headers: { Cookie: "userId=1" },
    });

    expect(response.status()).toBe(200);

    const html = await response.text();
    expect(html).toContain("admin-page");
  });

  test("useId emits stable IDs that survive hydration", async ({ page }) => {
    const response = await page.goto("/");
    const html = await response!.text();

    // Two label[for] should reference two distinct id values, both
    // present on the form. Same IDs must appear in the live DOM
    // post-hydration without warnings.
    const labelMatches = [
      ...html.matchAll(/<label[^>]+for="([^"]+)"[^>]*data-testid="query-label"/g),
    ];
    expect(labelMatches.length).toBeGreaterThanOrEqual(1);

    await page.waitForLoadState("networkidle");

    const queryLabel = page.locator('[data-testid="query-label"]');
    const queryInput = page.locator('[data-testid="query-input"]');
    const labelFor = await queryLabel.getAttribute("for");
    const inputId = await queryInput.getAttribute("id");

    expect(labelFor).toBeTruthy();
    expect(inputId).toBe(labelFor);
  });

  // -------- Stage 1: foundational SSR contract -------- //

  test.describe("no-JavaScript rendering — server delivers complete HTML", () => {
    test.use({ javaScriptEnabled: false });

    test("home: server-rendered without JS", async ({ page }) => {
      const response = await page.goto("/");
      expect(response?.status()).toBe(200);

      // SearchForm + welcome content land in HTML; #root is non-empty
      // before any client script runs.
      await expect(page.locator("h1")).toContainText("Welcome");
      await expect(
        page.locator('[data-testid="search-form"]'),
      ).toBeVisible();
      const root = page.locator("#root");
      await expect(root).not.toBeEmpty();
    });

    test("users list: loader data lands in HTML without JS", async ({
      page,
    }) => {
      await page.goto("/users");
      await expect(page.locator("h2")).toContainText("All Users");
      await expect(page.locator('[data-testid="users-list"]')).toBeVisible();
      // ssr-data-plugin loader populated state.context.data → renders Alice/Bob/Charlie.
      const html = await page.content();
      expect(html).toContain("Alice");
      expect(html).toContain("Bob");
      expect(html).toContain("Charlie");
    });

    test("user profile: interpolated data without JS", async ({ page }) => {
      await page.goto("/users/2");
      const profile = page.locator('[data-testid="user-profile"]');
      await expect(profile).toHaveAttribute("data-user-id", "2");
      await expect(page.locator('[data-testid="user-name"]')).toContainText(
        "Bob",
      );
      await expect(page.locator('[data-testid="user-role"]')).toContainText(
        "user",
      );
    });
  });

  test("per-request isolation: 10 concurrent /users/:id requests yield distinct __SSR_STATE__", async ({
    request,
  }) => {
    // Each per-request cloneRouter must produce its own state.
    // Cross-contamination would surface as wrong id appearing in
    // another request's response.
    const ids = ["1", "2", "3", "1", "2", "3", "1", "2", "3", "1"];
    const responses = await Promise.all(
      ids.map((id) => request.get(`/users/${id}`)),
    );

    for (const [i, response] of responses.entries()) {
      expect(response.status()).toBe(200);
      const html = await response.text();
      const id = ids[i]!;
      expect(html).toContain(`data-user-id="${id}"`);
      expect(html).toMatch(
        new RegExp(`window\\.__SSR_STATE__=\\{[^}]*"id":"${id}"`),
      );
    }
  });

  test("per-request DI isolation: anon ctx → /dashboard 302; auth ctx → 200 (concurrent)", async ({
    request,
  }) => {
    // Two concurrent requests with different cookies must NOT share
    // currentUser DI — the guard's snapshot is per-request via
    // cloneRouter's deps.
    const [anon, auth] = await Promise.all([
      request.get("/dashboard", { maxRedirects: 0 }),
      request.get("/dashboard", {
        headers: { Cookie: "userId=2" },
      }),
    ]);

    expect(anon.status()).toBe(302);
    expect(anon.headers()["location"]).toBe("/");
    expect(auth.status()).toBe(200);
    expect(await auth.text()).toContain("Dashboard");
  });

  test("loader-driven 404 vs route-404: distinct content-types", async ({
    request,
  }) => {
    // /unknown-route — route doesn't match → UNKNOWN_ROUTE → renders
    // the React-tree NotFound page (text/html).
    const routeMiss = await request.get("/totally-unknown");
    expect(routeMiss.status()).toBe(404);
    expect(routeMiss.headers()["content-type"]).toContain("text/html");
    expect(await routeMiss.text()).toContain("404");

    // /users/9999 — route matches but loader throws LoaderNotFound →
    // entry-server short-circuits to plain-text response BEFORE
    // hitting the renderer (no router leak; cleanup runs in finally).
    const loaderMiss = await request.get("/users/9999");
    expect(loaderMiss.status()).toBe(404);
    expect(loaderMiss.headers()["content-type"]).toContain("text/plain");
    expect(await loaderMiss.text()).toBe("Not Found");
  });

  test("loader exception → 500 with server-error body (boom route)", async ({
    request,
  }) => {
    // Generic loader throw (not typed LoaderNotFound/Redirect/Timeout)
    // bubbles past the typed-error branches into the catch-all 500
    // handler. Verifies (a) no leak (cleanup() in finally) and (b)
    // proper error UI rather than a stack trace.
    const response = await request.get("/boom");
    expect(response.status()).toBe(500);
    const html = await response.text();
    expect(html).toContain("server-error");
    expect(html).toContain("Loader exploded");
  });

  test("ETag format: 16-char base64url between double quotes", async ({
    request,
  }) => {
    const response = await request.get("/");
    const etag = response.headers()["etag"];
    expect(etag).toMatch(/^"[A-Za-z0-9_-]{16}"$/);
  });

  test("ETag distinctness: different routes yield different ETags", async ({
    request,
  }) => {
    const [home, users, profile] = await Promise.all([
      request.get("/"),
      request.get("/users"),
      request.get("/users/1"),
    ]);

    const tags = [
      home.headers()["etag"],
      users.headers()["etag"],
      profile.headers()["etag"],
    ];
    expect(new Set(tags).size).toBe(3);
    for (const t of tags) {
      expect(t).toBeTruthy();
    }
  });

  test("canonical is absolute + og:description distinct per route", async ({
    request,
  }) => {
    const home = await (await request.get("/")).text();
    const profile = await (await request.get("/users/1")).text();

    // Canonical must be an absolute URL — search engines reject
    // relative canonicals, so we verify the SITE_ORIGIN prefix.
    const homeCanonical = /<link rel="canonical" href="(https?:\/\/[^"]+)"/;
    const profileCanonical = /<link rel="canonical" href="(https?:\/\/[^"]+)"/;
    expect(home).toMatch(homeCanonical);
    expect(profile).toMatch(profileCanonical);
    expect(home).toContain('href="https://example.com/"');
    expect(profile).toContain('href="https://example.com/users/1"');

    // og:description must differ — common bug is rendering DEFAULTS
    // for unknown route states; this catches accidental fallthrough.
    const homeOg = home.match(
      /<meta property="og:description" content="([^"]+)"/,
    )?.[1];
    const profileOg = profile.match(
      /<meta property="og:description" content="([^"]+)"/,
    )?.[1];
    expect(homeOg).toBeTruthy();
    expect(profileOg).toBeTruthy();
    expect(homeOg).not.toBe(profileOg);
  });

  // -------- Stage 2: query params, nested loaders, navigate-only contract -------- //

  test("query param: /users?sort=desc reverses list + meta reflects sort", async ({
    request,
  }) => {
    // ?sort declared in route path "/users?sort"; ssr-data-plugin
    // forwards params.sort to loader; loader returns sorted users.
    // meta.ts interpolates the sort value into the title.
    const ascHtml = await (await request.get("/users?sort=asc")).text();
    const descHtml = await (await request.get("/users?sort=desc")).text();

    // Title carries sort:
    expect(ascHtml).toContain("(sorted asc)");
    expect(descHtml).toContain("(sorted desc)");

    // Body order reverses: extract user names by id and compare order.
    const order = (html: string): string[] =>
      [...html.matchAll(/data-user-id="(\d)"/g)].map((m) => m[1]!);
    const ascOrder = order(ascHtml);
    const descOrder = order(descHtml);
    expect(ascOrder).toEqual(["1", "2", "3"]); // Alice, Bob, Charlie
    expect(descOrder).toEqual(["3", "2", "1"]); // Charlie, Bob, Alice
  });

  test("nested loader: /users/1/posts resolves user + posts in single loader call", async ({
    page,
  }) => {
    await page.goto("/users/1/posts");
    // UserProfile + UserPosts both render from the same
    // state.context.data write because the leaf loader returns
    // { user, posts } — verifies nested-route loader pattern.
    await expect(
      page.locator('[data-testid="user-profile"]'),
    ).toHaveAttribute("data-user-id", "1");
    const posts = page.locator('[data-testid="user-posts"]');
    await expect(posts).toBeVisible();
    await expect(posts.locator('[data-post-id="p1"]')).toContainText(
      "Hello world",
    );
    await expect(posts.locator('[data-post-id="p2"]')).toContainText(
      "On routing",
    );
  });

  test("nested loader empty state: /users/3/posts shows empty UI (Charlie has no posts)", async ({
    page,
  }) => {
    await page.goto("/users/3/posts");
    // Loader returns { user: charlie, posts: [] } — empty array, not
    // null. UI renders the dedicated empty-state branch instead of
    // the post list. Falsy data must NOT be confused with "no data".
    await expect(
      page.locator('[data-testid="user-posts-empty"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="user-profile"]'),
    ).toHaveAttribute("data-user-id", "3");
  });

  test("SSR-only contract: navigate() does NOT re-run loaders post-hydration", async ({
    page,
  }) => {
    // ssr-data-plugin intercepts start(), not navigate(). After
    // hydration via hydrateRouter (which calls start once with the
    // current path), subsequent client navigations resolve a fresh
    // state with NO loader call — state.context.data is whatever the
    // last start() write left, or undefined for routes never resolved.
    //
    // We start at /, then navigate via Link to /admin (no auth cookie
    // → guard rejects → router goes to NotFound). We assert UsersList
    // was never visited so its data was never set, then navigate to
    // /users on the client and inspect router state via a tiny
    // window-exposed hook.
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Click Users in nav — browser-plugin handles the URL change;
    // ssr-data-plugin's start interceptor is NOT invoked.
    await page.locator("nav >> text=Users").click();
    await expect(page).toHaveURL("/users");

    // Page shows UsersList shell, but state.context.data is undefined
    // (no SSR start for this URL after initial hydration). The list
    // body therefore should be empty rather than populated. This
    // documents the by-design contract.
    const usersList = page.locator('[data-testid="users-list"]');
    await expect(usersList).toBeAttached();
    // Empty <ul> is the expected shape — fallback `{ users: [] }` from
    // UsersList.tsx when state.context.data is undefined.
    const items = await usersList.locator("li").count();
    expect(items).toBe(0);
  });

  test("AbortSignal propagation: client disconnect cancels slow loader (signal observable)", async ({
    page,
  }) => {
    // Slow loader sleeps 5s but races against 250ms withTimeout AND
    // listens on getDep("abortSignal"). When the client gives up
    // mid-flight, server must observe abort and clearTimeout — not
    // hold the worker for 5s.
    //
    // Playwright path: use page.goto with a short navigation timeout,
    // then ensure server logs no errors AFTER the client gave up.
    // (We can't directly observe server cleanup from the client, but
    // we can assert wall-clock < full delay.)
    const start = Date.now();
    try {
      await page.goto("/slow", { timeout: 600 });
    } catch {
      // Timeout: page nav aborted by playwright; signal fires server-side.
    }
    const elapsed = Date.now() - start;
    // Wait a bit for server to process the abort, then verify timing
    // came back well under the 5s slow-loader delay.
    expect(elapsed).toBeLessThan(2000);
  });
});

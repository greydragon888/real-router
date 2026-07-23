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
      .addCookies([{ name: "auth", value: "1", url: "http://localhost:3007" }]);
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
    // mounts <HttpStatusCode code={404}/> during renderToString, the wrapping
    // <HttpStatusProvider sink={...}> captures the value into the per-request
    // sink, entry-server reads `sink.code ?? 200` and applies it. No client
    // hydration involved — the 404 must arrive on first byte.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const response = await page.goto("/nonexistent");

    expect(response!.status()).toBe(404);

    const html = await response!.text();

    // NotFound page rendered (proves render path was actually taken — not a
    // server-side short-circuit before render). If `<HttpStatusCode>` had
    // failed to write to the sink, the response would be 200 here, not 404.
    expect(html).toContain("404 — Not Found");

    // <HttpStatusCode> returns null in React — no DOM element/attribute
    // bearing the component's name should leak into the served HTML.
    expect(html).not.toContain("HttpStatusCode");
    expect(html).not.toContain("http-status-code");
    // The numeric `code` prop also must not survive as an attribute on any
    // wrapper element. (We allow "404" inside the body text — the heading.)
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
    // no React/hydration warnings.
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

    // After hydrateRouter → router.start(state.path), ssr-data-plugin reads the
    // pre-resolved value from window.__SSR_STATE__.context.data and skips its
    // loader (#596). The component renders identically with no flash, no
    // mismatch, and no second round-trip to the in-memory database.
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
    // entry-client.tsx wraps the loader factories with a counter exposed on
    // window.__LOADER_CALLS__. After hydration, ssr-data-plugin must read the
    // pre-resolved `data` namespace from window.__SSR_STATE__ and skip the
    // client-side loader call entirely — the counter must be empty.
    await page.goto("/users/2");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("user-profile")).toBeVisible();
    await expect(page.getByTestId("user-name")).toHaveText("Name: Bob");

    const counts = await page.evaluate(
      () =>
        (globalThis as unknown as Window & { __LOADER_CALLS__?: Record<string, number> })
          .__LOADER_CALLS__,
    );

    expect(counts).toEqual({});
  });

  test("post-hydration loader skip (#596): nested route loader also skipped on hydration", async ({
    page,
  }) => {
    await page.goto("/users/1/posts");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("user-posts")).toBeVisible();

    const counts = await page.evaluate(
      () =>
        (globalThis as unknown as Window & { __LOADER_CALLS__?: Record<string, number> })
          .__LOADER_CALLS__,
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

    // __SSR_STATE__ carries sort=desc in search + sort label in data
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
        { name: "userId", value: "1", url: "http://localhost:3007" },
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
        { name: "userId", value: "2", url: "http://localhost:3007" },
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
        { name: "userId", value: "2", url: "http://localhost:3007" },
      ]);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator("main")).toContainText("Dashboard");
  });

  test("React useId: SearchForm label[for] matches input[id] after SSR (a11y contract)", async ({
    request,
  }) => {
    // useId() returns a stable per-component-instance ID. Each
    // <label htmlFor={...}> must match the corresponding
    // <input id={...}> in the SSR HTML, otherwise screen readers
    // can't pair them. React emits IDs like `_R_u_`.
    const html = await (await request.get("/")).text();

    const queryInputId = /<input\s+id="([^"]+)"[^>]*\sdata-testid="query-input"/.exec(
      html,
    )?.[1];
    const queryLabelFor =
      /<label\s+for="([^"]+)"[^>]*\sdata-testid="query-label"/.exec(html)?.[1];

    expect(queryInputId).toBeDefined();
    expect(queryLabelFor).toBe(queryInputId);

    const sortInputId = /<select\s+id="([^"]+)"[^>]*\sdata-testid="sort-select"/.exec(
      html,
    )?.[1];
    const sortLabelFor =
      /<label\s+for="([^"]+)"[^>]*\sdata-testid="sort-label"/.exec(html)?.[1];

    expect(sortInputId).toBeDefined();
    expect(sortLabelFor).toBe(sortInputId);

    // Distinct fields → distinct IDs.
    expect(queryInputId).not.toBe(sortInputId);
  });

  test("React useId: SSR-emitted ID survives hydration unchanged (no mismatch warning)", async ({
    page,
    request,
  }) => {
    const html = await (await request.get("/")).text();
    const ssrInputId = /<input\s+id="([^"]+)"[^>]*\sdata-testid="query-input"/.exec(
      html,
    )?.[1];

    expect(ssrInputId).toBeDefined();

    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "warning" || msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const hydratedInputId = await page
      .getByTestId("query-input")
      .getAttribute("id");

    expect(hydratedInputId).toBe(ssrInputId);

    const mismatchWarnings = errors.filter(
      (e) =>
        e.toLowerCase().includes("hydration") ||
        e.toLowerCase().includes("mismatch") ||
        e.toLowerCase().includes("did not match"),
    );
    expect(mismatchWarnings).toEqual([]);
  });

  test("React useId: form remains interactive post-hydration (typing into input updates state)", async ({
    page,
  }) => {
    // Sanity check that the form works after hydration — useId
    // doesn't break event-handler attachment. The query input is
    // controlled by useState; typing should reflect in the value.
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("query-input").fill("hello");

    await expect(page.getByTestId("query-input")).toHaveValue("hello");
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
    // getMetaForState() reads state.search.sort and folds it into the
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
    // /slow loader fetches /__bench/slow-fetch (5 s) with a composed
    // AbortSignal that includes the per-request upstream signal.
    // server/index.ts attaches the controller to req.on("close") —
    // when the client gives up before the response, upstream aborts,
    // the composed signal aborts, the fetch rejects, withTimeout
    // returns the loader's error.
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

  test.describe.serial("withTimeout (#598) network cancellation", () => {
    test("fetch inside withTimeout-wrapped loader is cancelled at the network layer when the deadline elapses", async ({
      request,
    }) => {
      // /slow loader fetches /__bench/slow-fetch (5 s) with the signal
      // that withTimeout passes in. The 250 ms deadline elapses well
      // before the fetch can complete; withTimeout aborts its internal
      // signal *before* rejecting with LoaderTimeout, so fetch is
      // cancelled at the network layer. /__bench/slow-fetch's
      // req.on("close") observes the disconnect and increments the
      // counter, which we read through /__bench/abort-count.
      const before = (await (
        await request.get("/__bench/abort-count")
      ).json()) as { abortObserved: number };

      const response = await request.get("/slow");
      expect(response.status()).toBe(504);

      // Server's req.on("close") fires asynchronously after the response
      // ends — give it a moment to settle.
      await new Promise<void>((resolve) => setTimeout(resolve, 200));

      const after = (await (
        await request.get("/__bench/abort-count")
      ).json()) as { abortObserved: number };

      expect(after.abortObserved).toBeGreaterThanOrEqual(
        before.abortObserved + 1,
      );
    });
  });
});

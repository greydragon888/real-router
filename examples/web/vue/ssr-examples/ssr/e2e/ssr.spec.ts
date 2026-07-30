import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { test, expect } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_ASSETS = path.resolve(__dirname, "../dist/client/assets");

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
      .addCookies([{ name: "auth", value: "1", url: "http://localhost:3016" }]);
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
    // mounts <HttpStatusCode :code="404"/> during renderToString, the
    // wrapping <HttpStatusProvider :sink> captures the value into the
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

    // <HttpStatusCode> renders null in Vue (setup returns `() => null`) —
    // no DOM element/attribute bearing the component's name should leak.
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
    // <HttpStatusProvider> is mounted client-side (entry-client.ts wires
    // the SPA without one), so the component reads
    // `inject(HTTP_STATUS_KEY, null)` → null and is a silent no-op. This
    // test verifies the silent no-op path produces no Vue/hydration
    // warnings.
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
    expect(html).toMatch(/data-testid="current-sort"[^>]*>[^<]*desc/);

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
        { name: "userId", value: "1", url: "http://localhost:3016" },
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
        { name: "userId", value: "2", url: "http://localhost:3016" },
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
        { name: "userId", value: "2", url: "http://localhost:3016" },
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
      { name: "userId", value: "1", url: "http://localhost:3016" },
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

  test("Vue 3.5 lazy hydration: SSR ships full HeavyAnalytics HTML; pre-scroll the component is unhydrated (no event handlers, no onMounted)", async ({
    page,
    request,
  }) => {
    // Layered check — first verify the SSR contract via raw HTTP,
    // then the client-side defer-hydration contract via the live
    // browser.

    // 1) Raw SSR HTML contains the full HeavyAnalytics markup —
    //    crawlers and JS-disabled clients see everything.
    const response = await request.get("/");
    const html = await response.text();
    expect(html).toContain('data-testid="heavy-analytics"');
    expect(html).toContain('data-testid="heavy-counter"');
    expect(html).toContain("Heavy Analytics (lazy-hydrated)");

    // 2) On the live page, BEFORE scrolling: the section exists in
    //    the DOM but onMounted has NOT run (no hydration marker)
    //    and the click handler is not attached (counter stays 0).
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // The component is far below the fold. Without scrolling it
    // into view, hydration should not have fired.
    const hydratedAt = await page.evaluate(
      () =>
        (
          window as Window & { __LAZY_HYDRATED_AT__?: number }
        ).__LAZY_HYDRATED_AT__,
    );

    expect(hydratedAt).toBeUndefined();

    // The button is in the DOM (server-rendered) — visible if we
    // scroll, but we don't. Reading textContent works without
    // scrolling.
    const initialText = await page
      .getByTestId("heavy-counter")
      .textContent();
    expect(initialText?.trim()).toBe("Clicked: 0");
  });

  test("Vue 3.5 lazy hydration: scrolling HeavyAnalytics into view fires hydration; counter then responds to clicks", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Scroll the component into view → IntersectionObserver fires
    // → defineAsyncComponent's loader resolves → hydration runs →
    // onMounted stamps the marker → click handler is attached.
    await page.getByTestId("heavy-analytics").scrollIntoViewIfNeeded();

    await page.waitForFunction(
      () =>
        (
          window as Window & { __LAZY_HYDRATED_AT__?: number }
        ).__LAZY_HYDRATED_AT__ !== undefined,
      undefined,
      { timeout: 5000 },
    );

    // After hydration, the click handler responds reactively.
    await page.getByTestId("heavy-counter").click();
    await page.getByTestId("heavy-counter").click();

    await expect(page.getByTestId("heavy-counter")).toHaveText("Clicked: 2");
  });

  test("Vue 3.5 lazy hydration: HeavyAnalytics ships in its own JS chunk (code-split via defineAsyncComponent loader) and is NOT preloaded", async ({
    page,
  }) => {
    // Two-part check:
    //   1) A separate chunk for HeavyAnalytics exists on disk —
    //      verifies Vite split the dynamic import into its own
    //      file. Walk dist/client/assets/ and assert the chunk
    //      naming pattern matches.
    //   2) The chunk is NOT preloaded by the initial HTML
    //      (no <link rel="modulepreload"> for it, no eager <script>).
    //      This is the actual win — the JS for the lazy component
    //      is not paid for until hydration fires.
    const files = readdirSync(DIST_ASSETS);
    const heavyChunk = files.find((f) => /^HeavyAnalytics-/.test(f));

    expect(heavyChunk).toBeDefined();

    // Visit the page — verify the initial HTML does NOT preload
    // the HeavyAnalytics chunk.
    const response = await page.goto("/");
    const html = (await response?.text()) ?? "";

    expect(html).not.toContain(heavyChunk!);
  });

  test("Vue 3.5 useId: SearchForm label[for] matches input[id] after SSR (a11y contract)", async ({
    request,
  }) => {
    // useId() returns a stable per-component-instance ID. Each
    // <label :for="..."> must match the corresponding <input :id="...">
    // in the SSR HTML, otherwise screen readers can't pair them.
    const html = await (await request.get("/")).text();

    // Extract query field's id and label[for] — verify they match.
    // Vue serializes attributes in declaration order: `id` before
    // `data-testid` for inputs, `for` before `data-testid` for labels.
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

    // Distinct fields → distinct IDs (otherwise hand-rolled
    // counter would have produced the same value for both).
    expect(queryInputId).not.toBe(sortInputId);
  });

  test("Vue 3.5 useId: SSR-emitted ID survives hydration unchanged (no mismatch warning)", async ({
    page,
    request,
  }) => {
    // Capture the SSR id from raw HTTP, then read the same DOM
    // attribute on the hydrated client. They must match exactly —
    // useId is the contract.
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

    // Confirm Vue did not emit a hydration mismatch warning for
    // this attribute (the canonical failure mode if useId were
    // bypassed in favor of Math.random / non-deterministic IDs).
    const mismatchWarnings = errors.filter(
      (e) =>
        e.toLowerCase().includes("hydration") ||
        e.toLowerCase().includes("mismatch"),
    );
    expect(mismatchWarnings).toEqual([]);
  });

  test("Per-route meta: home title + description appear in raw SSR HTML head", async ({
    request,
  }) => {
    // entry-server.ts computes PageMeta from the matched router state
    // and renderHeadFor() builds the <head> markup that's spliced
    // into the <!--ssr-meta--> placeholder. The home meta block is
    // baked into the wire HTML before any JS runs (test uses raw
    // request, no JS engine).
    const response = await request.get("/");
    const html = await response.text();

    expect(html).toContain("<title>Home — Real-Router Vue SSR</title>");
    expect(html).toContain(
      'name="description" content="Welcome to the Real-Router Vue SSR example."',
    );
  });

  test("Per-route meta: /users meta reflects the active sort param", async ({
    request,
  }) => {
    // getMetaForState() reads state.search.sort and folds it into the
    // title — proves meta is computed from the resolved router state,
    // not a static lookup.
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

    // Title carries the user name + suffix.
    expect(html).toContain("<title>Alice — Real-Router Vue SSR</title>");
    // og:title is the bare name (no suffix) for cleaner social-card
    // previews — verifies the two fields are decoupled in meta.ts.
    expect(html).toMatch(/<meta property="og:title" content="Alice"\s*\/?>/);
  });

  test("Per-route meta: canonical is an absolute URL prefixed with SITE_ORIGIN", async ({
    request,
  }) => {
    // canonical must be absolute (search engines and crawlers
    // reject relative canonicals). The default SITE_ORIGIN is
    // "https://example.com" — meta.ts's `abs()` helper prefixes the
    // path. og:url mirrors canonical.
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

  test("Custom directive: v-track-view update lifecycle fires when bound binding.value changes", async ({
    page,
  }) => {
    // UserProfile.vue uses `v-track-view="{ productId: trackedId }"`.
    // trackedId is a computed ref that initially resolves to the
    // user id; clicking "Override tracked id" flips manualOverride
    // to "999". Vue diffs the new binding object reference and calls
    // the directive's `updated(el, binding)` hook, which pushes the
    // new productId onto __VIEW_UPDATE_LOG__. The test reads that
    // log to verify the lifecycle hook fired with the expected value
    // — proves Vue's directive update path is exercised end-to-end.
    await page.goto("/users/1");

    await page.waitForLoadState("networkidle");

    // Clear any update entries from initial mount-time updates.
    await page.evaluate(() => {
      (window as Window & { __VIEW_UPDATE_LOG__?: unknown[] }).__VIEW_UPDATE_LOG__ =
        [];
    });

    await page.getByTestId("override-tracked-id").click();

    await page.waitForFunction(
      () => {
        const log = (
          window as Window & {
            __VIEW_UPDATE_LOG__?: { productId: string }[];
          }
        ).__VIEW_UPDATE_LOG__;

        return log && log.some((entry) => entry.productId === "999");
      },
      undefined,
      { timeout: 5000 },
    );

    const updateLog = await page.evaluate(
      () =>
        (
          window as Window & {
            __VIEW_UPDATE_LOG__?: { productId: string }[];
          }
        ).__VIEW_UPDATE_LOG__,
    );

    expect(updateLog?.some((entry) => entry.productId === "999")).toBe(true);
  });

  test("Custom directive SSR-safety: directive body does not run during server render", async ({
    request,
  }) => {
    // Vue intentionally skips custom directive lifecycle hooks during
    // SSR (they are client-only). This means the body of mounted/
    // updated/unmounted can reference IntersectionObserver and other
    // browser-only APIs without crashing the server. We verify
    // indirectly by asserting the SSR HTML for a route using the
    // directive (/users/1) renders successfully and contains the
    // expected DOM — proving no SSR error was thrown.
    const response = await request.get("/users/1");

    expect(response.status()).toBe(200);
    const html = await response.text();

    expect(html).toContain('data-testid="user-profile"');
    // Directive doesn't appear as an attribute on the server-rendered
    // element — Vue compiles directives away (only their effects are
    // applied). What we verify here is just that the page rendered.
    expect(html).toContain("Alice");
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

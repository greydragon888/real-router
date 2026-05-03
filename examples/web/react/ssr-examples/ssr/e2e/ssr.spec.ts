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
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
      { id: "3", name: "Charlie" },
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
    expect(ssrState.context?.data?.user).toEqual({ id: "2", name: "Bob" });

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
});

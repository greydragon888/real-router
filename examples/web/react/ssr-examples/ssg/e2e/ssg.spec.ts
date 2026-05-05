import { test, expect } from "@playwright/test";

test.describe("SSG", () => {
  test("static HTML contains pre-rendered home page", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/");

    await expect(page.locator("nav")).toContainText("Home");
    await expect(page.locator("main")).toContainText("Welcome");

    await context.close();
  });

  test("static HTML contains pre-rendered users list", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/users");

    await expect(page.locator("main")).toContainText("Alice");
    await expect(page.locator("main")).toContainText("Bob");
    await expect(page.locator("main")).toContainText("Charlie");

    await context.close();
  });

  test("dynamic routes are pre-rendered with correct data", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/users/1");

    await expect(page.locator("main")).toContainText("User Profile");
    await expect(page.locator("main")).toContainText("Alice");

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

  test("loader output is baked into static HTML and __SSR_STATE__", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    const response = await page.goto("/users");
    const html = await response!.text();

    // 1. HTML body has loader's resolved users — pure static, no JS.
    expect(html).toMatch(/Alice/);
    expect(html).toMatch(/Bob/);
    expect(html).toMatch(/Charlie/);

    // 2. __SSR_STATE__ JSON carries state.context.data verbatim.
    const ssrStateMatch = html.match(/window\.__SSR_STATE__=({.*?})<\/script>/);

    expect(ssrStateMatch?.[1]).toBeDefined();

    const ssrState = JSON.parse(ssrStateMatch![1]) as {
      name: string;
      path: string;
      context?: { data?: { users?: { id: string; name: string }[] } };
    };

    expect(ssrState.name).toBe("users");
    expect(ssrState.path).toBe("/users");
    expect(ssrState.context?.data?.users).toEqual([
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
      { id: "3", name: "Charlie" },
    ]);

    await context.close();
  });

  test("dynamic-route loader output is baked into __SSR_STATE__ per pre-rendered URL", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    for (const id of ["1", "2", "3"]) {
      const response = await page.goto(`/users/${id}`);
      const html = await response!.text();
      const ssrStateMatch = html.match(
        /window\.__SSR_STATE__=({.*?})<\/script>/,
      );

      expect(ssrStateMatch?.[1]).toBeDefined();

      const ssrState = JSON.parse(ssrStateMatch![1]) as {
        params: { id: string };
        context?: { data?: { user?: { id: string; name: string } } };
      };

      expect(ssrState.params.id).toBe(id);
      expect(ssrState.context?.data?.user?.id).toBe(id);
      expect(ssrState.context?.data?.user?.name).toBeDefined();
    }

    await context.close();
  });

  test("build determinism: every pre-rendered HTML embeds canonical __SSR_STATE__ shape", async ({
    request,
  }) => {
    const paths = ["/", "/users", "/users/1", "/users/2", "/users/3"];

    for (const path of paths) {
      const response = await request.get(path);

      expect(response.status(), `GET ${path}`).toBe(200);

      const html = await response.text();

      expect(html, `${path} __SSR_STATE__ presence`).toContain(
        "window.__SSR_STATE__",
      );
      expect(html, `${path} no transition`).not.toContain('"transition"');
    }
  });

  test("per-page meta tags: home, users list, dynamic profile carry distinct title + description", async ({
    request,
  }) => {
    const cases = [
      {
        path: "/",
        title: "Home — Real-Router SSG",
        description: "Welcome page of the Real-Router SSG demo.",
      },
      {
        path: "/users/",
        title: "All Users — Real-Router SSG",
        description: "Browse the full list of pre-rendered users.",
      },
      {
        path: "/users/1/",
        title: "Alice — Real-Router SSG",
        description: "Profile page for Alice (id: 1).",
      },
      {
        path: "/users/3/",
        title: "Charlie — Real-Router SSG",
        description: "Profile page for Charlie (id: 3).",
      },
    ];

    for (const { path, title, description } of cases) {
      const response = await request.get(path);

      expect(response.status(), path).toBe(200);

      const html = await response.text();

      expect(html, `${path} title`).toContain(`<title>${title}</title>`);
      expect(html, `${path} description`).toContain(
        `content="${description}"`,
      );
    }
  });

  test("404.html: pre-rendered fallback has not-found meta and no __SSR_STATE__", async ({
    request,
  }) => {
    const response = await request.get("/404.html");

    expect(response.status()).toBe(200);

    const html = await response.text();

    expect(html).toContain("<title>Page Not Found — Real-Router SSG</title>");
    expect(html).toContain(
      'content="The page you are looking for does not exist."',
    );
    // Error fallback should not ship per-request hydration state.
    expect(html).not.toContain("window.__SSR_STATE__");
  });

  test("sitemap.xml: lists all pre-rendered URLs with site origin", async ({
    request,
  }) => {
    const response = await request.get("/sitemap.xml");

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("xml");

    const xml = await response.text();

    expect(xml).toContain("<urlset");
    expect(xml).toContain("<loc>https://example.com/</loc>");
    expect(xml).toContain("<loc>https://example.com/users</loc>");
    expect(xml).toContain("<loc>https://example.com/users/1</loc>");
    expect(xml).toContain("<loc>https://example.com/users/2</loc>");
    expect(xml).toContain("<loc>https://example.com/users/3</loc>");
  });

  test("static output isolation: each pre-rendered URL ships its own resolved __SSR_STATE__ snapshot", async ({
    request,
  }) => {
    // Concurrent reads of distinct pre-rendered files must each carry
    // the URL-specific snapshot — no shared mutable in the build pipeline,
    // no cross-pollination between rendered states.
    const targets = [
      { path: "/users/1", expectedId: "1", expectedName: "Alice" },
      { path: "/users/2", expectedId: "2", expectedName: "Bob" },
      { path: "/users/3", expectedId: "3", expectedName: "Charlie" },
    ];

    // SSG vite preview redirects /users/1 → /users/1/ before serving the
    // pre-rendered file. APIRequest follows redirects by default, but we
    // request the canonical trailing-slash form upfront for clarity.
    const responses = await Promise.all(
      targets.map(({ path }) => request.get(`${path}/`)),
    );

    await Promise.all(
      responses.map(async (response, i) => {
        const { expectedId, expectedName, path } = targets[i];

        expect(response.status(), path).toBe(200);

        const html = await response.text();
        const ssrStateMatch = html.match(
          /window\.__SSR_STATE__=({.*?})<\/script>/,
        );

        expect(ssrStateMatch?.[1], `${path} __SSR_STATE__ found`).toBeDefined();

        const ssrState = JSON.parse(ssrStateMatch![1]) as {
          params: { id: string };
          context?: { data?: { user?: { id: string; name: string } } };
        };

        expect(ssrState.params.id, `${path} param id`).toBe(expectedId);
        expect(ssrState.context?.data?.user?.id, `${path} loader id`).toBe(
          expectedId,
        );
        expect(ssrState.context?.data?.user?.name, `${path} loader name`).toBe(
          expectedName,
        );
      }),
    );
  });

  test("Loader-driven build: render() throws LoaderNotFound for an id absent from the database (catches stale entries.ts entries at build time)", async () => {
    // Import the compiled entry-server module that ssg-build.ts uses.
    // Calling render('/users/9999') must reject with the typed
    // LoaderNotFound error — proving that if entries.ts listed an
    // id no longer in the database, the build script's try/catch
    // would surface it as a failure (vs. silently emitting an empty
    // "user not found" page).
    // @ts-expect-error — compiled artifact, no .d.ts
    const module_ = (await import("../dist/server/entry-server.js")) as {
      render: (url: string) => Promise<{
        html: string;
        ssrJson: string;
        statusCode: number;
        meta: { title: string; description: string };
      }>;
    };
    const { render } = module_;

    let caught: { code?: string; resource?: string } | undefined;

    try {
      await render("/users/9999");
    } catch (error) {
      caught = error as { code?: string; resource?: string };
    }

    expect(caught).toBeDefined();
    expect(caught?.code).toBe("LOADER_NOT_FOUND");
    expect(caught?.resource).toBe("user:9999");
  });

  test("Cache-Control: per-route policy from vite.config.ts ssgServe middleware (long for home, shorter for users list / profile)", async ({
    request,
  }) => {
    const home = await request.get("/");
    expect(home.headers()["cache-control"]).toContain("public");
    expect(home.headers()["cache-control"]).toContain("s-maxage=3600");

    const users = await request.get("/users/");
    expect(users.headers()["cache-control"]).toContain("public");
    expect(users.headers()["cache-control"]).toContain("max-age=60");

    const profile = await request.get("/users/1/");
    expect(profile.headers()["cache-control"]).toContain("public");
    expect(profile.headers()["cache-control"]).toContain("max-age=120");
  });

  test("ETag: static-file layer emits weak ETag (auto from mtime), conditional GET returns 304", async ({
    request,
  }) => {
    const first = await request.get("/users/");
    expect(first.status()).toBe(200);

    const etag = first.headers().etag;
    expect(etag).toMatch(/^W?\/?".+"$/);

    const conditional = await request.get("/users/", {
      headers: { "If-None-Match": etag },
    });
    expect(conditional.status()).toBe(304);
    expect((await conditional.body()).length).toBe(0);
  });
});

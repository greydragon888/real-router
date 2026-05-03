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
});

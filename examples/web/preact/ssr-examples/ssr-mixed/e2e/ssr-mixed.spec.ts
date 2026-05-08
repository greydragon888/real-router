import { expect, test } from "@playwright/test";

interface SsrPayload {
  name: string;
  context: {
    data?: { id?: string; name?: string; greeting?: string; fetchedAt?: number };
    ssrDataMode?: string;
  };
}

async function getSsrState(body: string): Promise<SsrPayload> {
  const match = body.match(
    /<script>window\.__SSR_STATE__=(?<json>.+?)<\/script>/,
  );

  if (!match?.groups) throw new Error("__SSR_STATE__ not found in response");

  return JSON.parse(match.groups.json) as SsrPayload;
}

test.describe("ssr-mixed: per-route SSR mode (Preact)", () => {
  test("home — full SSR (mode=full, HTML rendered, data present)", async ({
    request,
  }) => {
    const response = await request.get("/");

    expect(response.status()).toBe(200);

    const body = await response.text();
    const state = await getSsrState(body);

    expect(state.name).toBe("home");
    expect(state.context.ssrDataMode).toBe("full");
    expect(state.context.data?.greeting).toBe("Hello from full SSR");
    expect(body).toContain("Home (full SSR)");
    expect(body).not.toContain("data-ssr-shell");
  });

  test("admin.dashboard — client-only (mode=client-only, no data, shell HTML)", async ({
    request,
  }) => {
    const response = await request.get("/admin/dashboard");

    expect(response.status()).toBe(200);

    const body = await response.text();
    const state = await getSsrState(body);

    expect(state.name).toBe("admin.dashboard");
    expect(state.context.ssrDataMode).toBe("client-only");
    expect(state.context.data).toBeUndefined();
    expect(body).toContain('data-ssr-mode="client-only"');
    expect(body).not.toContain("Admin dashboard (client-only)");
  });

  test("users.profile — data-only (mode=data-only, data present, shell HTML)", async ({
    request,
  }) => {
    const response = await request.get("/users/42");

    expect(response.status()).toBe(200);

    const body = await response.text();
    const state = await getSsrState(body);

    expect(state.name).toBe("users.profile");
    expect(state.context.ssrDataMode).toBe("data-only");
    expect(state.context.data).toEqual({ id: "42", name: "User-42" });
    expect(body).toContain('data-ssr-mode="data-only"');
    expect(body).not.toContain("User profile (data-only)");
  });

  test("docs.detail — function form: ?format=html → full, ?format=pdf → client-only", async ({
    request,
  }) => {
    const htmlResponse = await request.get("/docs/guide?format=html");
    const htmlState = await getSsrState(await htmlResponse.text());

    expect(htmlState.name).toBe("docs.detail");
    expect(htmlState.context.ssrDataMode).toBe("full");
    expect(htmlState.context.data).toBeDefined();

    const pdfResponse = await request.get("/docs/guide?format=pdf");
    const pdfBody = await pdfResponse.text();
    const pdfState = await getSsrState(pdfBody);

    expect(pdfState.name).toBe("docs.detail");
    expect(pdfState.context.ssrDataMode).toBe("client-only");
    expect(pdfState.context.data).toBeUndefined();
    expect(pdfBody).toContain('data-ssr-mode="client-only"');
  });
});

test.describe("ssr-mixed: invalidate(router, 'data') CSR revalidation", () => {
  test("happy path — Refresh button re-runs the loader, fresh fetchedAt lands on context", async ({
    page,
  }) => {
    await page.goto("/");

    const initialText = await page.getByTestId("fetched-at").textContent();
    const initial = Number(initialText);

    expect(initial).toBeGreaterThan(0);

    await page.getByTestId("refresh-btn").click();

    // Wait for a different timestamp to land — the loader has a 25 ms delay,
    // so the new value arrives shortly after the click resolves.
    await expect
      .poll(
        async () =>
          Number(await page.getByTestId("fetched-at").textContent()),
        { timeout: 2000 },
      )
      .toBeGreaterThan(initial);
  });

  test("in-flight defer — rapid double-click cancels the first nav; flag preserved, second nav refreshes", async ({
    page,
  }) => {
    await page.goto("/");

    const initialText = await page.getByTestId("fetched-at").textContent();
    const initial = Number(initialText);

    expect(initial).toBeGreaterThan(0);

    // Two synchronous clicks in the same task: the second navigate() aborts
    // the first via Router's #abortPreviousNavigation. With cancel-safety
    // (peek-then-clear-after-write), the first nav's late-resolving loader
    // sees `signal.aborted` and skips the write — flag stays set; the second
    // nav's leave handler consumes it, runs the loader, writes fresh data.
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        "[data-testid='refresh-btn']",
      );

      if (btn === null) throw new Error("refresh-btn not found");

      btn.click();
      btn.click();
    });

    await expect
      .poll(
        async () =>
          Number(await page.getByTestId("fetched-at").textContent()),
        { timeout: 2000 },
      )
      .toBeGreaterThan(initial);
  });

  test("loader receives navigation AbortSignal — rapid double-click increments abort counter", async ({
    page,
  }) => {
    await page.goto("/");

    // Initial SSR: loader runs once with no abort signal — aborts === 0.
    const initialAborts = await page.getByTestId("aborts").textContent();

    expect(Number(initialAborts)).toBe(0);

    // Single click: nav completes successfully, no race → aborts unchanged.
    await page.getByTestId("refresh-btn").click();

    await expect
      .poll(
        async () =>
          Number(await page.getByTestId("fetched-at").textContent()),
        { timeout: 2000 },
      )
      .toBeGreaterThan(0);

    expect(Number(await page.getByTestId("aborts").textContent())).toBe(0);

    // Rapid double-click: first nav's controller aborts, the loader's
    // `addEventListener("abort", …)` reject fires synchronously and bumps
    // the closure-captured `aborts` counter. Second nav's loader returns
    // the new counter value in its data — proves the loader received and
    // observed the navigation's AbortSignal.
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        "[data-testid='refresh-btn']",
      );

      if (btn === null) throw new Error("refresh-btn not found");

      btn.click();
      btn.click();
    });

    await expect
      .poll(
        async () => Number(await page.getByTestId("aborts").textContent()),
        { timeout: 2000 },
      )
      .toBeGreaterThan(0);
  });
});


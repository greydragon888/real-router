import { expect, test } from "@playwright/test";

interface SsrPayload {
  name: string;
  context: {
    data?: { id?: string; name?: string; greeting?: string };
    ssrDataMode?: string;
  };
}

function getSsrState(body: string): SsrPayload {
  const match = body.match(
    /<script>window\.__SSR_STATE__=(?<json>.+?)<\/script>/,
  );

  if (!match?.groups) throw new Error("__SSR_STATE__ not found in response");

  return JSON.parse(match.groups.json) as SsrPayload;
}

test.describe("ssr-mixed: per-route SSR mode (Angular)", () => {
  test("home — full SSR (mode=full, Angular renders the page)", async ({
    request,
  }) => {
    const response = await request.get("/");

    expect(response.status()).toBe(200);

    const body = await response.text();

    // Angular SSR doesn't serialize router state into a __SSR_STATE__ tag
    // (it uses its own TransferState). For the "full" mode we instead assert
    // that Angular's renderer ran and produced the home page markup.
    expect(body).toContain("ng-version=");
    expect(body).toContain("Home (full SSR)");
    expect(body).toContain("Hello from full SSR");
    expect(body).not.toContain("data-ssr-shell");
  });

  test("admin.dashboard — client-only (mode=client-only, no data, shell HTML)", async ({
    request,
  }) => {
    const response = await request.get("/admin/dashboard");

    expect(response.status()).toBe(200);

    const body = await response.text();
    const state = getSsrState(body);

    expect(state.name).toBe("admin.dashboard");
    expect(state.context.ssrDataMode).toBe("client-only");
    expect(state.context.data).toBeUndefined();
    expect(body).toContain('data-ssr-mode="client-only"');
    // Shell does not boot Angular, so no Angular markup is present.
    expect(body).not.toContain("ng-version=");
  });

  test("users.profile — data-only (mode=data-only, data present, shell HTML)", async ({
    request,
  }) => {
    const response = await request.get("/users/42");

    expect(response.status()).toBe(200);

    const body = await response.text();
    const state = getSsrState(body);

    expect(state.name).toBe("users.profile");
    expect(state.context.ssrDataMode).toBe("data-only");
    expect(state.context.data).toEqual({ id: "42", name: "User-42" });
    expect(body).toContain('data-ssr-mode="data-only"');
  });

  test("docs.detail — function form: ?format=html → full, ?format=pdf → client-only", async ({
    request,
  }) => {
    const htmlBody = await (await request.get("/docs/guide?format=html")).text();
    expect(htmlBody).toContain("ng-version=");
    expect(htmlBody).toContain("Doc body for guide");

    const pdfResponse = await request.get("/docs/guide?format=pdf");
    const pdfBody = await pdfResponse.text();
    const pdfState = getSsrState(pdfBody);

    expect(pdfState.name).toBe("docs.detail");
    expect(pdfState.context.ssrDataMode).toBe("client-only");
    expect(pdfState.context.data).toBeUndefined();
    expect(pdfBody).toContain('data-ssr-mode="client-only"');
  });

  test("post-hydration loader skip (#599): home (full mode) — TransferState bridge skips client-side loader", async ({
    page,
  }) => {
    // Home is the only route in this example with a short-form loader factory
    // routed through the full Angular SSR pipeline (other routes use object-form
    // entries with explicit ssr modes; "client-only"/"data-only" shells bypass
    // Angular bootstrap on the server entirely). The TransferState bridge in
    // provideRealRouterFactory writes the SSR-resolved state on the server pass;
    // the client bootstrap consumes it via hydrateRouter(...) — counter stays empty.
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const counts = await page.evaluate(
      () =>
        (
          globalThis as unknown as Window & {
            __LOADER_CALLS__?: Record<string, number>;
          }
        ).__LOADER_CALLS__,
    );

    expect(counts).toEqual({});
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


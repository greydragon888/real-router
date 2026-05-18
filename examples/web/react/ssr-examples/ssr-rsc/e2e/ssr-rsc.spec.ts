import { expect, test } from "@playwright/test";

test.describe("RSC SSR Example", () => {
  test("Scenario 1: Initial HTML load — server rendering + Flight injection", async ({
    page,
  }) => {
    const errors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/users/1");

    await expect(page.getByTestId("user-profile")).toBeVisible();
    await expect(page.getByTestId("user-name")).toHaveText("Alice Anderson");
    await expect(page.getByTestId("user-email")).toHaveText(
      "alice@example.com",
    );

    await page.waitForLoadState("networkidle");

    const hydrationErrors = errors.filter(
      (e) =>
        e.toLowerCase().includes("hydrat") ||
        e.toLowerCase().includes("mismatch"),
    );

    expect(hydrationErrors).toEqual([]);

    const html = await page.content();

    expect(html).toContain("self.__FLIGHT_DATA");
  });

  test("Scenario 2: Client-side navigation via Link triggers /__rsc fetch", async ({
    page,
  }) => {
    const rscRequests: string[] = [];

    page.on("request", (req) => {
      if (req.url().includes("/__rsc")) rscRequests.push(req.url());
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await page.waitForLoadState("networkidle");

    rscRequests.length = 0;

    await page.getByTestId("nav-users").click();

    await expect(page.getByTestId("users-list")).toBeVisible();
    await expect(page).toHaveURL(/\/users$/);

    expect(rscRequests).toHaveLength(1);
    expect(rscRequests[0]).toContain("/__rsc?route=%2Fusers");
  });

  test("Scenario 3: Revalidation button → fresh /__rsc fetch + DOM updates", async ({
    page,
    request,
  }) => {
    await page.goto("/users/1");
    await expect(page.getByTestId("user-email")).toHaveText(
      "alice@example.com",
    );

    try {
      const mutateRes = await request.post("/__test/users/1", {
        data: { email: "newalice@example.com" },
      });

      expect(mutateRes.status()).toBe(204);

      await expect(page.getByTestId("user-email")).toHaveText(
        "alice@example.com",
      );

      const rscRequests: string[] = [];

      page.on("request", (req) => {
        if (req.url().includes("/__rsc")) rscRequests.push(req.url());
      });

      await page.getByTestId("revalidate").click();

      await expect(page.getByTestId("user-email")).toHaveText(
        "newalice@example.com",
      );
      expect(rscRequests).toHaveLength(1);
      expect(rscRequests[0]).toContain("/__rsc?route=%2Fusers%2F1");
    } finally {
      await request.post("/__test/users/1", {
        data: { email: "alice@example.com" },
      });
    }
  });

  test("Scenario 3b: Revalidate in-flight defer — rapid double-click cancels first /__rsc fetch, second wins (#605)", async ({
    page,
    request,
  }) => {
    await page.goto("/users/1");

    await expect(page.getByTestId("user-email")).toHaveText(
      "alice@example.com",
    );

    try {
      const mutateRes = await request.post("/__test/users/1", {
        data: { email: "doublealice@example.com" },
      });

      expect(mutateRes.status()).toBe(204);

      const rscRequests: string[] = [];

      page.on("request", (req) => {
        if (req.url().includes("/__rsc")) rscRequests.push(req.url());
      });

      // Two synchronous clicks — RevalidateButton's pending guard disables
      // the second visually, but the in-flight cancellation contract still
      // holds at the router level: App.tsx's subscribe → fetch handler
      // aborts the previous /__rsc request when a new navigation lands.
      // With cancel-safety in rsc-server-plugin (#605), no stale Flight
      // payload races back into the DOM.
      await page.evaluate(() => {
        const btn = document.querySelector<HTMLButtonElement>(
          "[data-testid='revalidate']",
        );

        if (btn === null) throw new Error("revalidate button not found");

        btn.click();
        btn.click();
      });

      await expect(page.getByTestId("user-email")).toHaveText(
        "doublealice@example.com",
      );
      // At least one /__rsc fetch happened — earlier ones may have been
      // aborted by App.tsx's controller swap.
      expect(rscRequests.length).toBeGreaterThanOrEqual(1);
    } finally {
      await request.post("/__test/users/1", {
        data: { email: "alice@example.com" },
      });
    }
  });

  test("Scenario 4: 404 — invalid route renders not-found Server Component", async ({
    page,
  }) => {
    const errors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    const response = await page.goto("/nonexistent-page");

    expect(response?.status()).toBe(404);
    await expect(page.getByTestId("not-found")).toBeVisible();

    await page.waitForLoadState("networkidle");

    const hydrationErrors = errors.filter(
      (e) =>
        e.toLowerCase().includes("hydrat") ||
        e.toLowerCase().includes("mismatch"),
    );

    expect(hydrationErrors).toEqual([]);
  });

  test("Scenario 5: Per-request isolation under 10 concurrent /users/:id loads", async ({
    request,
  }) => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        request.get(`/users/${i}`, { headers: { Accept: "text/html" } }),
      ),
    );

    await Promise.all(
      responses.map(async (response, i) => {
        expect(response.status()).toBe(200);

        const html = await response.text();

        expect(html).toContain('data-testid="user-name"');

        const userIdMatch = html.match(/data-user-id="(\d+)"/);

        expect(userIdMatch?.[1]).toBe(String(i));
      }),
    );
  });

  test("Scenario 6: Flight payload carries router state via __SSR_STATE__ (rsc namespace excluded)", async ({
    request,
  }) => {
    const response = await request.get("/users/1", {
      headers: { Accept: "text/html" },
    });
    const html = await response.text();

    // Unlike ssr/ssg/ssr-streaming, the RSC example injects __SSR_STATE__ via
    // React's bootstrapScriptContent (executed before client modules load),
    // so the inline script ends with a semicolon and the next statement —
    // not a closing </script> tag. Match a greedy JSON object up to `;`.
    const ssrStateMatch = html.match(
      /window\.__SSR_STATE__=({(?:[^{}]|{[^{}]*})*});/,
    );

    expect(ssrStateMatch?.[1]).toBeDefined();

    const ssrState = JSON.parse(ssrStateMatch![1]) as {
      name: string;
      params: { id: string };
      context?: { rsc?: unknown; data?: unknown };
    };

    expect(ssrState.name).toBe("users.profile");
    expect(ssrState.params).toEqual({ id: "1" });
    // rsc-server-plugin's namespace MUST be excluded from JSON transport —
    // ReactNode is not JSON-serializable; Flight payload travels separately.
    expect(ssrState.context?.rsc).toBeUndefined();
  });

  test("Scenario 7: /__rsc Flight stream returns text/x-component for matched routes", async ({
    request,
  }) => {
    const response = await request.get("/__rsc?route=%2Fusers%2F1");

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/x-component");

    const body = await response.text();

    // Flight payload is binary-ish but stringifies to a structure containing
    // the loader's resolved data (user name, email visible in serialized form).
    expect(body).toContain("Alice Anderson");
    expect(body).toContain("alice@example.com");
  });

  test("Scenario 9: loader error → 500 with server-rendered error page (no Flight payload)", async ({
    request,
  }) => {
    const response = await request.get("/boom");

    expect(response.status()).toBe(500);

    const html = await response.text();

    expect(html).toContain('data-testid="server-error"');
    expect(html).toContain("Loader exploded for /boom");
    // Error path bypasses Flight rendering — no FLIGHT_DATA inline scripts.
    expect(html).not.toContain("self.__FLIGHT_DATA");
  });

  test("Scenario 8: SSR HTML reflects loader-driven Server Component output (Flight desuspended)", async ({
    request,
  }) => {
    const response = await request.get("/users/2");
    const html = await response.text();

    // The Server Component <UserProfile user={...}> rendered with
    // loader output → values must appear in raw HTML (no JS executed).
    expect(html).toContain('data-testid="user-profile"');
    expect(html).toContain('data-user-id="2"');
    expect(html).toContain("Bob Brown");
    expect(html).toContain("bob@example.com");

    // Flight chunks for the same content are inline-injected for client takeover.
    expect(html).toContain("self.__FLIGHT_DATA");
  });

  test("Scenario 10: browser back/forward navigation triggers /__rsc per step + correct DOM", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await page.waitForLoadState("networkidle");

    const rscRequests: string[] = [];

    page.on("request", (req) => {
      if (req.url().includes("/__rsc")) rscRequests.push(req.url());
    });

    // Forward: / → /users (via Link click).
    await page.getByTestId("nav-users").click();
    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByTestId("users-list")).toBeVisible();

    // Back: /users → /
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();

    // Forward (history): / → /users
    await page.goForward();
    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByTestId("users-list")).toBeVisible();

    // 3 navigations → 3 /__rsc fetches; the back step is also a navigation
    // (browser-plugin emits popstate → router.navigateToState → subscribe fires).
    expect(rscRequests.length).toBeGreaterThanOrEqual(3);

    const usersRequests = rscRequests.filter((u) =>
      u.includes("%2Fusers"),
    ).length;
    const homeRequests = rscRequests.filter((u) =>
      u.endsWith("%2F"),
    ).length;

    expect(usersRequests).toBeGreaterThanOrEqual(2);
    expect(homeRequests).toBeGreaterThanOrEqual(1);
  });

  test("Scenario 11: interleaved Link clicks — abort logic prevents stale Flight from winning", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Click Users → starts /__rsc?route=/users fetch. Immediately click Home
    // before the Users Flight payload arrives. App.tsx's AbortController must
    // cancel the in-flight Users request so the final DOM is Home, not Users.
    await page.getByTestId("nav-users").click();
    await page.getByTestId("nav-home").click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();

    // After dust settles: no users-list lingering, no race-imposed flicker
    // back to Users.
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("users-list")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  });

  test("Scenario 12: ?role=admin search param flows from URL → loader → Server Component", async ({
    request,
  }) => {
    const response = await request.get("/users?role=admin");
    const html = await response.text();

    expect(response.status()).toBe(200);
    expect(html).toContain('data-role-filter="admin"');
    expect(html).toContain('data-user-id="1"');
    expect(html).toContain("Alice Anderson");

    // Bob (role:user) and Jane (role:user) must be excluded by the filter.
    expect(html).not.toContain('data-user-id="2"');
    expect(html).not.toContain('data-user-id="42"');
    expect(html).toContain("Users (admin)");
  });

  test("Scenario 13: ?role=user filters Server Component to non-admin users", async ({
    request,
  }) => {
    const response = await request.get("/users?role=user");
    const html = await response.text();

    expect(html).toContain('data-role-filter="user"');
    expect(html).toContain('data-user-id="2"');
    expect(html).toContain('data-user-id="42"');
    expect(html).not.toContain('data-user-id="1"');
  });

  test("Scenario 14: no ?role param returns full unfiltered list", async ({
    request,
  }) => {
    const response = await request.get("/users");
    const html = await response.text();

    expect(html).toContain('data-role-filter="all"');
    expect(html).toContain('data-user-id="1"');
    expect(html).toContain('data-user-id="2"');
    expect(html).toContain('data-user-id="42"');
  });

  test("Scenario 15: search params survive client-side navigation via /__rsc", async ({
    page,
  }) => {
    await page.goto("/users?role=admin");
    await expect(page.getByTestId("users-list")).toBeVisible();
    await expect(page.locator('[data-role-filter]')).toHaveAttribute(
      "data-role-filter",
      "admin",
    );

    // Now back to home, then forward back to /users?role=admin via history.
    // The Flight payload from /__rsc?route=%2Fusers%3Frole%3Dadmin must
    // carry the same filtered state.
    const rscRequests: string[] = [];

    page.on("request", (req) => {
      if (req.url().includes("/__rsc")) rscRequests.push(req.url());
    });

    await page.getByTestId("nav-home").click();
    await page.goBack();

    await expect(page).toHaveURL(/\/users\?role=admin$/);
    await expect(page.locator('[data-role-filter]')).toHaveAttribute(
      "data-role-filter",
      "admin",
    );

    // /__rsc?route=... preserves the query string.
    expect(rscRequests.some((u) => u.includes("role%3Dadmin"))).toBe(true);
  });

  test("Scenario 16a: Loader-driven HTTP — /users/9999 throws LoaderNotFound → 404 text/plain (no Flight payload)", async ({
    request,
  }) => {
    // users.profile loader throws LoaderNotFound for unknown ids.
    // entry.rsc.tsx catches the typed error BEFORE constructing the
    // Flight stream and returns a plain-text 404. cleanup() in
    // finally still runs — no router leak.
    const response = await request.get("/users/9999");

    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toContain("text/plain");
    expect(await response.text()).toBe("Not Found");
  });

  test("Scenario 16b: Loader-driven HTTP — /__rsc?route=/users/9999 also returns 404 (Flight error path)", async ({
    request,
  }) => {
    // Same typed-error path applies when navigating client-side via
    // /__rsc — the handler catches LoaderNotFound and returns
    // text/plain instead of a Flight stream. The client (App.tsx
    // router.subscribe) sees a non-Flight content-type and can fall
    // back to a hard navigation; what matters here is that the
    // server-side semantics are correct.
    const response = await request.get("/__rsc?route=/users/9999");

    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toContain("text/plain");
    expect(await response.text()).toBe("Not Found");
  });

  test("Scenario 16: Cache-Control on initial HTML response (per-route policy)", async ({
    request,
  }) => {
    const home = await request.get("/", { maxRedirects: 0 });
    expect(home.headers()["cache-control"]).toContain("public");
    expect(home.headers()["cache-control"]).toContain("s-maxage=3600");

    const users = await request.get("/users", { maxRedirects: 0 });
    expect(users.headers()["cache-control"]).toContain("public");
    expect(users.headers()["cache-control"]).toContain("max-age=60");

    const profile = await request.get("/users/1", { maxRedirects: 0 });
    expect(profile.headers()["cache-control"]).toContain("public");
    expect(profile.headers()["cache-control"]).toContain("max-age=120");
  });

  test("Scenario 17: Cache-Control on /__rsc Flight responses uses the underlying route's policy", async ({
    request,
  }) => {
    const flightHome = await request.get("/__rsc?route=/", {
      headers: { Accept: "text/x-component" },
    });
    expect(flightHome.headers()["content-type"]).toContain("text/x-component");
    expect(flightHome.headers()["cache-control"]).toContain("public");
    expect(flightHome.headers()["cache-control"]).toContain("s-maxage=3600");

    const flightProfile = await request.get("/__rsc?route=/users/1", {
      headers: { Accept: "text/x-component" },
    });
    expect(flightProfile.headers()["content-type"]).toContain(
      "text/x-component",
    );
    expect(flightProfile.headers()["cache-control"]).toContain("max-age=120");
  });

  test("Scenario 19: Server Action — form rendered with React 19 action-ref hidden fields (use server wired)", async ({
    request,
  }) => {
    // The 'use server' directive on src/server-actions/updateUserEmail.ts
    // turns the export into a server reference. React 19's
    // `<form action={serverAction}>` then emits hidden inputs
    // ($ACTION_REF_*, $ACTION_KEY) so the form can POST and the
    // server can decode the action via decodeAction(formData) — this
    // is the progressive-enhancement wire signature, working even
    // before hydration / with JS disabled.
    const response = await request.get("/users/1");
    const html = await response.text();

    expect(html).toContain('data-testid="edit-email-form"');
    expect(html).toContain('name="$ACTION_REF_');
    expect(html).toContain('name="$ACTION_KEY"');
    expect(html).toMatch(
      /<input type="hidden"[^>]*name="id"[^>]*value="1"/,
    );
    expect(html).toContain('value="alice@example.com"');
  });

  test("Scenario 20: Server Action — submitting the form mutates state and the page re-renders with the new email", async ({
    page,
  }) => {
    // Full client-side path: hydrate, type new email, click Save.
    // setServerCallback in entry.browser.tsx posts FormData with the
    // x-rsc-action header; entry.rsc.tsx loads the action via
    // loadServerAction, runs it, returns a fresh Flight payload.
    // useActionState picks up the result and the page reflects the
    // mutated state.
    await page.goto("/users/1");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("user-email")).toHaveText(
      "alice@example.com",
    );

    await page.getByTestId("email-input").fill("alice-updated@example.com");
    await page.getByTestId("submit-email").click();

    await expect(page.getByTestId("action-result")).toBeVisible();
    await expect(page.getByTestId("action-result")).toHaveAttribute(
      "data-ok",
      "true",
    );
    await expect(page.getByTestId("action-result")).toContainText(
      "alice-updated@example.com",
    );

    // Refresh — the in-memory database keeps the mutation; the
    // Server Component re-renders with the new email.
    await page.reload();
    await expect(page.getByTestId("user-email")).toHaveText(
      "alice-updated@example.com",
    );

    // Reset for test isolation.
    await page.getByTestId("email-input").fill("alice@example.com");
    await page.getByTestId("submit-email").click();
    await expect(page.getByTestId("action-result")).toContainText(
      "alice@example.com",
    );
  });

  test("Scenario 21: Server Action — useActionState exposes validation errors (invalid email → ok=false)", async ({
    page,
  }) => {
    // Server-side validation in updateUserEmail rejects emails
    // without "@". useActionState surfaces the { ok: false, message }
    // shape; the UI flips data-ok="false" on the result element.
    await page.goto("/users/2");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("email-input").fill("not-an-email");
    await page.getByTestId("submit-email").click();

    await expect(page.getByTestId("action-result")).toBeVisible();
    await expect(page.getByTestId("action-result")).toHaveAttribute(
      "data-ok",
      "false",
    );
    await expect(page.getByTestId("action-result")).toContainText(
      "Invalid email format",
    );

    // Critically: state did NOT mutate (validation rejected), so a
    // page reload still shows Bob's original email.
    await page.reload();
    await expect(page.getByTestId("user-email")).toHaveText(
      "bob@example.com",
    );
  });

  test("Scenario 18: streamed responses (HTML and Flight) do NOT carry an ETag header", async ({
    request,
  }) => {
    const html = await request.get("/users/1");
    expect(html.status()).toBe(200);
    expect(html.headers().etag).toBeUndefined();

    const flight = await request.get("/__rsc?route=/users/1", {
      headers: { Accept: "text/x-component" },
    });
    expect(flight.status()).toBe(200);
    expect(flight.headers().etag).toBeUndefined();
  });

  test("Scenario 22: NotificationBanner — plain GET requests show no banner (rscAction is undefined)", async ({
    request,
  }) => {
    // Plain GET → no Server Action ran → rscActionPluginFactory's
    // closure returns undefined → state.context.rscAction stays
    // undefined → NotificationBanner Server Component renders null.
    const response = await request.get("/users/1");
    const html = await response.text();

    expect(response.status()).toBe(200);
    expect(html).not.toContain('data-testid="notification-banner-success"');
    expect(html).not.toContain('data-testid="notification-banner-error"');
  });

  test("Scenario 23: NotificationBanner — successful Server Action surfaces a success banner via state.context.rscAction (cross-component, no prop drilling)", async ({
    page,
  }) => {
    // Submit the email-edit form (Client Component, owns useActionState).
    // After the action succeeds, the page re-renders. The Server
    // Component NotificationBanner — mounted by entry.rsc.tsx as a
    // wrapper around state.context.rsc — reads state.context.rscAction
    // and renders the success status. EditEmailForm's local
    // action-result message ALSO appears (per-form UX), but the
    // banner is the cross-cutting feedback that any page-level
    // Server Component could provide.
    await page.goto("/users/2");
    await page.waitForLoadState("networkidle");

    // No banner before submit.
    await expect(page.getByTestId("notification-banner-success")).toHaveCount(
      0,
    );

    await page.getByTestId("email-input").fill("bob-updated@example.com");
    await page.getByTestId("submit-email").click();

    // Both: the form's local message AND the global banner.
    await expect(page.getByTestId("action-result")).toBeVisible();
    await expect(page.getByTestId("notification-banner-success")).toBeVisible();
    await expect(page.getByTestId("notification-banner-success")).toContainText(
      "bob-updated@example.com",
    );

    // Reset DB for test isolation.
    await page.getByTestId("email-input").fill("bob@example.com");
    await page.getByTestId("submit-email").click();
    await expect(page.getByTestId("action-result")).toContainText(
      "bob@example.com",
    );
  });

  test("Scenario 24: NotificationBanner — failed Server Action surfaces an error banner (validation rejected)", async ({
    page,
  }) => {
    await page.goto("/users/1");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("notification-banner-error")).toHaveCount(0);

    await page.getByTestId("email-input").fill("not-an-email");
    await page.getByTestId("submit-email").click();

    // Form's per-message: "Invalid email format".
    // Banner: ✗ Action failed (cross-cutting, no per-form details).
    await expect(page.getByTestId("notification-banner-error")).toBeVisible();
    await expect(page.getByTestId("action-result")).toHaveAttribute(
      "data-ok",
      "false",
    );

    // Reload — fresh GET, no action → banner gone, original email
    // unchanged (validation rejected the mutation).
    await page.reload();
    await expect(page.getByTestId("notification-banner-error")).toHaveCount(0);
    await expect(page.getByTestId("user-email")).toHaveText(
      "alice@example.com",
    );
  });
});

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
});

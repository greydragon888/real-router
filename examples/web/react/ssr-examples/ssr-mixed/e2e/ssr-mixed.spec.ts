import { expect, test } from "@playwright/test";

interface SsrPayload {
  name: string;
  context: {
    data?: { id?: string; name?: string; greeting?: string };
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

test.describe("ssr-mixed: per-route SSR mode", () => {
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

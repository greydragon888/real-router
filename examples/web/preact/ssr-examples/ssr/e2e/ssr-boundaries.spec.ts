import { test, expect } from "@playwright/test";

/**
 * Dogfooding scenario for `<ClientOnly>` + `<ServerOnly>` from
 * `@real-router/preact`. Verifies the SSR-vs-post-hydration contract
 * end-to-end.
 */
test.describe("SSR boundaries (<ClientOnly> + <ServerOnly>)", () => {
  test("server HTML emits fallback (ClientOnly) and children (ServerOnly)", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/");

    await expect(
      page.getByTestId("ssr-boundaries-client-fallback"),
    ).toBeVisible();
    await expect(page.getByTestId("ssr-boundaries-client")).toHaveCount(0);

    await expect(page.getByTestId("ssr-boundaries-server")).toBeVisible();
    await expect(
      page.getByTestId("ssr-boundaries-server-fallback"),
    ).toHaveCount(0);

    await context.close();
  });

  test("post-hydration DOM swaps both branches", async ({ page }) => {
    const errors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("ssr-boundaries-client")).toBeVisible();
    await expect(
      page.getByTestId("ssr-boundaries-client-fallback"),
    ).toHaveCount(0);

    await expect(
      page.getByTestId("ssr-boundaries-server-fallback"),
    ).toBeVisible();
    await expect(page.getByTestId("ssr-boundaries-server")).toHaveCount(0);

    const hydrationErrors = errors.filter(
      (e) =>
        e.includes("hydrat") ||
        e.includes("mismatch") ||
        e.includes("did not match"),
    );

    expect(hydrationErrors).toHaveLength(0);
  });
});

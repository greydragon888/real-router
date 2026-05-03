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
});

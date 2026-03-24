import { expect, test } from "@playwright/test";

test.describe("Hash navigation", () => {
  test("home page loads at hash root", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/#!\/$/);
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  });

  test("URL contains hash prefix after navigation to dashboard", async ({
    page,
  }) => {
    await page.goto("/#!/dashboard");
    await expect(page).toHaveURL(/\/#!\/dashboard/);
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("URL contains hash prefix after navigation to settings", async ({
    page,
  }) => {
    await page.goto("/#!/settings");
    await expect(page).toHaveURL(/\/#!\/settings/);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  test("sidebar links use hash prefix format", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "#!/dashboard",
    );
    await expect(page.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "#!/settings",
    );
  });

  test("clicking Dashboard link shows dashboard page", async ({ page }) => {
    await page.goto("/#!/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
    await expect(page.getByText("#!/dashboard")).toBeVisible();
  });
});

test.describe("Direct hash URL navigation", () => {
  test("direct goto hash URL loads correct page", async ({ page }) => {
    await page.goto("/#!/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  test("home page shows current hash in content", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("#!/", { exact: true })).toBeVisible();
  });
});

test.describe("Hash route preservation", () => {
  test("reload on dashboard preserves hash route", async ({ page }) => {
    await page.goto("/#!/dashboard");
    await page.reload();
    await expect(page).toHaveURL(/\/#!\/dashboard/);
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("reload on settings preserves hash route", async ({ page }) => {
    await page.goto("/#!/settings");
    await page.reload();
    await expect(page).toHaveURL(/\/#!\/settings/);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });
});

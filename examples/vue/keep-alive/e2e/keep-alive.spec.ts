import { expect, test } from "@playwright/test";

test.describe("Reports — scroll preserved via subscribeLeave", () => {
  test("scroll position is restored after navigating away and back", async ({
    page,
  }) => {
    await page.goto("/reports");
    const container = page.locator(".reports-scroll-container");

    await container.evaluate((element) => {
      element.scrollTop = 300;
    });
    await page.getByRole("link", { name: "Settings" }).click();
    await page.waitForURL(/\/settings/);
    await page.getByRole("link", { name: "Reports" }).click();
    await page.waitForURL(/\/reports/);
    await page.waitForTimeout(100);
    const scrollTop = await container.evaluate((element) => element.scrollTop);

    expect(scrollTop).toBeGreaterThan(250);
  });
});

test.describe("Dashboard keepAlive regression", () => {
  test("search input state is preserved after navigating away and back", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page
      .getByPlaceholder("Type here — preserved on navigation")
      .fill("hello");
    await page.getByRole("link", { name: "Settings" }).click();
    await page.waitForURL(/\/settings/);
    await page.getByRole("link", { name: "Dashboard" }).click();
    await page.waitForURL(/\/dashboard/);
    const value = await page
      .getByPlaceholder("Type here — preserved on navigation")
      .inputValue();

    expect(value).toBe("hello");
  });

  test("onActivated/onDeactivated lifecycle log entries appear", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Settings" }).click();
    await page.waitForURL(/\/settings/);
    await page.getByRole("link", { name: "Dashboard" }).click();
    await page.waitForURL(/\/dashboard/);
    await expect(page.locator("ul li").first()).toContainText("onActivated");
  });
});

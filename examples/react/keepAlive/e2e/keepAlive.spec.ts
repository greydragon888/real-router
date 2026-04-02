import { expect, test } from "@playwright/test";

test("scroll preserved via subscribeLeave on Reports page", async ({
  page,
}) => {
  await page.goto("/reports");
  const container = page.locator(".reports-scroll-container");
  await container.evaluate((el) => {
    el.scrollTop = 300;
  });
  await page.getByRole("link", { name: "Settings" }).click();
  await page.waitForURL(/\/settings/);
  await page.getByRole("link", { name: "Reports" }).click();
  await page.waitForURL(/\/reports/);
  await page.waitForTimeout(100);
  const scrollTop = await container.evaluate((el) => el.scrollTop);
  expect(scrollTop).toBeGreaterThan(250);
});

test("Dashboard keepAlive still works (regression)", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByPlaceholder("Filter by name or category…").fill("Alpha");
  await page.getByRole("link", { name: "Settings" }).click();
  await page.waitForURL(/\/settings/);
  await page.getByRole("link", { name: "Dashboard" }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(
    page.getByPlaceholder("Filter by name or category…"),
  ).toHaveValue("Alpha");
});

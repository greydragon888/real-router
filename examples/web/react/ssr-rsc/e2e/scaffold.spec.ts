import { expect, test } from "@playwright/test";

test("scaffold smoke: HTML 200 + Server Component renders + Flight chunks injected", async ({
  page,
}) => {
  await page.goto("/users/42");
  await expect(page.getByTestId("hello")).toBeVisible();
  await expect(page.getByTestId("route")).toContainText("/users/42");

  const flightScripts = await page
    .locator('script:has-text("self.__FLIGHT_DATA__")')
    .count();
  expect(flightScripts).toBeGreaterThan(0);
});

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, "..", "dist");

test.describe("Preact SSG — smoke", () => {
  test("home page is pre-rendered", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    const html = await response!.text();
    expect(html).toContain("Welcome");
    expect(html).toContain("<title>Home — Real-Router Preact SSG</title>");
    expect(html).toContain('rel="canonical"');
    expect(html).toContain("window.__SSR_STATE__");
  });

  test("users list pre-rendered with all users", async ({ page }) => {
    const response = await page.goto("/users/");
    expect(response?.status()).toBe(200);

    const html = await response!.text();
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html).toContain("Charlie");
  });

  test("user profile pre-rendered for each id", async ({ page }) => {
    for (const id of ["1", "2", "3"]) {
      const response = await page.goto(`/users/${id}/`);
      expect(response?.status()).toBe(200);

      const profile = page.locator('[data-testid="user-profile"]');
      await expect(profile).toHaveAttribute("data-user-id", id);
    }
  });

  test("user profile canonical is per-id (not parent)", async ({ page }) => {
    const response = await page.goto("/users/1/");
    const html = await response!.text();
    expect(html).toContain('href="https://example.com/users/1"');
    expect(html).not.toContain('href="https://example.com/users"');
  });

  test("user posts page rendered for each id", async ({ page }) => {
    const response = await page.goto("/users/1/posts/");
    expect(response?.status()).toBe(200);

    const html = await response!.text();
    expect(html).toContain("Hello world");
    expect(html).toContain("On routing");
  });

  test("user posts page renders empty state for Charlie", async ({ page }) => {
    await page.goto("/users/3/posts/");
    await expect(
      page.locator('[data-testid="user-posts-empty"]'),
    ).toBeVisible();
  });

  test("filesystem layout: exact set of pre-rendered files", () => {
    function walk(dir: string, prefix = ""): string[] {
      const entries = readdirSync(dir, { withFileTypes: true });
      const result: string[] = [];

      for (const entry of entries) {
        if (entry.name === "assets") continue; // skip JS/CSS bundles
        const full = path.join(prefix, entry.name);
        if (entry.isDirectory()) {
          result.push(...walk(path.join(dir, entry.name), full));
        } else if (entry.name.endsWith(".html") || entry.name.endsWith(".xml")) {
          result.push(full);
        }
      }

      return result.sort();
    }

    const files = walk(dist);
    expect(files).toEqual(
      [
        "404.html",
        "index.html",
        "sitemap.xml",
        "users/1/index.html",
        "users/1/posts/index.html",
        "users/2/index.html",
        "users/2/posts/index.html",
        "users/3/index.html",
        "users/3/posts/index.html",
        "users/index.html",
      ].sort(),
    );
  });

  test("sitemap.xml lists every pre-rendered URL", () => {
    const sitemap = readFileSync(path.resolve(dist, "sitemap.xml"), "utf8");
    const urls = ["/", "/users", "/users/1", "/users/2", "/users/3"];

    for (const url of urls) {
      expect(sitemap).toContain(`<loc>https://example.com${url}</loc>`);
    }
  });

  test("404.html exists and contains the not-found template", () => {
    const html = readFileSync(path.resolve(dist, "404.html"), "utf8");
    expect(html).toContain("404 — Not Found");
    expect(html).toContain("Page Not Found");
  });

  test("client navigation works after hydration", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.locator("nav >> text=Users").click();
    await expect(page).toHaveURL("/users/");
  });
});

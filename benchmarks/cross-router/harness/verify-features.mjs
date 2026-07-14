#!/usr/bin/env node
// Functional verification of the capability axes: for each (feature × engine)
// that claims support, build the demo app, drive it with Playwright, and ASSERT
// the feature actually works in-harness. Writes results/<fw>/features.json
// ({feature: {engine: "verified"|"FAIL"}}) → results/features.json — a standalone
// capability check (previously fed the retired REPORT capability matrix).
// This is functional (pass/fail), NOT perf — these features cost sub-µs.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { build, preview } from "vite";

const here = dirname(dirname(fileURLToPath(import.meta.url))); // cross-router/
const FW = "react";

// Which engines have a first-class API for each feature (wouter has none).
const SUPPORT = {
  data: ["real-router", "react-router", "tanstack"],
  search: ["real-router", "tanstack"],
  guard: ["real-router", "react-router", "tanstack"],
};

const ASSERT = {
  // Data is loaded ON navigation (not static) → loaded-value appears after click.
  async data(page, baseURL) {
    await page.goto(baseURL, { waitUntil: "load" });
    await page.click('[data-testid="link-data"]');
    await page.waitForSelector('[data-testid="loaded-value"]', { timeout: 6000 });
    const text = (await page.textContent('[data-testid="loaded-value"]')) ?? "";
    return text.includes("loaded-42");
  },
  // Raw string "5" is coerced to a typed number 5 by the schema (validation).
  async search(page, baseURL) {
    await page.goto(new URL("search?n=5", baseURL).href, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="validated-type"]', { timeout: 6000 });
    const type = (await page.textContent('[data-testid="validated-type"]')) ?? "";
    const value = (await page.textContent('[data-testid="validated-n"]')) ?? "";
    return type.trim() === "number" && value.trim() === "5";
  },
  // Guard blocks leaving while dirty; after Save it allows navigation.
  async guard(page, baseURL) {
    await page.goto(new URL("editor", baseURL).href, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="page-editor"]');
    await page.click('[data-testid="link-home"]');
    await page.waitForTimeout(300);
    const stillBlocked = await page.$('[data-testid="page-editor"]');
    if (!stillBlocked) return false; // navigation was NOT blocked → fail
    await page.click('[data-testid="btn-save"]');
    await page.waitForTimeout(120);
    await page.click('[data-testid="link-home"]');
    await page.waitForSelector('[data-testid="page-home"]', { timeout: 3000 });
    return true; // navigated after save → blocking + release both work
  },
};

const browser = await chromium.launch();
const out = {};

try {
  for (const [feature, engines] of Object.entries(SUPPORT)) {
    out[feature] = {};
    for (const engine of engines) {
      const root = `${here}/apps/${FW}/${engine}/${feature}`;
      const configFile = `${root}/vite.config.ts`;
      if (!existsSync(configFile)) {
        out[feature][engine] = "MISSING-APP";
        console.error(`? ${feature} × ${engine}: no app`);
        continue;
      }
      await build({ root, configFile, logLevel: "error" });
      const server = await preview({
        root,
        configFile,
        preview: { port: 0 },
        logLevel: "error",
      });
      const context = await browser.newContext();
      const page = await context.newPage();
      let ok = false;
      try {
        ok = await ASSERT[feature](page, server.resolvedUrls.local[0]);
      } catch (error) {
        console.error(`  ${feature} × ${engine}: ${error.message}`);
      }
      await context.close();
      await server.close();
      out[feature][engine] = ok ? "verified" : "FAIL";
      console.error(`${ok ? "✓" : "✗"} ${feature} × ${engine}`);
    }
  }
} finally {
  await browser.close();
}

mkdirSync(`${here}/results/${FW}`, { recursive: true });
writeFileSync(
  `${here}/results/${FW}/features.json`,
  `${JSON.stringify(out, null, 2)}\n`,
);
console.log(JSON.stringify(out, null, 2));

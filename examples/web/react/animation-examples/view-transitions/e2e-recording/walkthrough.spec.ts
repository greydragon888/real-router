import { expect, test } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  applyPalette,
  GIFEncoder,
  quantize,
  // eslint-disable-next-line import-x/extensions
} from "gifenc/dist/gifenc.esm.js";
import { PNG } from "pngjs";

interface CapturedFrame {
  buffer: Buffer;
  timestamp: number;
}

const ROOT_VT_HOLD_MS = 2700;
const HERO_VT_HOLD_MS = 1700;
const AREA_VT_HOLD_MS = 1100;

test("view-transitions walkthrough → looped GIF", async ({ page, context }) => {
  test.setTimeout(180_000);

  const cdp = await context.newCDPSession(page);
  const frames: CapturedFrame[] = [];

  cdp.on("Page.screencastFrame", (event) => {
    frames.push({
      buffer: Buffer.from(event.data, "base64"),
      timestamp: event.metadata.timestamp ?? Date.now() / 1000,
    });
    cdp
      .send("Page.screencastFrameAck", { sessionId: event.sessionId })
      .catch(() => {
        /* session may already be closed */
      });
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "View Transitions" }),
  ).toBeVisible();

  const supportsVT = await page.evaluate(
    () => typeof document.startViewTransition === "function",
  );
  expect(supportsVT, "headless Chromium must support View Transitions").toBe(
    true,
  );

  await cdp.send("Page.startScreencast", {
    format: "png",
    everyNthFrame: 4,
    maxWidth: 1024,
    maxHeight: 576,
  });

  await page.waitForTimeout(400);

  await page.getByRole("link", { name: "Products", exact: true }).click();
  await page.waitForURL(/\/products(\?|$)/);
  await page.waitForTimeout(ROOT_VT_HOLD_MS);

  await page.getByRole("link", { name: /^Z\s*→\s*A$/ }).click();
  await page.waitForURL(/sort=desc/);
  await page.waitForTimeout(AREA_VT_HOLD_MS);

  await page.getByRole("link", { name: /^A\s*→\s*Z$/ }).click();
  await page.waitForURL(/sort=asc/);
  await page.waitForTimeout(AREA_VT_HOLD_MS);

  await page.getByRole("link", { name: "Crimson Flask" }).click();
  await page.waitForURL(/\/products\/1/);
  await page.waitForTimeout(HERO_VT_HOLD_MS);

  await page.getByRole("link", { name: /Back to products/ }).click();
  await page.waitForURL(/\/products(\?|$)/);
  await page.waitForTimeout(HERO_VT_HOLD_MS);

  await page.getByRole("link", { name: "Emerald Prism" }).click();
  await page.waitForURL(/\/products\/3/);
  await page.waitForTimeout(HERO_VT_HOLD_MS);

  await page.goBack();
  await page.waitForURL(/\/products(\?|$)/);
  await page.waitForTimeout(HERO_VT_HOLD_MS);

  await page.getByRole("link", { name: "Query demo", exact: true }).click();
  await page.waitForURL(/query-demo/);
  await page.waitForTimeout(ROOT_VT_HOLD_MS);

  for (const filter of ["letter", "number", "color", "all"] as const) {
    await page.getByRole("link", { name: filter, exact: true }).click();
    await page.waitForURL(new RegExp(`filter=${filter}`));
    await page.waitForTimeout(AREA_VT_HOLD_MS);
  }

  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page.waitForURL(/\/$/);
  await page.waitForTimeout(ROOT_VT_HOLD_MS);

  await cdp.send("Page.stopScreencast");
  await page.waitForTimeout(100);

  expect(frames.length).toBeGreaterThan(40);

  const MIN_DELAY_MS = 80;
  const MAX_DELAY_MS = 250;

  const sampled: CapturedFrame[] = [];
  let lastTimestamp = -Infinity;
  for (const frame of frames) {
    if ((frame.timestamp - lastTimestamp) * 1000 >= MIN_DELAY_MS) {
      sampled.push(frame);
      lastTimestamp = frame.timestamp;
    }
  }

  const encoder = GIFEncoder();

  for (let i = 0; i < sampled.length; i++) {
    const cur = sampled[i];
    const next = sampled[i + 1];
    const png = PNG.sync.read(cur.buffer);
    const palette = quantize(png.data, 256, { format: "rgb565" });
    const indexed = applyPalette(png.data, palette, "rgb565");

    const deltaMs = next
      ? Math.round((next.timestamp - cur.timestamp) * 1000)
      : 150;
    const delay = Math.max(MIN_DELAY_MS, Math.min(MAX_DELAY_MS, deltaMs));

    encoder.writeFrame(indexed, png.width, png.height, {
      palette,
      delay,
      repeat: 0,
    });

    if ((i + 1) % 25 === 0 || i === sampled.length - 1) {
      console.log(`[GIF] encoded ${i + 1} / ${sampled.length} frames`);
    }
  }

  encoder.finish();

  const outDir = path.resolve(process.cwd(), "recordings");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "walkthrough.gif");
  fs.writeFileSync(outPath, Buffer.from(encoder.bytes()));

  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(
    `[GIF] saved ${sampled.length}/${frames.length} frames → ${outPath} (${sizeKb} KB)`,
  );
});

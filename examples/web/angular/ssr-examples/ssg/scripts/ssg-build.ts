// SSG strategy: spin up the compiled SSR server (built via outputMode: server),
// fetch each URL through the live AngularNodeAppEngine, and persist the
// streamed HTML to disk. This reuses the exact same render pipeline that the
// runtime SSR server uses — guaranteeing identical output between dev SSR and
// build-time SSG, with provideRealRouterFactory + REQUEST flowing through
// AngularNodeAppEngine's request scope.
//
// Alternative (renderApplication + main.server.mjs) hits NG0201 with the
// current @angular/ssr 21.2 setup; the in-process server approach avoids the
// platformProviders REQUEST propagation mismatch.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { UNKNOWN_ROUTE } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { getStaticPaths } from "@real-router/ssr-utils";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";

import { createBaseRouter } from "../src/router/createBaseRouter";
import { entries } from "../src/router/entries";
import { loaders } from "../src/router/loaders";
import {
  NOT_FOUND_META,
  getMetaForState,
  type PageMeta,
} from "../src/router/meta";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const browserDist = path.resolve(root, "dist/ssg-angular-example/browser");
const serverDist = path.resolve(root, "dist/ssg-angular-example/server");

const SITE_ORIGIN =
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  process.env.SITE_ORIGIN ?? "https://example.com";

interface ServerModule {
  app: { listen: (port: number, cb: () => void) => unknown };
}

const serverModule = (await import(
  path.resolve(serverDist, "server.mjs")
)) as ServerModule;

const port = 4174;

await new Promise<void>((resolve) => {
  serverModule.app.listen(port, () => {
    resolve();
  });
});

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function joinUrl(origin: string, path: string): string {
  if (!path.startsWith("/")) {
    return `${origin}/${path}`;
  }

  return `${origin}${path}`;
}

function renderMetaBlock(meta: PageMeta): string {
  const canonical = joinUrl(SITE_ORIGIN, meta.canonicalPath);
  const ogImage = joinUrl(SITE_ORIGIN, meta.ogImagePath ?? "/og/default.png");

  return [
    `<title>${escapeHtml(meta.title)}</title>`,
    `    <meta name="description" content="${escapeHtml(meta.description)}" />`,
    `    <link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `    <meta property="og:type" content="${escapeHtml(meta.ogType)}" />`,
    `    <meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `    <meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `    <meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `    <meta property="og:image" content="${escapeHtml(ogImage)}" />`,
    `    <meta name="twitter:card" content="summary_large_image" />`,
  ].join("\n");
}

function injectMeta(html: string, meta: PageMeta): string {
  return html.replace("<!--ssg-meta-->", renderMetaBlock(meta));
}

async function resolveMetaForUrl(url: string): Promise<PageMeta> {
  const router = cloneRouter(createBaseRouter());

  router.usePlugin(ssrDataPluginFactory(loaders));

  try {
    const state = await router.start(url);

    return state.name === UNKNOWN_ROUTE
      ? NOT_FOUND_META
      : getMetaForState(state);
  } finally {
    router.dispose();
  }
}

async function fetchRendered(url: string): Promise<string> {
  const response = await fetch(`http://localhost:${port}${url}`);

  if (!response.ok && response.status !== 404) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.text();
}

async function renderUrl(url: string): Promise<string> {
  const [html, meta] = await Promise.all([
    fetchRendered(url),
    resolveMetaForUrl(url),
  ]);

  return injectMeta(html, meta);
}

const baseRouter = createBaseRouter();

// `getStaticPaths` enumerates leaf routes only — it returns
// `/users/<id>/posts` for nested routes, but skips the intermediate
// `/users/<id>` profile pages (which now have a child `posts`). Add them
// explicitly so each user has both a profile page and a posts page.
const leafPaths = await getStaticPaths(baseRouter, entries);
const profilePaths = leafPaths
  .map((p) => p.replace(/\/posts$/, ""))
  .filter((p) => /\/users\/[^/]+$/.test(p));

const dedupedPaths = [
  ...new Set<string>([...leafPaths, ...profilePaths, "/users"]),
];

console.log(
  `Pre-rendering ${dedupedPaths.length} routes via in-process SSR...`,
);

const failed: { url: string; error: string }[] = [];

for (const url of dedupedPaths) {
  try {
    const html = await renderUrl(url);

    const filePath =
      url === "/"
        ? path.resolve(browserDist, "index.html")
        : path.resolve(browserDist, url.slice(1), "index.html");

    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, html);
    console.log(`  ${url} → ${path.relative(root, filePath)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    console.error(`  ${url} ✗ ${message}`);
    failed.push({ url, error: message });
  }
}

if (failed.length > 0) {
  console.error(
    `\nBuild failed: ${failed.length}/${dedupedPaths.length} routes errored.`,
  );
  for (const { url, error } of failed) {
    console.error(`  ${url}: ${error}`);
  }

  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1);
}

const notFoundHtml = await renderUrl("/__nonexistent");

writeFileSync(path.resolve(browserDist, "404.html"), notFoundHtml);
console.log(`  /__nonexistent → dist/.../404.html`);

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...dedupedPaths.map((url) => {
    const fullUrl = `${SITE_ORIGIN}${url}`;

    return `  <url><loc>${escapeHtml(fullUrl)}</loc></url>`;
  }),
  "</urlset>",
  "",
].join("\n");

writeFileSync(path.resolve(browserDist, "sitemap.xml"), sitemap);
console.log(`  sitemap.xml → ${dedupedPaths.length} URLs`);

baseRouter.dispose();

// Force exit to terminate the in-process SSR server (no graceful shutdown
// needed — the build script process owns the listener).
// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);

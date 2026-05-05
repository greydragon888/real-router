import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.resolve(root, "dist");

const SITE_ORIGIN =
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  process.env.SITE_ORIGIN ?? "https://example.com";

const template = readFileSync(path.resolve(dist, "index.html"), "utf8");

interface MetaTags {
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
}

const { render, getStaticPaths } = (await import(
  path.resolve(root, "dist/server/entry-server.js")
)) as {
  render: (url: string) => Promise<{
    html: string;
    ssrJson: string;
    statusCode: number;
    meta: MetaTags;
  }>;
  getStaticPaths: () => Promise<string[]>;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderMetaBlock(meta: MetaTags): string {
  return [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.ogTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.ogDescription)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`,
  ].join("\n    ");
}

function renderPage(
  result: {
    html: string;
    ssrJson: string;
    meta: MetaTags;
  },
  options: { withSsrState: boolean },
): string {
  const ssrScript = options.withSsrState
    ? `<script>window.__SSR_STATE__=${result.ssrJson}</script>`
    : "";

  return template
    .replace("<!--ssr-meta-->", renderMetaBlock(result.meta))
    .replace("<!--ssr-outlet-->", result.html)
    .replace("<!--ssr-state-->", ssrScript);
}

// `getStaticPaths` enumerates leaf routes — `/users/<id>/posts` for
// nested routes; manually add intermediate `/users/<id>` and `/users`
// (the parent UsersList route).
const leafPaths = await getStaticPaths();
const profilePaths = leafPaths
  .map((p) => p.replace(/\/posts$/, ""))
  .filter((p) => /\/users\/[^/]+$/.test(p));
const paths = Array.from(
  new Set<string>([...leafPaths, ...profilePaths, "/users"]),
);

console.log(`Pre-rendering ${paths.length} routes...`);

const failed: { url: string; error: string }[] = [];

for (const url of paths) {
  try {
    const result = await render(url);

    const html = renderPage(result, { withSsrState: true });

    const filePath =
      url === "/"
        ? path.resolve(dist, "index.html")
        : path.resolve(dist, url.slice(1), "index.html");

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
    `\nBuild failed: ${failed.length}/${paths.length} routes errored.`,
  );

  for (const { url, error } of failed) {
    console.error(`  ${url}: ${error}`);
  }

  // eslint-disable-next-line unicorn/no-process-exit -- CLI build script
  process.exit(1);
}

// Render the not-found page to dist/404.html. Hosting platforms
// (Netlify, Vercel, Cloudflare Pages) commonly serve /404.html for
// unknown paths automatically when present in the build output.
const notFound = await render("/__nonexistent");
const notFoundHtml = renderPage(notFound, { withSsrState: false });

writeFileSync(path.resolve(dist, "404.html"), notFoundHtml);
console.log(`  /__nonexistent → dist/404.html (not-found template)`);

// sitemap.xml — list every pre-rendered URL with the site origin.
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...paths.map((url) => {
    const fullUrl = `${SITE_ORIGIN}${url}`;

    return `  <url><loc>${escapeHtml(fullUrl)}</loc></url>`;
  }),
  "</urlset>",
  "",
].join("\n");

writeFileSync(path.resolve(dist, "sitemap.xml"), sitemap);
console.log(`  sitemap.xml → ${paths.length} URLs`);

console.log("Done!");

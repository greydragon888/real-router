import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.resolve(root, "dist");

// Site origin for sitemap.xml. Override via env when deploying.
const SITE_ORIGIN =
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  process.env.SITE_ORIGIN ?? "https://example.com";

const template = readFileSync(path.resolve(dist, "index.html"), "utf8");

const { render, getStaticPaths } = (await import(
  path.resolve(root, "dist/server/entry-server.js")
)) as {
  render: (url: string) => Promise<{
    html: string;
    ssrJson: string;
    statusCode: number;
    meta: { title: string; description: string };
  }>;
  getStaticPaths: () => Promise<string[]>;
};

interface MetaTags {
  title: string;
  description: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderMetaBlock(meta: MetaTags): string {
  return `<title>${escapeHtml(meta.title)}</title>\n    <meta name="description" content="${escapeHtml(meta.description)}" />`;
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

// getStaticPaths returns only leaf routes. The non-leaf parent `users`
// (UsersList) is also a meaningful page, so include `/users` manually.
const paths = [...(await getStaticPaths()), "/users"];

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

  process.exit(1);
}

// Render the not-found page to dist/404.html. vite preview's `appType: "mpa"`
// + the ssgServe middleware redirect /foo → /foo/ which 404s naturally;
// hosting platforms (Netlify, Vercel, Cloudflare Pages) commonly serve
// /404.html for unknown paths automatically when present in the build output.
const notFound = await render("/__nonexistent");
const notFoundHtml = renderPage(notFound, { withSsrState: false });
writeFileSync(path.resolve(dist, "404.html"), notFoundHtml);
console.log(`  /__nonexistent → dist/404.html (not-found template)`);

// sitemap.xml — list every pre-rendered URL with the site origin.
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...paths.map(
    (url) =>
      `  <url><loc>${escapeHtml(`${SITE_ORIGIN}${url}`)}</loc></url>`,
  ),
  "</urlset>",
  "",
].join("\n");
writeFileSync(path.resolve(dist, "sitemap.xml"), sitemap);
console.log(`  sitemap.xml → ${paths.length} URLs`);

console.log("Done!");

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.resolve(root, "dist");

const template = readFileSync(path.resolve(dist, "index.html"), "utf8");

const { render, getStaticPaths } = (await import(
  path.resolve(root, "dist/server/entry-server.js")
)) as {
  render: (
    url: string,
  ) => Promise<{ html: string; ssrJson: string; statusCode: number }>;
  getStaticPaths: () => Promise<string[]>;
};

// getStaticPaths returns only leaf routes. The non-leaf parent `users`
// (UsersList) is also a meaningful page, so include `/users` manually.
const paths = [...(await getStaticPaths()), "/users"];

console.log(`Pre-rendering ${paths.length} routes...`);

for (const url of paths) {
  const result = await render(url);

  const ssrScript = `<script>window.__SSR_STATE__=${result.ssrJson}</script>`;

  const html = template
    .replace("<!--ssr-outlet-->", result.html)
    .replace("<!--ssr-state-->", ssrScript);

  const filePath =
    url === "/"
      ? path.resolve(dist, "index.html")
      : path.resolve(dist, url.slice(1), "index.html");

  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, html);
  console.log(`  ${url} → ${path.relative(root, filePath)}`);
}

console.log("Done!");

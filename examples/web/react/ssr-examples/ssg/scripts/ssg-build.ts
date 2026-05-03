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

const failed: { url: string; error: string }[] = [];

for (const url of paths) {
  try {
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
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

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

console.log("Done!");

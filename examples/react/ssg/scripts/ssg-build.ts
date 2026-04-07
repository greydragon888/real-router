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
  render: (url: string) => Promise<{ html: string; serializedData: string }>;
  getStaticPaths: () => Promise<string[]>;
};

const paths = await getStaticPaths();

console.log(`Pre-rendering ${paths.length} routes...`);

for (const url of paths) {
  const result = await render(url);

  const html = template
    .replace("<!--ssr-outlet-->", result.html)
    .replace("<!--ssr-state-->", result.serializedData);

  const filePath =
    url === "/"
      ? path.resolve(dist, "index.html")
      : path.resolve(dist, url.slice(1), "index.html");

  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, html);
  console.log(`  ${url} → ${path.relative(root, filePath)}`);
}

console.log("Done!");

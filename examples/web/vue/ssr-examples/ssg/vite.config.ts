import { extname } from "node:path";

import vue from "@vitejs/plugin-vue";
import { defineConfig, type Plugin } from "vite";

// Per-route HTTP cache policies for the **static-file** preview layer.
// SSG-context: ETag is auto from the static handler (Vite preview
// uses file mtime → weak ETag → conditional GET 304 for free).
// AbortController is N/A — there's no per-request render to cancel,
// just a file read. So this layer only adds Cache-Control freshness
// directives on top of the static handler.
//
// Rules are inline rather than in src/router/cache-policies.ts because
// vite.config.ts is loaded outside the project's main tsconfig and
// cross-imports between them trigger moduleResolution warnings.
const CACHE_RULES: ReadonlyArray<{
  match: (path: string) => boolean;
  header: string;
}> = [
  // Home: cacheable and long-lived; same for everyone.
  {
    match: (p) => p === "/" || p === "",
    header: "public, max-age=300, s-maxage=3600, must-revalidate",
  },
  // Users list: short public cache.
  {
    match: (p) => /^\/users\/?$/.test(p),
    header: "public, max-age=60, must-revalidate",
  },
  // User profile: per-user but not auth-private; medium cache.
  {
    match: (p) => /^\/users\/[^/]+\/?$/.test(p),
    header: "public, max-age=120, must-revalidate",
  },
];

function getCachePolicy(path: string): string | undefined {
  const onlyPath = path.split("?")[0] ?? path;

  for (const rule of CACHE_RULES) {
    if (rule.match(onlyPath) || rule.match(path)) {
      return rule.header;
    }
  }

  return undefined;
}

function ssgServe(): Plugin {
  return {
    name: "ssg-serve",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";

        if (!url.endsWith("/") && !extname(url)) {
          res.writeHead(301, { Location: url + "/" });
          res.end();
          return;
        }

        // Per-route Cache-Control on top of the static-file layer.
        // Vite preview's static handler force-sets `Cache-Control: no-
        // cache` for HTML responses AFTER our middleware runs; setting
        // the header before next() therefore gets overwritten. We
        // intercept writeHead to re-apply our policy at the moment
        // headers are about to be flushed. The static handler still
        // emits its own weak ETag (file mtime) which gives us the
        // conditional-GET 304 fast path for free.
        const cacheControl = getCachePolicy(url);
        if (cacheControl) {
          const originalWriteHead = res.writeHead.bind(res);
          res.writeHead = (...args: unknown[]) => {
            res.setHeader("Cache-Control", cacheControl);

            return (originalWriteHead as (...a: unknown[]) => typeof res)(
              ...args,
            );
          };
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [vue(), ssgServe()],
  appType: "mpa",
  resolve: {
    conditions: ["development"],
    dedupe: ["vue"],
  },
});

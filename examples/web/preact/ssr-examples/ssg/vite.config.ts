import path from "node:path";

import { preact } from "@preact/preset-vite";
import { defineConfig, type Plugin } from "vite";

// Per-route HTTP cache policies for the static-file preview layer.
// Inline rather than imported from src/ because vite.config.ts is
// loaded outside the project's main tsconfig and cross-imports
// trigger moduleResolution warnings.
const CACHE_RULES: readonly {
  matches: (pathname: string) => boolean;
  header: string;
}[] = [
  {
    matches: (p) => p === "/" || p === "",
    header: "public, max-age=300, s-maxage=3600, must-revalidate",
  },
  {
    matches: (p) => /^\/users\/?$/.test(p),
    header: "public, max-age=60, must-revalidate",
  },
  {
    matches: (p) => /^\/users\/[^/]+\/?$/.test(p),
    header: "public, max-age=120, must-revalidate",
  },
];

function getCachePolicy(pathname: string): string | undefined {
  const onlyPath = pathname.split("?", 1)[0] ?? pathname;

  for (const rule of CACHE_RULES) {
    if (rule.matches(onlyPath) || rule.matches(pathname)) {
      return rule.header;
    }
  }

  return undefined;
}

function ssgServe(): Plugin {
  return {
    name: "ssg-serve",
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url ?? "";

        if (!url.endsWith("/") && !path.extname(url)) {
          response.writeHead(301, { Location: `${url}/` });
          response.end();

          return;
        }

        const cacheControl = getCachePolicy(url);

        if (cacheControl) {
          const originalWriteHead = response.writeHead.bind(response);

          response.writeHead = (...args: unknown[]) => {
            response.setHeader("Cache-Control", cacheControl);

            return (originalWriteHead as (...a: unknown[]) => typeof response)(
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
  plugins: [preact(), ssgServe()],
  appType: "mpa",
  resolve: {
    conditions: ["development"],
    dedupe: ["preact", "preact/hooks", "preact/jsx-runtime"],
  },
});

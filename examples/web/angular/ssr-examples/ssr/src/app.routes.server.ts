import { RenderMode, type ServerRoute } from "@angular/ssr";

// Mixed RenderMode demo: most paths render fresh per request (per-cookie auth,
// per-query loaders), but some paths can opt out of server-side rendering and
// be served as a CSR shell — useful for highly interactive pages where SSR
// adds latency without SEO value (admin panels, signed-in dashboards, etc.).
//
// Pattern matching is first-match-wins, so the more specific paths are listed
// BEFORE the catch-all `**`.
//
// Note on RenderMode.Prerender: Angular 21's prerender pipeline bootstraps the
// app via `renderApplication` without supplying the `REQUEST` token, so
// `provideRealRouterFactory`'s `useFactory` sees `request === null` and falls
// back to `start("/")`. This means every prerendered URL would resolve to the
// home route. Until upstream `@angular/ssr` exposes the prerender URL through
// the application Injector, build-time pre-rendering for Real-Router-driven
// apps must use the in-process SSR pipeline (see ssg/ example) rather than
// `RenderMode.Prerender` here.
export const serverRoutes: ServerRoute[] = [
  {
    path: "marketing",
    renderMode: RenderMode.Client,
  },
  {
    path: "live",
    renderMode: RenderMode.Server,
  },
  // Declarative HTTP status + headers override. The SSR renderer still runs
  // (so the HTML body explains the sunset to humans), but the wire-level
  // status is pinned to 410 and the response advertises Sunset + Deprecation.
  // Compare with the loader-based mapping in server.ts (LOADER_NOT_FOUND →
  // 404, LOADER_REDIRECT → 301/302, LOADER_TIMEOUT → 504). Use this declarative
  // form when the status is a property of the URL itself (sunset endpoints,
  // intentionally-410 placeholders); use the loader form when the status
  // depends on the resolved data (e.g. user not in DB).
  {
    path: "gone",
    renderMode: RenderMode.Server,
    status: 410,
    headers: {
      Sunset: "Wed, 01 Jan 2025 00:00:00 GMT",
      Deprecation: "true",
      Link: '</marketing>; rel="successor-version"',
    },
  },
  {
    path: "**",
    renderMode: RenderMode.Server,
  },
];

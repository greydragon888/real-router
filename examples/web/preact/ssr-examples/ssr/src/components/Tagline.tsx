import type { JSX } from "preact";

// Loaded via `lazy(() => import("./Tagline"))` from Home.tsx. Default
// export is required because that's the shape `lazy()` consumes.
//
// Why this exists: it's the test fixture proving that
// `renderToStringAsync` (used by entry-server.tsx) awaits the dynamic
// import and inlines the resolved content into the final HTML —
// distinct from `renderToReadableStream`'s out-of-order chunked
// signature in ssr-streaming/. Both API'shave a place: streaming for
// TTFB-sensitive UX, async-single-shot for simpler pipelines and
// CDN-friendly full-document caching.
export default function Tagline(): JSX.Element {
  return (
    <p data-testid="tagline">
      <em>Real-Router — view-agnostic, plugin-extensible, SSR-ready.</em>
    </p>
  );
}

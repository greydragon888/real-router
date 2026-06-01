import { Link, RouteView, RouterProvider } from "@real-router/react";
import { useEffect, useState } from "react";

import { HashIndicator } from "./components/HashIndicator";
import { PluginBadge } from "./components/PluginBadge";
import { ScrollMeter } from "./components/ScrollMeter";
import { About } from "./pages/About";
import { Article } from "./pages/Article";
import { Guide } from "./pages/Guide";
import { Home } from "./pages/Home";

import type { Router } from "@real-router/core";
import type { JSX } from "react";

interface AppProps {
  readonly router: Router;
  readonly pluginKind: "browser" | "navigation";
  readonly spyMode: "provider" | "per-route";
}

const NAV_LINKS = [
  { routeName: "home", label: "Home" },
  { routeName: "article", label: "Article" },
  { routeName: "guide", label: "Guide" },
  { routeName: "about", label: "About" },
];

function selectorForPerRouteMode(routeName: string): string | undefined {
  if (routeName === "article") {
    return "[id]:is(h2)";
  }
  if (routeName === "guide") {
    return "[id]:is(h2):not(.no-spy)";
  }

  return undefined;
}

// rootMargin "0px 0px -20% 0px" sets the active zone to the upper 80% of the
// viewport (the [0, 0.8·vh] band). With section min-height: 80vh, this gives
// active-zone width ≈ section height — meaning section-N's h2 leaves the zone
// at the exact scroll position where section-(N+1)'s h2 enters. Zero dead
// scroll between sections; URL updates feel continuous as the user reads.
//
// The RFC default "-20% 0px -60% 0px" produces a narrow 20%-wide band near
// viewport top — good for short anchored snippets but creates a noticeable
// "stuck URL" feeling on long-form content where sections are taller than the
// band (URL stays at last-emitted hash until the next h2 enters the narrow
// band, which can be a full section-height of scrolling later).
//
// For this example (long article + tall sections), wider zone matches user
// expectations. Apps with short anchored fragments (datalists, tab UIs with
// auto-scroll into anchors) should keep the narrower default.
const SCROLL_SPY_ROOT_MARGIN = "0px 0px -20% 0px";

export function App({ router, pluginKind, spyMode }: AppProps): JSX.Element {
  const [routeName, setRouteName] = useState(
    () => router.getState()?.name ?? "",
  );

  useEffect(() => {
    return router.subscribe(({ route }) => {
      setRouteName(route.name);
    });
  }, [router]);

  const scrollSpyOptions =
    spyMode === "provider"
      ? { selector: "[id]:is(h2)", rootMargin: SCROLL_SPY_ROOT_MARGIN }
      : ((): { selector: string; rootMargin: string } | undefined => {
          const selector = selectorForPerRouteMode(routeName);

          return selector
            ? { selector, rootMargin: SCROLL_SPY_ROOT_MARGIN }
            : undefined;
        })();

  return (
    <RouterProvider
      router={router}
      scrollRestoration={{ mode: "restore", anchorScrolling: true }}
      scrollSpy={scrollSpyOptions}
    >
      <div className="app">
        <header className="header" data-testid="header">
          Real-Router — Scroll Spy Demo
          <PluginBadge pluginKind={pluginKind} />
        </header>
        <aside className="sidebar" data-testid="sidebar">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.routeName}
              routeName={link.routeName}
              data-testid={`nav-${link.routeName}`}
              activeStrict={false}
              ignoreQueryParams={true}
            >
              {link.label}
            </Link>
          ))}
        </aside>
        <main className="content">
          <RouteView nodeName="">
            <RouteView.Match segment="home">
              <Home pluginKind={pluginKind} spyMode={spyMode} />
            </RouteView.Match>
            <RouteView.Match segment="article">
              <Article />
            </RouteView.Match>
            <RouteView.Match segment="guide">
              <Guide />
            </RouteView.Match>
            <RouteView.Match segment="about">
              <About />
            </RouteView.Match>
            <RouteView.NotFound>
              <h1>404 — Page Not Found</h1>
            </RouteView.NotFound>
          </RouteView>
        </main>
        <HashIndicator />
        <ScrollMeter />
      </div>
    </RouterProvider>
  );
}

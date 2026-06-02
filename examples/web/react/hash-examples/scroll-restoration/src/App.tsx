import { Link, RouteView, RouterProvider } from "@real-router/react";
import { useState } from "react";

import { DirectionBadge } from "./components/DirectionBadge";
import { ScrollMeter } from "./components/ScrollMeter";
import { Article } from "./pages/Article";
import { Articles } from "./pages/Articles";
import { Documentation } from "./pages/Documentation";
import { Gallery } from "./pages/Gallery";
import { Home } from "./pages/Home";
import { Settings } from "./pages/Settings";

import type { Router } from "@real-router/core";
import type { JSX } from "react";

type Mode = "restore" | "top" | "native";

interface AppProps {
  readonly router: Router;
  readonly initialMode: Mode;
  readonly initialBehavior: ScrollBehavior;
}

const NAV_LINKS = [
  { routeName: "home", label: "Home", testId: "nav-home" },
  { routeName: "docs", label: "Docs", testId: "nav-docs" },
  { routeName: "articles", label: "Articles", testId: "nav-articles" },
  { routeName: "gallery", label: "Gallery", testId: "nav-gallery" },
  { routeName: "settings", label: "Settings", testId: "nav-settings" },
] as const;

export function App({
  router,
  initialMode,
  initialBehavior,
}: AppProps): JSX.Element {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [behavior, setBehavior] = useState<ScrollBehavior>(initialBehavior);

  return (
    // `key={`${mode}:${behavior}`}` forces RouterProvider to remount when
    // either changes. The utility's `useEffect` cleanup runs (destroys old
    // instance), then the new effect creates a fresh utility with updated
    // options. Router itself stays the same.
    <RouterProvider
      key={`${mode}:${behavior}`}
      router={router}
      scrollRestoration={{
        mode,
        behavior,
        // scrollContainer applies to the whole RouterProvider; lazy resolve
        // returns null on routes without #virtual-scroller → utility falls
        // back to window. Demonstrated as a feature in Scenario 6.
        scrollContainer: () => document.querySelector("#virtual-scroller"),
      }}
    >
      <div className="app">
        <header className="header">
          Real-Router — Scroll Restoration Demo
          <DirectionBadge />
        </header>
        <aside className="sidebar" data-testid="sidebar">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.routeName}
              routeName={link.routeName}
              data-testid={link.testId}
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
              <Home />
            </RouteView.Match>
            <RouteView.Match segment="docs">
              <Documentation />
            </RouteView.Match>
            <RouteView.Match segment="articles">
              <RouteView nodeName="articles">
                <RouteView.Self>
                  <Articles />
                </RouteView.Self>
                <RouteView.Match segment="article">
                  <Article />
                </RouteView.Match>
              </RouteView>
            </RouteView.Match>
            <RouteView.Match segment="gallery">
              <Gallery />
            </RouteView.Match>
            <RouteView.Match segment="settings">
              <Settings
                mode={mode}
                onModeChange={setMode}
                behavior={behavior}
                onBehaviorChange={setBehavior}
              />
            </RouteView.Match>
            <RouteView.NotFound>
              <h1>404 — Page Not Found</h1>
            </RouteView.NotFound>
          </RouteView>
        </main>
        <ScrollMeter />
      </div>
    </RouterProvider>
  );
}

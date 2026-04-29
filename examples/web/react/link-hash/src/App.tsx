import { RouteView } from "@real-router/react";

import { Dashboard } from "./pages/Dashboard";
import { Home } from "./pages/Home";
import { Settings } from "./pages/Settings";
import { Layout } from "../../shared/Layout";

import type { JSX } from "react";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "settings", label: "Settings" },
  { routeName: "dashboard", label: "Dashboard" },
];

export interface AppProps {
  /**
   * Active URL plugin. Selected at startup via `?plugin=hash` query string.
   * Drives runtime behavior (browser-plugin populates `state.context.url`,
   * hash-plugin warns on `<Link hash>`) and is rendered in the page header
   * so the user knows which plugin they're observing.
   */
  readonly pluginKind: "browser" | "hash";
}

export function App({ pluginKind }: AppProps): JSX.Element {
  return (
    <Layout
      title={`Real-Router — <Link hash> Example (${pluginKind}-plugin)`}
      links={links}
    >
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home pluginKind={pluginKind} />
        </RouteView.Match>
        <RouteView.Match segment="settings">
          <Settings pluginKind={pluginKind} />
        </RouteView.Match>
        <RouteView.Match segment="dashboard">
          <Dashboard />
        </RouteView.Match>
        <RouteView.NotFound>
          <h1>404 — Page Not Found</h1>
        </RouteView.NotFound>
      </RouteView>
    </Layout>
  );
}

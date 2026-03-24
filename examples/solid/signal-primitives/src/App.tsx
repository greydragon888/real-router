import { RouteView } from "@real-router/solid";

import { Home } from "./pages/Home";
import { NavigationMonitor } from "./pages/NavigationMonitor";
import { Layout } from "../../shared/Layout";

import type { JSX } from "solid-js";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "about", label: "About" },
  { routeName: "settings", label: "Settings" },
];

export function App(): JSX.Element {
  return (
    <Layout title="Real-Router — Signal Primitives" links={links}>
      <NavigationMonitor />
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home />
        </RouteView.Match>
        <RouteView.Match segment="about">
          <h1>About</h1>
          <p>Navigate between pages — the monitor above updates in real-time.</p>
        </RouteView.Match>
        <RouteView.Match segment="settings">
          <h1>Settings</h1>
          <p>Navigate between pages — the monitor above updates in real-time.</p>
        </RouteView.Match>
        <RouteView.NotFound>
          <h1>404 — Page Not Found</h1>
        </RouteView.NotFound>
      </RouteView>
    </Layout>
  );
}

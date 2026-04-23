import { RouteView, useRoute } from "@real-router/react";

import { About } from "./pages/About";
import { Home } from "./pages/Home";
import { Settings } from "./pages/Settings";
import { Layout } from "../../shared/Layout";

import type { JSX } from "react";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "about", label: "About" },
  { routeName: "settings", label: "Settings" },
];

function HmrStatus(): JSX.Element {
  const { route } = useRoute();

  return (
    <p style={{ fontSize: "13px", color: "#888", marginTop: "16px" }}>
      Current route: <strong>{route?.name ?? "—"}</strong>
    </p>
  );
}

export function App(): JSX.Element {
  return (
    <Layout title="Real-Router — HMR" links={links}>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home />
        </RouteView.Match>
        <RouteView.Match segment="about">
          <About />
        </RouteView.Match>
        <RouteView.Match segment="settings">
          <Settings />
        </RouteView.Match>
        <RouteView.NotFound>
          <h1>404 — Page Not Found</h1>
          <p>The page you are looking for does not exist.</p>
        </RouteView.NotFound>
      </RouteView>
      <HmrStatus />
    </Layout>
  );
}

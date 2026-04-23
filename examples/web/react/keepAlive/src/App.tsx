import { RouteView } from "@real-router/react";

import { Dashboard } from "./pages/Dashboard";
import { Home } from "./pages/Home";
import { Reports } from "./pages/Reports";
import { Settings } from "./pages/Settings";
import { Layout } from "../../shared/Layout";

import type { JSX } from "react";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "dashboard", label: "Dashboard" },
  { routeName: "settings", label: "Settings" },
  { routeName: "reports", label: "Reports" },
];

export function App(): JSX.Element {
  return (
    <Layout title="Real-Router — keepAlive" links={links}>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home />
        </RouteView.Match>
        {/*
          keepAlive: Dashboard stays mounted in the background (Activity mode="hidden").
          Form value and scroll position are preserved when navigating away and back.
        */}
        <RouteView.Match segment="dashboard" keepAlive>
          <Dashboard />
        </RouteView.Match>
        {/*
          No keepAlive: Settings unmounts on leave.
          Form value resets every time you navigate back.
        */}
        <RouteView.Match segment="settings">
          <Settings />
        </RouteView.Match>
        <RouteView.Match segment="reports">
          <Reports />
        </RouteView.Match>
        <RouteView.NotFound>
          <h1>404 — Page Not Found</h1>
          <p>The page you are looking for does not exist.</p>
        </RouteView.NotFound>
      </RouteView>
    </Layout>
  );
}

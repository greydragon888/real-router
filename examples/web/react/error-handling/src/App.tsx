import { RouteView } from "@real-router/react";

import { ErrorPanel } from "./pages/ErrorPanel";
import { Home } from "./pages/Home";
import { Layout } from "../../shared/Layout";

import type { JSX } from "react";

const links = [{ routeName: "home", label: "Home" }];

export function App(): JSX.Element {
  return (
    <Layout title="Real-Router — Error Handling" links={links}>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home />
        </RouteView.Match>
        <RouteView.Match segment="about">
          <h1>About</h1>
          <p>You were redirected here after cancelling the slow navigation.</p>
        </RouteView.Match>
        <RouteView.NotFound>
          <h1>404 — Page Not Found</h1>
          <p>
            This page is shown when navigating to an unknown URL via browser
            address bar (<code>allowNotFound: true</code>). Navigating by name
            with an unknown route name throws <code>ROUTE_NOT_FOUND</code>{" "}
            regardless of this setting.
          </p>
        </RouteView.NotFound>
      </RouteView>
      <ErrorPanel />
    </Layout>
  );
}

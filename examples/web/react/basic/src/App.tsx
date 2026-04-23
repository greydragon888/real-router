import { RouteView } from "@real-router/react";

import { About } from "./pages/About";
import { Contacts } from "./pages/Contacts";
import { Home } from "./pages/Home";
import { Layout } from "../../shared/Layout";

import type { JSX } from "react";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "about", label: "About" },
  { routeName: "contacts", label: "Contacts" },
];

export function App(): JSX.Element {
  return (
    <Layout title="Real-Router — Basic" links={links}>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home />
        </RouteView.Match>
        <RouteView.Match segment="about">
          <About />
        </RouteView.Match>
        <RouteView.Match segment="contacts">
          <Contacts />
        </RouteView.Match>
        <RouteView.NotFound>
          <h1>404 — Page Not Found</h1>
          <p>The page you are looking for does not exist.</p>
        </RouteView.NotFound>
      </RouteView>
    </Layout>
  );
}

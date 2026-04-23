import { RouteView } from "@real-router/preact";

import { ProgressBar } from "./components/ProgressBar";
import { About } from "./pages/About";
import { Checkout } from "./pages/Checkout";
import { Editor } from "./pages/Editor";
import { Home } from "./pages/Home";
import { Layout } from "../../shared/Layout";

import type { JSX } from "preact";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "checkout", label: "Checkout" },
  { routeName: "editor", label: "Editor" },
  { routeName: "about", label: "About" },
];

export function App(): JSX.Element {
  return (
    <Layout title="Real-Router — Async Guards" links={links}>
      <ProgressBar />
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home />
        </RouteView.Match>
        <RouteView.Match segment="checkout">
          <Checkout />
        </RouteView.Match>
        <RouteView.Match segment="editor">
          <Editor />
        </RouteView.Match>
        <RouteView.Match segment="about">
          <About />
        </RouteView.Match>
        <RouteView.NotFound>
          <h1>404 — Page Not Found</h1>
        </RouteView.NotFound>
      </RouteView>
    </Layout>
  );
}

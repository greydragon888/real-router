import { RouteView, useNavigator, useRoute } from "@real-router/solid";

import { About } from "./pages/About";
import { Contacts } from "./pages/Contacts";
import { Home } from "./pages/Home";
import { Layout } from "../../shared/Layout";

import type { JSX } from "solid-js";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "about", label: "About" },
  { routeName: "contacts", label: "Contacts" },
];

function ParamsToolbar(): JSX.Element {
  const routeState = useRoute();
  const navigator = useNavigator();

  const lang = () => (routeState().route?.params.lang as string | undefined) ?? "en";
  const theme = () => (routeState().route?.params.theme as string | undefined) ?? "light";

  const navigate = (newParams: Record<string, string>) => {
    const route = routeState().route;

    void navigator.navigate(
      route?.name ?? "home",
      {
        ...route?.params,
        ...newParams,
      },
      { reload: true },
    );
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "16px",
        "margin-bottom": "16px",
        "align-items": "center",
      }}
    >
      <div>
        <strong>Lang:</strong>{" "}
        <button
          class={lang() === "en" ? "primary" : ""}
          onClick={() => {
            navigate({ lang: "en" });
          }}
        >
          EN
        </button>{" "}
        <button
          class={lang() === "ru" ? "primary" : ""}
          onClick={() => {
            navigate({ lang: "ru" });
          }}
        >
          RU
        </button>
      </div>
      <div>
        <strong>Theme:</strong>{" "}
        <button
          class={theme() === "light" ? "primary" : ""}
          onClick={() => {
            navigate({ theme: "light" });
          }}
        >
          Light
        </button>{" "}
        <button
          class={theme() === "dark" ? "primary" : ""}
          onClick={() => {
            navigate({ theme: "dark" });
          }}
        >
          Dark
        </button>
      </div>
      <span style={{ "font-size": "13px", color: "#888" }}>
        URL:{" "}
        <code>
          ?lang={lang()}&theme={theme()}
        </code>
      </span>
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <Layout title="Real-Router — Persistent Params" links={links}>
      <ParamsToolbar />
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
        </RouteView.NotFound>
      </RouteView>
    </Layout>
  );
}

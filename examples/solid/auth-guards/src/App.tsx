import { getDependenciesApi, getRoutesApi } from "@real-router/core/api";
import { RouteView, useNavigator } from "@real-router/solid";
import { createEffect, createSignal, onCleanup } from "solid-js";

import { Admin } from "./pages/Admin";
import { Contacts } from "./pages/Contacts";
import { Dashboard } from "./pages/Dashboard";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Services } from "./pages/Services";
import { Settings } from "./pages/Settings";
import { router } from "./router";
import { publicRoutes, privateRoutes } from "./routes";
import { defineAbilities } from "../../../shared/abilities";
import { store } from "../../../shared/store";
import { Layout } from "../../shared/Layout";

import type { User } from "../../../shared/api";
import type { JSX } from "solid-js";

export function App(): JSX.Element {
  const navigator = useNavigator();

  const [user, setUser] = createSignal<User | null>(
    store.get("user") as User | null,
  );

  createEffect(() => {
    const unsub = store.subscribe(() =>
      setUser(store.get("user") as User | null),
    );

    onCleanup(unsub);
  });

  const links = () =>
    user()
      ? [
          { routeName: "dashboard", label: "Dashboard" },
          { routeName: "settings", label: "Settings" },
          { routeName: "admin", label: "Admin" },
        ]
      : [
          { routeName: "home", label: "Home" },
          { routeName: "services", label: "Services" },
          { routeName: "contacts", label: "Contacts" },
          { routeName: "login", label: "Login" },
        ];

  const onLogin = async (loggedInUser: User) => {
    store.set("user", loggedInUser);
    getDependenciesApi(router).set(
      "abilities",
      defineAbilities(loggedInUser.role),
    );
    const routesApi = getRoutesApi(router);

    routesApi.clear();
    routesApi.add(privateRoutes);
    await navigator.navigate("dashboard");
  };

  const onLogout = async () => {
    store.set("user", null);
    getDependenciesApi(router).set("abilities", []);
    const routesApi = getRoutesApi(router);

    routesApi.clear();
    routesApi.add(publicRoutes);
    await navigator.navigate("home");
  };

  return (
    <Layout title="Real-Router — Auth Guards" links={links()}>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home />
        </RouteView.Match>
        <RouteView.Match segment="services">
          <Services />
        </RouteView.Match>
        <RouteView.Match segment="contacts">
          <Contacts />
        </RouteView.Match>
        <RouteView.Match segment="login">
          <Login onLogin={onLogin} />
        </RouteView.Match>
        <RouteView.Match segment="dashboard">
          <Dashboard onLogout={onLogout} />
        </RouteView.Match>
        <RouteView.Match segment="settings">
          <Settings />
        </RouteView.Match>
        <RouteView.Match segment="admin">
          <Admin />
        </RouteView.Match>
        <RouteView.NotFound>
          <h1>404 — Page Not Found</h1>
          <p>This route does not exist in the current route tree.</p>
          <p>
            Try logging in or out — the available routes change based on
            authentication state.
          </p>
        </RouteView.NotFound>
      </RouteView>
    </Layout>
  );
}

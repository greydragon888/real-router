import { getDependenciesApi, getRoutesApi } from "@real-router/core/api";
import { RouteView, useNavigator } from "@real-router/solid";
import { createEffect, createSignal, lazy, onCleanup } from "solid-js";

import { ProgressBar } from "./components/ProgressBar";
import { Admin } from "./pages/Admin";
import { Checkout } from "./pages/Checkout";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { ProductDetail } from "./pages/ProductDetail";
import { ProductList } from "./pages/ProductList";
import { Settings } from "./pages/Settings";
import { UsersLayout } from "./pages/UsersLayout";
import { router } from "./router";
import { publicRoutes, privateRoutes } from "./routes";
import { defineAbilities } from "../../../shared/abilities";
import { store } from "../../../shared/store";
import { Layout } from "../../shared/Layout";

import type { User } from "../../../shared/api";
import type { JSX } from "solid-js";

const LazyDashboard = lazy(() => import("./pages/Dashboard"));

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

  const privateLinks = [
    { routeName: "dashboard", label: "Dashboard" },
    { routeName: "products", label: "Products" },
    { routeName: "users", label: "Users" },
    { routeName: "settings", label: "Settings" },
    { routeName: "admin", label: "Admin" },
    { routeName: "checkout", label: "Checkout" },
  ];

  const publicLinks = [
    { routeName: "home", label: "Home" },
    { routeName: "login", label: "Login" },
  ];

  const links = () => (user() ? privateLinks : publicLinks);

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
    <Layout title="Real-Router — Combined" links={links()}>
      <ProgressBar />
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home />
        </RouteView.Match>
        <RouteView.Match segment="login">
          <Login onLogin={onLogin} />
        </RouteView.Match>
        <RouteView.Match
          segment="dashboard"
          fallback={<span class="spinner" />}
        >
          <LazyDashboard onLogout={onLogout} />
        </RouteView.Match>
        <RouteView.Match segment="products">
          <RouteView nodeName="products">
            <RouteView.Match segment="list">
              <ProductList />
            </RouteView.Match>
            <RouteView.Match segment="detail">
              <ProductDetail />
            </RouteView.Match>
          </RouteView>
        </RouteView.Match>
        <RouteView.Match segment="users">
          <UsersLayout />
        </RouteView.Match>
        <RouteView.Match segment="settings">
          <Settings />
        </RouteView.Match>
        <RouteView.Match segment="admin">
          <Admin />
        </RouteView.Match>
        <RouteView.Match segment="checkout">
          <Checkout />
        </RouteView.Match>
        <RouteView.NotFound>
          <h1>404 — Page Not Found</h1>
          <p>The page you are looking for does not exist.</p>
          <p>Try logging in — available routes change based on auth state.</p>
        </RouteView.NotFound>
      </RouteView>
    </Layout>
  );
}

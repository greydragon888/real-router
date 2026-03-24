<script lang="ts">
  import { getDependenciesApi, getRoutesApi } from "@real-router/core/api";
  import { RouterProvider, RouteView } from "@real-router/svelte";
  import type { Router } from "@real-router/core";
  import Layout from "../../shared/Layout.svelte";
  import ProgressBar from "./components/ProgressBar.svelte";
  import Home from "./pages/Home.svelte";
  import Login from "./pages/Login.svelte";
  import Dashboard from "./pages/Dashboard.svelte";
  import ProductList from "./pages/ProductList.svelte";
  import ProductDetail from "./pages/ProductDetail.svelte";
  import UsersLayout from "./pages/UsersLayout.svelte";
  import Settings from "./pages/Settings.svelte";
  import Admin from "./pages/Admin.svelte";
  import Checkout from "./pages/Checkout.svelte";
  import { publicRoutes, privateRoutes } from "./routes";
  import { defineAbilities } from "../../../shared/abilities";
  import { store } from "../../../shared/store";

  import type { User } from "../../../shared/api";
  import type { AppDependencies } from "./types";

  let { router }: { router: Router<AppDependencies> } = $props();

  let user = $state(store.get("user") as User | null);

  $effect(() => {
    return store.subscribe(() => {
      user = store.get("user") as User | null;
    });
  });

  const links = $derived(
    user
      ? [
          { routeName: "dashboard", label: "Dashboard" },
          { routeName: "products", label: "Products" },
          { routeName: "users", label: "Users" },
          { routeName: "settings", label: "Settings" },
          { routeName: "admin", label: "Admin" },
          { routeName: "checkout", label: "Checkout" },
        ]
      : [
          { routeName: "home", label: "Home" },
          { routeName: "login", label: "Login" },
        ],
  );

  const onLogin = async (loggedInUser: User) => {
    store.set("user", loggedInUser);
    getDependenciesApi(router).set(
      "abilities",
      defineAbilities(loggedInUser.role),
    );
    const routesApi = getRoutesApi(router);
    routesApi.clear();
    routesApi.add(privateRoutes);
    await router.navigate("dashboard");
  };

  const onLogout = async () => {
    store.set("user", null);
    getDependenciesApi(router).set("abilities", []);
    const routesApi = getRoutesApi(router);
    routesApi.clear();
    routesApi.add(publicRoutes);
    await router.navigate("home");
  };
</script>

<RouterProvider {router} announceNavigation>
  <Layout title="Real-Router — Combined" {links}>
    <ProgressBar />
    <RouteView nodeName="">
      {#snippet home()}
        <Home />
      {/snippet}
      {#snippet login()}
        <Login {onLogin} />
      {/snippet}
      {#snippet dashboard()}
        <Dashboard {onLogout} />
      {/snippet}
      {#snippet products()}
        <RouteView nodeName="products">
          {#snippet list()}
            <ProductList />
          {/snippet}
          {#snippet detail()}
            <ProductDetail />
          {/snippet}
        </RouteView>
      {/snippet}
      {#snippet users()}
        <UsersLayout />
      {/snippet}
      {#snippet settings()}
        <Settings />
      {/snippet}
      {#snippet admin()}
        <Admin />
      {/snippet}
      {#snippet checkout()}
        <Checkout />
      {/snippet}
      {#snippet notFound()}
        <h1>404 — Page Not Found</h1>
        <p>The page you are looking for does not exist.</p>
        <p>Try logging in — available routes change based on auth state.</p>
      {/snippet}
    </RouteView>
  </Layout>
</RouterProvider>

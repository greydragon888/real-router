<script lang="ts">
  import { getDependenciesApi, getRoutesApi } from "@real-router/core/api";
  import { RouterProvider, RouteView } from "@real-router/svelte";
  import type { Router } from "@real-router/core";
  import Layout from "../../shared/Layout.svelte";
  import Home from "./pages/Home.svelte";
  import Login from "./pages/Login.svelte";
  import Dashboard from "./pages/Dashboard.svelte";
  import Settings from "./pages/Settings.svelte";
  import Admin from "./pages/Admin.svelte";
  import Services from "./pages/Services.svelte";
  import Contacts from "./pages/Contacts.svelte";
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
          { routeName: "settings", label: "Settings" },
          { routeName: "admin", label: "Admin" },
        ]
      : [
          { routeName: "home", label: "Home" },
          { routeName: "services", label: "Services" },
          { routeName: "contacts", label: "Contacts" },
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

<RouterProvider {router}>
  <Layout title="Real-Router — Auth Guards" {links}>
    <RouteView nodeName="">
      {#snippet home()}
        <Home />
      {/snippet}
      {#snippet services()}
        <Services />
      {/snippet}
      {#snippet contacts()}
        <Contacts />
      {/snippet}
      {#snippet login()}
        <Login {onLogin} />
      {/snippet}
      {#snippet dashboard()}
        <Dashboard {onLogout} />
      {/snippet}
      {#snippet settings()}
        <Settings />
      {/snippet}
      {#snippet admin()}
        <Admin />
      {/snippet}
      {#snippet notFound()}
        <h1>404 — Page Not Found</h1>
        <p>This route does not exist in the current route tree.</p>
        <p>
          Try logging in or out — the available routes change based on
          authentication state.
        </p>
      {/snippet}
    </RouteView>
  </Layout>
</RouterProvider>

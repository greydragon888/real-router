<script lang="ts">
  import { RouterProvider, RouteView } from "@real-router/svelte";

  import Dashboard from "./pages/Dashboard.svelte";
  import Home from "./pages/Home.svelte";
  import Settings from "./pages/Settings.svelte";
  import Layout from "../../shared/Layout.svelte";

  import type { Router } from "@real-router/core";

  let { router }: { router: Router } = $props();

  const links = [
    { routeName: "home", label: "Home" },
    { routeName: "dashboard", label: "Dashboard" },
    { routeName: "settings", label: "Settings" },
  ];
</script>

<RouterProvider {router}>
  <Layout title="Real-Router — Hash Routing" {links}>
    <RouteView nodeName="">
      {#snippet home()}
        <Home />
      {/snippet}
      {#snippet dashboard()}
        <Dashboard />
      {/snippet}
      {#snippet settings()}
        <Settings />
      {/snippet}
      {#snippet notFound()}
        <h1>404 — Page Not Found</h1>
      {/snippet}
    </RouteView>
  </Layout>
</RouterProvider>

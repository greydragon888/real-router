<script lang="ts">
  import { RouterProvider, RouteView } from "@real-router/svelte";
  import type { Router } from "@real-router/core";
  import Layout from "../../shared/Layout.svelte";
  import Home from "./pages/Home.svelte";
  import UsersLayout from "./pages/UsersLayout.svelte";
  import Settings from "./pages/Settings.svelte";

  let { router }: { router: Router } = $props();

  const links = [
    { routeName: "home", label: "Home" },
    { routeName: "users", label: "Users" },
    { routeName: "settings", label: "Settings" },
  ];
</script>

<RouterProvider {router}>
  <Layout title="Real-Router — Snippets Routing" {links}>
    <RouteView nodeName="">
      {#snippet home()}
        <Home />
      {/snippet}
      {#snippet users()}
        <UsersLayout />
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

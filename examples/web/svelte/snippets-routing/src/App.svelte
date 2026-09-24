<script lang="ts">
  import { RouterProvider, RouteView } from "@real-router/svelte";

  import Home from "./pages/Home.svelte";
  import Settings from "./pages/Settings.svelte";
  import UsersLayout from "./pages/UsersLayout.svelte";
  import Layout from "../../shared/Layout.svelte";

  import type { Router } from "@real-router/core";

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

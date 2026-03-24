<script lang="ts">
  import { RouterProvider, RouteView } from "@real-router/svelte";
  import type { Router } from "@real-router/core";
  import Layout from "../../shared/Layout.svelte";
  import Home from "./pages/Home.svelte";
  import UsersLayout from "./pages/UsersLayout.svelte";

  let { router }: { router: Router } = $props();

  const links = [
    { routeName: "home", label: "Home" },
    { routeName: "users", label: "Users" },
  ];
</script>

<RouterProvider {router}>
  <Layout title="Real-Router — Nested Routes" {links}>
    <RouteView nodeName="">
      {#snippet home()}
        <Home />
      {/snippet}
      {#snippet users()}
        <UsersLayout />
      {/snippet}
      {#snippet notFound()}
        <h1>404 — Page Not Found</h1>
        <p>The page you are looking for does not exist.</p>
      {/snippet}
    </RouteView>
  </Layout>
</RouterProvider>

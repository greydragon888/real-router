<script lang="ts">
  import { RouterProvider, RouteView } from "@real-router/svelte";

  import ErrorPanel from "./pages/ErrorPanel.svelte";
  import Home from "./pages/Home.svelte";
  import Layout from "../../shared/Layout.svelte";

  import type { Router } from "@real-router/core";

  let { router }: { router: Router } = $props();

  const links = [{ routeName: "home", label: "Home" }];
</script>

<RouterProvider {router}>
  <Layout title="Real-Router — Error Handling" {links}>
    <RouteView nodeName="">
      {#snippet home()}
        <Home />
      {/snippet}
      {#snippet about()}
        <h1>About</h1>
        <p>You were redirected here after cancelling the slow navigation.</p>
      {/snippet}
      {#snippet notFound()}
        <h1>404 — Page Not Found</h1>
        <p>
          This page is shown when navigating to an unknown URL via browser
          address bar (<code>allowNotFound: true</code>). Navigating by name
          with an unknown route name throws <code>ROUTE_NOT_FOUND</code>
          regardless of this setting.
        </p>
      {/snippet}
    </RouteView>
    <ErrorPanel />
  </Layout>
</RouterProvider>

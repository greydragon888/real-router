<script lang="ts">
  import { RouterProvider, RouteView, Lazy } from "@real-router/svelte";
  import type { Router } from "@real-router/core";
  import Layout from "../../shared/Layout.svelte";
  import Home from "./pages/Home.svelte";
  import Spinner from "./Spinner.svelte";

  let { router }: { router: Router } = $props();

  const links = [
    { routeName: "home", label: "Home" },
    { routeName: "dashboard", label: "Dashboard" },
    { routeName: "analytics", label: "Analytics" },
  ];
</script>

<RouterProvider {router}>
  <Layout title="Real-Router — Lazy Loading (Svelte)" {links}>
    <RouteView nodeName="">
      {#snippet home()}
        <Home />
      {/snippet}
      {#snippet dashboard()}
        <Lazy loader={() => import("./pages/Dashboard.svelte")} fallback={Spinner} />
      {/snippet}
      {#snippet analytics()}
        <Lazy loader={() => import("./pages/Analytics.svelte")} fallback={Spinner} />
      {/snippet}
      {#snippet notFound()}
        <h1>404 — Page Not Found</h1>
      {/snippet}
    </RouteView>
  </Layout>
</RouterProvider>

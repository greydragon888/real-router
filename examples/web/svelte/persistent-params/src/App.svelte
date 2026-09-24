<script lang="ts">
  import { RouterProvider, RouteView } from "@real-router/svelte";

  import About from "./pages/About.svelte";
  import Contacts from "./pages/Contacts.svelte";
  import Home from "./pages/Home.svelte";
  import ParamsToolbar from "./pages/ParamsToolbar.svelte";
  import Layout from "../../shared/Layout.svelte";

  import type { Router } from "@real-router/core";

  let { router }: { router: Router } = $props();

  const links = [
    { routeName: "home", label: "Home" },
    { routeName: "about", label: "About" },
    { routeName: "contacts", label: "Contacts" },
  ];
</script>

<RouterProvider {router}>
  <Layout title="Real-Router — Persistent Params" {links}>
    <ParamsToolbar />
    <RouteView nodeName="">
      {#snippet home()}
        <Home />
      {/snippet}
      {#snippet about()}
        <About />
      {/snippet}
      {#snippet contacts()}
        <Contacts />
      {/snippet}
      {#snippet notFound()}
        <h1>404 — Page Not Found</h1>
      {/snippet}
    </RouteView>
  </Layout>
</RouterProvider>

<script lang="ts">
  import { RouterProvider, RouteView } from "@real-router/svelte";
  import type { Router } from "@real-router/core";
  import Layout from "../../shared/Layout.svelte";
  import Home from "./pages/Home.svelte";
  import About from "./pages/About.svelte";
  import Contacts from "./pages/Contacts.svelte";

  let { router }: { router: Router } = $props();

  const links = [
    { routeName: "home", label: "Home" },
    { routeName: "about", label: "About" },
    { routeName: "contacts", label: "Contacts" },
  ];
</script>

<RouterProvider {router} scrollRestoration={{ mode: "restore" }}>
  <Layout title="Real-Router — Basic" {links}>
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
        <p>The page you are looking for does not exist.</p>
      {/snippet}
    </RouteView>
  </Layout>
</RouterProvider>

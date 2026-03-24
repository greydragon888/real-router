<script lang="ts">
  import { RouterProvider, RouteView } from "@real-router/svelte";
  import type { Router } from "@real-router/core";
  import Layout from "../../shared/Layout.svelte";
  import ProgressBar from "./components/ProgressBar.svelte";
  import Home from "./pages/Home.svelte";
  import Checkout from "./pages/Checkout.svelte";
  import Editor from "./pages/Editor.svelte";
  import About from "./pages/About.svelte";

  let { router }: { router: Router } = $props();

  const links = [
    { routeName: "home", label: "Home" },
    { routeName: "checkout", label: "Checkout" },
    { routeName: "editor", label: "Editor" },
    { routeName: "about", label: "About" },
  ];
</script>

<RouterProvider {router}>
  <Layout title="Real-Router — Async Guards" {links}>
    <ProgressBar />
    <RouteView nodeName="">
      {#snippet home()}
        <Home />
      {/snippet}
      {#snippet checkout()}
        <Checkout />
      {/snippet}
      {#snippet editor()}
        <Editor />
      {/snippet}
      {#snippet about()}
        <About />
      {/snippet}
      {#snippet notFound()}
        <h1>404 — Page Not Found</h1>
      {/snippet}
    </RouteView>
  </Layout>
</RouterProvider>

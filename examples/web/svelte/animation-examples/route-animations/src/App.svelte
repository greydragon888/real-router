<script lang="ts">
  import { RouterProvider } from "@real-router/svelte";
  import type { Router } from "@real-router/core";
  import Layout from "../../../shared/Layout.svelte";
  import AnimationHost from "./AnimationHost.svelte";

  let { router }: { router: Router } = $props();

  const links = [
    { routeName: "home", label: "Home" },
    { routeName: "about", label: "About" },
    { routeName: "products", label: "Products" },
    { routeName: "queryDemo", label: "Query demo" },
  ];
</script>

<RouterProvider {router}>
  <Layout title="Real-Router — Route Animations" {links}>
    <AnimationHost />
  </Layout>
</RouterProvider>

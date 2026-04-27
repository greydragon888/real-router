<script lang="ts">
  import { RouteView } from "@real-router/svelte";
  import About from "./pages/About.svelte";
  import Home from "./pages/Home.svelte";
  import ProductDetail from "./pages/ProductDetail.svelte";
  import ProductsList from "./pages/ProductsList.svelte";
  import QueryDemo from "./pages/QueryDemo.svelte";
  import { useHeroMorph } from "./animations/useHeroMorph.svelte";
  import { useListFlip } from "./animations/useListFlip.svelte";
  import { usePageAnimator } from "./animations/usePageAnimator.svelte";

  // Three thin composables own the app's animation behavior — each
  // calls `useRouteExit` from `@real-router/svelte` once with its own
  // recipe:
  //   - usePageAnimator: page-level fade/slide on cross-route nav
  //   - useHeroMorph: cross-component DOM rect capture (products ↔ detail)
  //   - useListFlip: same-route list reorder + ghost exits (sort/filter)
  //
  // This component lives inside RouterProvider's context (mounted by
  // App.svelte under <RouterProvider>), so the composables resolve their
  // context dependencies (useRouter, useNavigator, useRoute) correctly.
  // App.svelte's <script> runs before <RouterProvider> establishes
  // context — that's why the composables can't be called there.
  //
  // No `data-route-root` on this outer wrapper. The marker lives on each
  // leaf page's outermost contentful element. The page-level composable
  // queries `[data-route-root]` and finds exactly one — the active leaf.
  usePageAnimator();
  useHeroMorph();
  useListFlip();
</script>

<RouteView nodeName="">
  {#snippet home()}
    <Home />
  {/snippet}
  {#snippet products()}
    <RouteView nodeName="products">
      {#snippet self()}
        <ProductsList />
      {/snippet}
      {#snippet detail()}
        <ProductDetail />
      {/snippet}
    </RouteView>
  {/snippet}
  {#snippet about()}
    <About />
  {/snippet}
  {#snippet queryDemo()}
    <QueryDemo />
  {/snippet}
  {#snippet notFound()}
    <h1>404 — Page Not Found</h1>
    <p>The page you are looking for does not exist.</p>
  {/snippet}
</RouteView>

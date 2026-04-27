<script lang="ts">
  import { RouteView } from "@real-router/svelte";
  import { fly } from "svelte/transition";
  import { cubicInOut } from "svelte/easing";
  import About from "./pages/About.svelte";
  import Home from "./pages/Home.svelte";
  import ProductDetail from "./pages/ProductDetail.svelte";
  import ProductsList from "./pages/ProductsList.svelte";
  import QueryDemo from "./pages/QueryDemo.svelte";
  import { useRouteExitCoordination } from "./use-route-exit-coordination.svelte";

  // The composable bridges router.subscribeLeave with Svelte's
  // transition lifecycle: it bumps `exitToken.current` inside
  // subscribeLeave (driving the `{#key}` block's re-instantiation,
  // which triggers the `out:fly` transition on the cached old
  // subtree) and resolves the router-blocking Promise when
  // `onoutroend` fires. URL and UI stay in lock-step. See
  // `use-route-exit-coordination.svelte.ts` for the full mechanism.
  //
  // This component lives inside RouterProvider's context (mounted by
  // App.svelte under <RouterProvider>), so the composable resolves
  // its context dependency (useRouteExit -> useRouter) correctly.
  // App.svelte's <script> runs before <RouterProvider> establishes
  // context — that's why the composable can't be called there.
  const { exitToken, onOutroEnd } = useRouteExitCoordination();

  // Track first mount to suppress the initial `in:fly` transition
  // (equivalent to motion-react's `<AnimatePresence initial={false}>`).
  // Without this, the page-level fly-in plays once on hard reload —
  // not desirable; reload should show content immediately.
  let isFirstMount = $state(true);
</script>

{#key exitToken.current}
  <div
    in:fly|global={{
      x: isFirstMount ? 0 : 20,
      duration: isFirstMount ? 0 : 900,
      easing: cubicInOut,
    }}
    out:fly|global={{ x: -20, duration: 900, easing: cubicInOut }}
    onintrostart={() => {
      isFirstMount = false;
    }}
    onoutroend={onOutroEnd}
  >
    <!--
      During the exit phase, RouteView still renders the old route's
      content because router state hasn't moved yet — the cached old
      subtree exits with the leaving page visible. After the out
      transition completes and the router commits, this block
      re-instantiates with the new content and plays the in transition.
    -->
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
  </div>
{/key}

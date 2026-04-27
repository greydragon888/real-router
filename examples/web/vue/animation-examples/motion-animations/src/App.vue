<script setup lang="ts">
import { RouteView } from "@real-router/vue";

import About from "./pages/About.vue";
import Home from "./pages/Home.vue";
import ProductDetail from "./pages/ProductDetail.vue";
import ProductsList from "./pages/ProductsList.vue";
import QueryDemo from "./pages/QueryDemo.vue";
import Layout from "../../../shared/Layout.vue";
import { useRouteExitCoordination } from "./use-route-exit-coordination";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "about", label: "About" },
  { routeName: "products", label: "Products" },
  { routeName: "queryDemo", label: "Query demo" },
];

// The composable bridges router.subscribeLeave with Vue's
// <Transition> lifecycle: it bumps `exitToken` inside subscribeLeave
// (driving the `:key` rebind, which fires <Transition>'s leave
// hooks on the cached old subtree) and resolves the
// router-blocking Promise when the @after-leave event fires. URL and
// UI stay in lock-step. See `use-route-exit-coordination.ts` for the
// full mechanism.
const { exitToken, onAfterLeave } = useRouteExitCoordination();
</script>

<template>
  <Layout title="Real-Router — Motion Animations" :links="links">
    <!--
      <Transition mode="out-in"> sequences exit fully before entry —
      Vue's equivalent of motion-react's <AnimatePresence mode="wait">.
      `:appear="false"` suppresses the initial entry animation
      (equivalent to motion-react's <AnimatePresence initial={false}>).

      `:key="exitToken"` causes Vue to unmount the inner element on
      each token bump, triggering the leave hooks. During leave,
      RouteView still renders the old route's content because router
      state hasn't moved yet. After @after-leave fires and the router
      commits, the new element mounts with new content and the enter
      hooks play.
    -->
    <Transition
      name="page"
      mode="out-in"
      :appear="false"
      @after-leave="onAfterLeave"
    >
      <div :key="exitToken">
        <RouteView nodeName="">
          <RouteView.Match segment="home">
            <Home />
          </RouteView.Match>
          <RouteView.Match segment="products">
            <RouteView nodeName="products">
              <RouteView.Self>
                <ProductsList />
              </RouteView.Self>
              <RouteView.Match segment="detail">
                <ProductDetail />
              </RouteView.Match>
            </RouteView>
          </RouteView.Match>
          <RouteView.Match segment="about">
            <About />
          </RouteView.Match>
          <RouteView.Match segment="queryDemo">
            <QueryDemo />
          </RouteView.Match>
          <RouteView.NotFound>
            <h1>404 — Page Not Found</h1>
            <p>The page you are looking for does not exist.</p>
          </RouteView.NotFound>
        </RouteView>
      </div>
    </Transition>
  </Layout>
</template>

<style>
/*
 * Vue <Transition name="page"> looks for these CSS classes:
 *   .page-enter-from, .page-enter-active, .page-enter-to
 *   .page-leave-from, .page-leave-active, .page-leave-to
 *
 * The active class is on the element during the entire transition;
 * `from` / `to` mark the start / end states. CSS transitions
 * interpolate between them.
 *
 * 0.9s matches the React/Solid/Svelte motion-animations examples.
 */
.page-enter-active,
.page-leave-active {
  transition:
    opacity 0.9s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.9s cubic-bezier(0.4, 0, 0.2, 1);
}

.page-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.page-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

@media (prefers-reduced-motion: reduce) {
  .page-enter-active,
  .page-leave-active {
    transition: none;
  }
  .page-enter-from,
  .page-leave-to {
    opacity: 1;
    transform: none;
  }
}
</style>

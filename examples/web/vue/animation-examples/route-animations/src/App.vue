<script setup lang="ts">
import { RouteView } from "@real-router/vue";

import About from "./pages/About.vue";
import Home from "./pages/Home.vue";
import ProductDetail from "./pages/ProductDetail.vue";
import ProductsList from "./pages/ProductsList.vue";
import QueryDemo from "./pages/QueryDemo.vue";
import Layout from "../../../shared/Layout.vue";
import { useHeroMorph } from "./animations/useHeroMorph";
import { useListFlip } from "./animations/useListFlip";
import { usePageAnimator } from "./animations/usePageAnimator";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "about", label: "About" },
  { routeName: "products", label: "Products" },
  { routeName: "queryDemo", label: "Query demo" },
];

// Three thin composables own the app's animation behavior — each
// calls `useRouteExit` from `@real-router/vue` once with its own
// recipe:
//   - usePageAnimator: page-level fade/slide on cross-route nav
//   - useHeroMorph: cross-component DOM rect capture (products ↔ detail)
//   - useListFlip: same-route list reorder + ghost exits (sort/filter)
//
// `main.ts` wraps App in <RouterProvider>, so App's setup runs as a
// child of the provider — `useRouter` / `useNavigator` / `useRoute`
// in the composables resolve their inject() calls correctly.
//
// No `data-route-root` on this outer wrapper. The marker lives on
// each leaf page's outermost contentful element. The page-level
// composable queries `[data-route-root]` and finds exactly one — the
// active leaf.
usePageAnimator();
useHeroMorph();
useListFlip();
</script>

<template>
  <Layout title="Real-Router — Route Animations" :links="links">
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
  </Layout>
</template>

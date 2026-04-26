<script setup lang="ts">
import { RouteView } from "@real-router/vue";

import About from "./pages/About.vue";
import Home from "./pages/Home.vue";
import Products from "./pages/Products.vue";
import QueryDemo from "./pages/QueryDemo.vue";
import Layout from "../../shared/Layout.vue";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "about", label: "About" },
  { routeName: "products", label: "Products" },
  { routeName: "queryDemo", label: "Query demo" },
];
</script>

<template>
  <Layout title="Real-Router — View Transitions" :links="links">
    <!--
      data-route-root marks the container VT should snapshot. Pseudo-elements
      ::view-transition-old/new target this through the root transition. Keep
      it as the single wrapper around RouteView; nested VT names apply on
      descendants (e.g. product covers for hero morph, product-list for
      per-area scoped transitions).
    -->
    <div data-route-root>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home />
        </RouteView.Match>
        <RouteView.Match segment="products">
          <Products />
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
  </Layout>
</template>

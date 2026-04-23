<script setup lang="ts">
import { RouteView } from "@real-router/vue";
import Layout from "../../shared/Layout.vue";
import Home from "./pages/Home.vue";
import Products from "./pages/Products.vue";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "products", label: "Products" },
];
</script>

<template>
  <Layout title="Real-Router — Search Schema" :links="links">
    <RouteView nodeName="">
      <RouteView.Match segment="home">
        <Home />
      </RouteView.Match>
      <RouteView.Match segment="products">
        <Products />
      </RouteView.Match>
      <RouteView.NotFound>
        <h1>404 — Page Not Found</h1>
      </RouteView.NotFound>
    </RouteView>
  </Layout>
</template>

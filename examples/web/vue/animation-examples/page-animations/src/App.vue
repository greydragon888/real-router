<script setup lang="ts">
import { RouteView } from "@real-router/vue";

import About from "./pages/About.vue";
import Home from "./pages/Home.vue";
import ProductDetail from "./pages/ProductDetail.vue";
import ProductsList from "./pages/ProductsList.vue";
import QueryDemo from "./pages/QueryDemo.vue";
import Layout from "../../../shared/Layout.vue";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "about", label: "About" },
  { routeName: "products", label: "Products" },
  { routeName: "queryDemo", label: "Query demo" },
];
</script>

<template>
  <Layout title="Real-Router — Page Animations" :links="links">
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

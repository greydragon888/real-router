<script setup lang="ts">
import { RouteView } from "@real-router/vue";
import Layout from "../../shared/Layout.vue";
import Home from "./pages/Home.vue";
import ProductDetail from "./pages/ProductDetail.vue";
import Checkout from "./pages/Checkout.vue";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "checkout", label: "Checkout" },
];
</script>

<template>
  <Layout title="Real-Router — v-link Directive" :links="links">
    <RouteView nodeName="">
      <RouteView.Match segment="home">
        <Home />
      </RouteView.Match>
      <RouteView.Match segment="products">
        <RouteView nodeName="products">
          <RouteView.Match segment="detail">
            <ProductDetail />
          </RouteView.Match>
        </RouteView>
      </RouteView.Match>
      <RouteView.Match segment="checkout">
        <Checkout />
      </RouteView.Match>
      <RouteView.NotFound>
        <h1>404 — Page Not Found</h1>
      </RouteView.NotFound>
    </RouteView>
  </Layout>
</template>

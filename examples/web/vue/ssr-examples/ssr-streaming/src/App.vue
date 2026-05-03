<script setup lang="ts">
import { Link, RouteView } from "@real-router/vue";

import ProductDetail from "./components/ProductDetail.vue";
import ProductsList from "./components/ProductsList.vue";
import Home from "./pages/Home.vue";
import NotFound from "./pages/NotFound.vue";
</script>

<template>
  <div>
    <header>
      <nav>
        <Link routeName="home" data-testid="nav-home">Home</Link>
        {{ " | " }}
        <Link routeName="products.list" data-testid="nav-products-list">
          Products
        </Link>
      </nav>
    </header>
    <main>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home />
        </RouteView.Match>
        <RouteView.Match segment="products">
          <RouteView nodeName="products">
            <RouteView.Match segment="list">
              <ProductsList />
            </RouteView.Match>
            <RouteView.Match segment="detail">
              <ProductDetail />
            </RouteView.Match>
          </RouteView>
        </RouteView.Match>
        <RouteView.NotFound>
          <NotFound />
        </RouteView.NotFound>
      </RouteView>
    </main>
  </div>
</template>

<script setup lang="ts">
import { RouteView } from "@real-router/vue";
import Layout from "../../shared/Layout.vue";
import ProgressBar from "./components/ProgressBar.vue";
import About from "./pages/About.vue";
import Checkout from "./pages/Checkout.vue";
import Editor from "./pages/Editor.vue";
import Home from "./pages/Home.vue";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "checkout", label: "Checkout" },
  { routeName: "editor", label: "Editor" },
  { routeName: "about", label: "About" },
];
</script>

<template>
  <Layout title="Real-Router — Async Guards" :links="links">
    <ProgressBar />
    <RouteView nodeName="">
      <RouteView.Match segment="home">
        <Home />
      </RouteView.Match>
      <RouteView.Match segment="checkout">
        <Checkout />
      </RouteView.Match>
      <RouteView.Match segment="editor">
        <Editor />
      </RouteView.Match>
      <RouteView.Match segment="about">
        <About />
      </RouteView.Match>
      <RouteView.NotFound>
        <h1>404 — Page Not Found</h1>
      </RouteView.NotFound>
    </RouteView>
  </Layout>
</template>

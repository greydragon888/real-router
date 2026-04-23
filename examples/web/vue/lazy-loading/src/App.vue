<script setup lang="ts">
import { RouteView } from "@real-router/vue";
import { defineAsyncComponent, h } from "vue";
import Layout from "../../shared/Layout.vue";
import Home from "./pages/Home.vue";
import Spinner from "./Spinner.vue";

const spinnerVNode = h(Spinner);

const Dashboard = defineAsyncComponent(() => import("./pages/Dashboard.vue"));
const Analytics = defineAsyncComponent(() => import("./pages/Analytics.vue"));
const Settings = defineAsyncComponent(() => import("./pages/Settings.vue"));

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "dashboard", label: "Dashboard" },
  { routeName: "analytics", label: "Analytics" },
  { routeName: "settings", label: "Settings" },
];
</script>

<template>
  <Layout title="Real-Router — Lazy Loading" :links="links">
    <RouteView nodeName="">
      <RouteView.Match segment="home">
        <Home />
      </RouteView.Match>
      <RouteView.Match segment="dashboard" :fallback="spinnerVNode">
        <Dashboard />
      </RouteView.Match>
      <RouteView.Match segment="analytics" :fallback="spinnerVNode">
        <Analytics />
      </RouteView.Match>
      <RouteView.Match segment="settings" :fallback="spinnerVNode">
        <Settings />
      </RouteView.Match>
      <RouteView.NotFound>
        <h1>404 — Page Not Found</h1>
      </RouteView.NotFound>
    </RouteView>
  </Layout>
</template>

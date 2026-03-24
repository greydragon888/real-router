<script setup lang="ts">
import { RouteView } from "@real-router/vue";
import Layout from "../../shared/Layout.vue";
import Dashboard from "./pages/Dashboard.vue";
import Home from "./pages/Home.vue";
import Settings from "./pages/Settings.vue";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "dashboard", label: "Dashboard" },
  { routeName: "settings", label: "Settings" },
];
</script>

<template>
  <Layout title="Real-Router — Hash Routing" :links="links">
    <RouteView nodeName="">
      <RouteView.Match segment="home">
        <Home />
      </RouteView.Match>
      <RouteView.Match segment="dashboard">
        <Dashboard />
      </RouteView.Match>
      <RouteView.Match segment="settings">
        <Settings />
      </RouteView.Match>
      <RouteView.NotFound>
        <h1>404 — Page Not Found</h1>
      </RouteView.NotFound>
    </RouteView>
  </Layout>
</template>

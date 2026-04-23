<script setup lang="ts">
import { RouteView } from "@real-router/vue";
import Layout from "../../shared/Layout.vue";
import Home from "./pages/Home.vue";
import Dashboard from "./pages/Dashboard.vue";
import Settings from "./pages/Settings.vue";
import Reports from "./pages/Reports.vue";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "dashboard", label: "Dashboard" },
  { routeName: "settings", label: "Settings" },
  { routeName: "reports", label: "Reports" },
];
</script>

<template>
  <Layout title="Real-Router — Keep Alive" :links="links">
    <RouteView nodeName="">
      <RouteView.Match segment="home">
        <Home />
      </RouteView.Match>
      <RouteView.Match segment="dashboard" keepAlive>
        <Dashboard />
      </RouteView.Match>
      <RouteView.Match segment="settings">
        <Settings />
      </RouteView.Match>
      <RouteView.Match segment="reports">
        <Reports />
      </RouteView.Match>
      <RouteView.NotFound>
        <h1>404 — Page Not Found</h1>
      </RouteView.NotFound>
    </RouteView>
  </Layout>
</template>

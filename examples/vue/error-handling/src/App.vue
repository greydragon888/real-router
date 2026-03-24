<script setup lang="ts">
import { RouteView } from "@real-router/vue";
import Layout from "../../shared/Layout.vue";
import ErrorPanel from "./pages/ErrorPanel.vue";
import Home from "./pages/Home.vue";

const links = [{ routeName: "home", label: "Home" }];
</script>

<template>
  <Layout title="Real-Router — Error Handling" :links="links">
    <RouteView nodeName="">
      <RouteView.Match segment="home">
        <Home />
      </RouteView.Match>
      <RouteView.Match segment="about">
        <h1>About</h1>
        <p>You were redirected here after cancelling the slow navigation.</p>
      </RouteView.Match>
      <RouteView.NotFound>
        <h1>404 — Page Not Found</h1>
        <p>
          This page is shown when navigating to an unknown URL via browser
          address bar (<code>allowNotFound: true</code>). Navigating by name
          with an unknown route name throws <code>ROUTE_NOT_FOUND</code>
          regardless of this setting.
        </p>
      </RouteView.NotFound>
    </RouteView>
    <ErrorPanel />
  </Layout>
</template>

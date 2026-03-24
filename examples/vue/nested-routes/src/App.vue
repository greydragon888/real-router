<script setup lang="ts">
import { RouteView } from "@real-router/vue";
import Layout from "../../shared/Layout.vue";
import Home from "./pages/Home.vue";
import UsersLayout from "./pages/UsersLayout.vue";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "users", label: "Users" },
];
</script>

<template>
  <Layout title="Real-Router — Nested Routes" :links="links">
    <RouteView nodeName="">
      <RouteView.Match segment="home">
        <Home />
      </RouteView.Match>
      <RouteView.Match segment="users">
        <UsersLayout />
      </RouteView.Match>
      <RouteView.NotFound>
        <h1>404 — Page Not Found</h1>
        <p>The page you are looking for does not exist.</p>
      </RouteView.NotFound>
    </RouteView>
  </Layout>
</template>

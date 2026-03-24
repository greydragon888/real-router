<script setup lang="ts">
import { getDependenciesApi, getRoutesApi } from "@real-router/core/api";
import { RouteView, useNavigator } from "@real-router/vue";
import { computed, onMounted, onUnmounted, shallowRef } from "vue";

import Admin from "./pages/Admin.vue";
import Contacts from "./pages/Contacts.vue";
import Dashboard from "./pages/Dashboard.vue";
import Home from "./pages/Home.vue";
import Login from "./pages/Login.vue";
import Services from "./pages/Services.vue";
import Settings from "./pages/Settings.vue";
import { router } from "./router";
import { publicRoutes, privateRoutes } from "./routes";
import { defineAbilities } from "../../../shared/abilities";
import { store } from "../../../shared/store";
import Layout from "../../shared/Layout.vue";

import type { User } from "../../../shared/api";

const navigator = useNavigator();

const user = shallowRef<User | null>(store.get("user") as User | null);
let unsub: (() => void) | undefined;

onMounted(() => {
  unsub = store.subscribe(() => {
    user.value = store.get("user") as User | null;
  });
});

onUnmounted(() => {
  unsub?.();
});

const links = computed(() =>
  user.value
    ? [
        { routeName: "dashboard", label: "Dashboard" },
        { routeName: "settings", label: "Settings" },
        { routeName: "admin", label: "Admin" },
      ]
    : [
        { routeName: "home", label: "Home" },
        { routeName: "services", label: "Services" },
        { routeName: "contacts", label: "Contacts" },
        { routeName: "login", label: "Login" },
      ],
);

async function onLogin(loggedInUser: User) {
  store.set("user", loggedInUser);
  getDependenciesApi(router).set(
    "abilities",
    defineAbilities(loggedInUser.role),
  );
  const routesApi = getRoutesApi(router);

  routesApi.clear();
  routesApi.add(privateRoutes);
  await navigator.navigate("dashboard");
}

async function onLogout() {
  store.set("user", null);
  getDependenciesApi(router).set("abilities", []);
  const routesApi = getRoutesApi(router);

  routesApi.clear();
  routesApi.add(publicRoutes);
  await navigator.navigate("home");
}
</script>

<template>
  <Layout title="Real-Router — Auth Guards" :links="links">
    <RouteView nodeName="">
      <RouteView.Match segment="home">
        <Home />
      </RouteView.Match>
      <RouteView.Match segment="services">
        <Services />
      </RouteView.Match>
      <RouteView.Match segment="contacts">
        <Contacts />
      </RouteView.Match>
      <RouteView.Match segment="login">
        <Login @login="onLogin" />
      </RouteView.Match>
      <RouteView.Match segment="dashboard">
        <Dashboard @logout="onLogout" />
      </RouteView.Match>
      <RouteView.Match segment="settings">
        <Settings />
      </RouteView.Match>
      <RouteView.Match segment="admin">
        <Admin />
      </RouteView.Match>
      <RouteView.NotFound>
        <h1>404 — Page Not Found</h1>
        <p>This route does not exist in the current route tree.</p>
        <p>
          Try logging in or out — the available routes change based on
          authentication state.
        </p>
      </RouteView.NotFound>
    </RouteView>
  </Layout>
</template>

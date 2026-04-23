<script setup lang="ts">
import { getRoutesApi } from "@real-router/core/api";
import {
  Link,
  RouteView,
  useNavigator,
  useRoute,
  useRouter,
} from "@real-router/vue";
import { ref } from "vue";

import About from "./pages/About.vue";
import Admin from "./pages/Admin.vue";
import Analytics from "./pages/Analytics.vue";
import Home from "./pages/Home.vue";
import { analyticsRoute, adminRoutes } from "./routes";

const router = useRouter();
const navigator = useNavigator();
const { route } = useRoute();
const routesApi = getRoutesApi(router);

const analyticsEnabled = ref(false);
const adminEnabled = ref(false);

async function toggleAnalytics() {
  if (analyticsEnabled.value) {
    if (route.value?.name.startsWith("analytics")) {
      await navigator.navigate("home");
    }

    routesApi.remove("analytics");
    analyticsEnabled.value = false;
  } else {
    routesApi.add(analyticsRoute);
    analyticsEnabled.value = true;
  }
}

async function toggleAdmin() {
  if (adminEnabled.value) {
    if (route.value?.name.startsWith("admin")) {
      await navigator.navigate("home");
    }

    routesApi.remove("admin");
    adminEnabled.value = false;
  } else {
    routesApi.add(adminRoutes);
    adminEnabled.value = true;
  }
}

function getRouteTreeDisplay() {
  const routes = [
    "home (/)",
    "about (/about)",
    ...(analyticsEnabled.value ? ["analytics (/analytics)"] : []),
    ...(adminEnabled.value
      ? [
          "admin (/admin)",
          "  admin.users (/users)",
          "  admin.settings (/settings)",
        ]
      : []),
  ];

  return routes.join("\n");
}
</script>

<template>
  <div class="app">
    <header class="header">Real-Router — Dynamic Routes</header>
    <aside class="sidebar">
      <Link routeName="home" activeClassName="active">Home</Link>
      <Link routeName="about" activeClassName="active">About</Link>
      <Link
        v-if="analyticsEnabled"
        routeName="analytics"
        activeClassName="active"
      >
        Analytics
      </Link>
      <template v-if="adminEnabled">
        <Link routeName="admin" activeClassName="active">Admin</Link>
        <Link
          routeName="admin.users"
          activeClassName="active"
          :style="{ paddingLeft: '36px' }"
        >
          Users
        </Link>
        <Link
          routeName="admin.settings"
          activeClassName="active"
          :style="{ paddingLeft: '36px' }"
        >
          Settings
        </Link>
      </template>

      <div
        :style="{
          padding: '16px 24px',
          borderTop: '1px solid #e0e0e0',
          marginTop: '8px',
        }"
      >
        <strong
          :style="{
            fontSize: '12px',
            color: '#888',
            display: 'block',
            marginBottom: '8px',
          }"
        >
          FEATURE FLAGS
        </strong>
        <div class="toggle">
          <input
            id="analytics-toggle"
            type="checkbox"
            :checked="analyticsEnabled"
            @change="toggleAnalytics()"
          />
          <label for="analytics-toggle">Analytics</label>
        </div>
        <div class="toggle">
          <input
            id="admin-toggle"
            type="checkbox"
            :checked="adminEnabled"
            @change="toggleAdmin()"
          />
          <label for="admin-toggle">Admin Panel</label>
        </div>
      </div>
    </aside>

    <main class="content">
      <div class="card" :style="{ marginBottom: '16px', fontSize: '13px' }">
        <strong>Active route tree</strong>
        <pre :style="{ marginTop: '8px', color: '#444', lineHeight: '1.6' }">{{
          getRouteTreeDisplay()
        }}</pre>
      </div>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home />
        </RouteView.Match>
        <RouteView.Match segment="about">
          <About />
        </RouteView.Match>
        <RouteView.Match v-if="analyticsEnabled" segment="analytics">
          <Analytics />
        </RouteView.Match>
        <RouteView.Match v-if="adminEnabled" segment="admin">
          <Admin />
        </RouteView.Match>
        <RouteView.NotFound>
          <h1>404 — Page Not Found</h1>
        </RouteView.NotFound>
      </RouteView>
    </main>
    <footer class="footer">@real-router/vue</footer>
  </div>
</template>

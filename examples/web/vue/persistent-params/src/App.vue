<script setup lang="ts">
import { RouteView, useNavigator, useRoute } from "@real-router/vue";
import { computed } from "vue";
import Layout from "../../shared/Layout.vue";
import About from "./pages/About.vue";
import Contacts from "./pages/Contacts.vue";
import Home from "./pages/Home.vue";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "about", label: "About" },
  { routeName: "contacts", label: "Contacts" },
];

const { route } = useRoute();
const navigator = useNavigator();

const lang = computed(
  () => (route.value?.params.lang as string | undefined) ?? "en",
);
const theme = computed(
  () => (route.value?.params.theme as string | undefined) ?? "light",
);

function navigate(newParams: Record<string, string>) {
  void navigator.navigate(
    route.value?.name ?? "home",
    { ...route.value?.params, ...newParams },
    { reload: true },
  );
}
</script>

<template>
  <Layout title="Real-Router — Persistent Params" :links="links">
    <div
      :style="{
        display: 'flex',
        gap: '16px',
        marginBottom: '16px',
        alignItems: 'center',
      }"
    >
      <div>
        <strong>Lang:</strong>
        <button
          :class="lang === 'en' ? 'primary' : ''"
          @click="navigate({ lang: 'en' })"
        >
          EN
        </button>
        <button
          :class="lang === 'ru' ? 'primary' : ''"
          @click="navigate({ lang: 'ru' })"
        >
          RU
        </button>
      </div>
      <div>
        <strong>Theme:</strong>
        <button
          :class="theme === 'light' ? 'primary' : ''"
          @click="navigate({ theme: 'light' })"
        >
          Light
        </button>
        <button
          :class="theme === 'dark' ? 'primary' : ''"
          @click="navigate({ theme: 'dark' })"
        >
          Dark
        </button>
      </div>
      <span :style="{ fontSize: '13px', color: '#888' }">
        URL: <code>?lang={{ lang }}&amp;theme={{ theme }}</code>
      </span>
    </div>
    <RouteView nodeName="">
      <RouteView.Match segment="home">
        <Home />
      </RouteView.Match>
      <RouteView.Match segment="about">
        <About />
      </RouteView.Match>
      <RouteView.Match segment="contacts">
        <Contacts />
      </RouteView.Match>
      <RouteView.NotFound>
        <h1>404 — Page Not Found</h1>
      </RouteView.NotFound>
    </RouteView>
  </Layout>
</template>

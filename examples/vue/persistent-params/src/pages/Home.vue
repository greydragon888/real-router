<script setup lang="ts">
import { useRoute } from "@real-router/vue";
import { computed } from "vue";

const { route } = useRoute();
const lang = computed(
  () => (route.value?.params.lang as string | undefined) ?? "en",
);
const theme = computed(
  () => (route.value?.params.theme as string | undefined) ?? "light",
);
</script>

<template>
  <div>
    <h1>{{ lang === "ru" ? "Главная" : "Home" }}</h1>
    <p>
      {{
        lang === "ru"
          ? "Добро пожаловать! Переключите язык или тему в панели выше."
          : "Welcome! Switch language or theme using the toolbar above."
      }}
    </p>
    <p>
      {{
        lang === "ru"
          ? "Перейдите на другую страницу — параметры сохранятся в URL."
          : "Navigate to another page — the params persist in the URL."
      }}
    </p>
    <div class="card">
      <p>
        Active lang: <strong>{{ lang }}</strong>
      </p>
      <p>
        Active theme: <strong>{{ theme }}</strong>
      </p>
    </div>
  </div>
</template>

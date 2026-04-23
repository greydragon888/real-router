<script setup lang="ts">
import { useRoute } from "@real-router/vue";
import { computed } from "vue";

const { route } = useRoute();
const lang = computed(
  () => (route.value?.params.lang as string | undefined) ?? "en",
);
</script>

<template>
  <div>
    <h1>{{ lang === "ru" ? "Контакты" : "Contacts" }}</h1>
    <p>
      {{
        lang === "ru"
          ? "Параметры lang и theme сохранились при переходе сюда."
          : "Both lang and theme params carried over when you navigated here."
      }}
    </p>
    <div class="card">
      <p>
        <strong>GitHub:</strong>
        <a
          href="https://github.com/greydragon888/real-router"
          target="_blank"
          rel="noreferrer"
        >
          greydragon888/real-router
        </a>
      </p>
    </div>
  </div>
</template>

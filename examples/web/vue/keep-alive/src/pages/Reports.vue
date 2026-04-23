<script setup lang="ts">
import { onMounted, ref, watchEffect } from "vue";
import { useNavigator } from "@real-router/vue";

const navigator = useNavigator();
const scrollContainerRef = ref<Element | null>(null);

onMounted(() => {
  const saved = sessionStorage.getItem("reports:scrollY");

  if (saved && scrollContainerRef.value) {
    requestAnimationFrame(() => {
      scrollContainerRef.value?.scrollTo(0, Number(saved));
    });
  }
});

watchEffect((onCleanup) => {
  const unsub = navigator.subscribeLeave(({ route }) => {
    if (route.name === "reports" && scrollContainerRef.value) {
      sessionStorage.setItem(
        "reports:scrollY",
        String(scrollContainerRef.value.scrollTop),
      );
    }
  });
  onCleanup(unsub);
});
</script>

<template>
  <div>
    <h1>Reports</h1>
    <p style="color: #666; font-size: 14px">
      Scroll position preserved via <code>subscribeLeave()</code> — no KeepAlive needed.
    </p>
    <div
      ref="scrollContainerRef"
      class="reports-scroll-container"
      style="height: 400px; overflow-y: auto; border: 1px solid #ddd"
    >
      <div
        v-for="i in 50"
        :key="i"
        style="padding: 12px 16px; border-bottom: 1px solid #eee"
      >
        Report item #{{ i }} — Q{{ ((i - 1) % 4) + 1 }} 2024
      </div>
    </div>
  </div>
</template>

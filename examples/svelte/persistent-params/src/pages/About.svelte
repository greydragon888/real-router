<script lang="ts">
  import { useRoute } from "@real-router/svelte";

  const { route } = useRoute();
  const lang = $derived((route.current?.params.lang as string | undefined) ?? "en");
</script>

<div>
  <h1>{lang === "ru" ? "О нас" : "About"}</h1>
  <p>
    {lang === "ru"
      ? "Параметр lang сохраняется при навигации между страницами."
      : "The lang param persists when navigating between pages."}
  </p>
  <p>
    {lang === "ru"
      ? "URL сейчас содержит ?lang=ru — попробуйте перейти на Контакты."
      : "The URL now has ?lang=en — navigate to Contacts and the param stays."}
  </p>
</div>

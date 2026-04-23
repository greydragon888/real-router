<script lang="ts">
  import { useRoute, useNavigator } from "@real-router/svelte";

  const { route } = useRoute();
  const navigator = useNavigator();

  const lang = $derived((route.current?.params.lang as string | undefined) ?? "en");
  const theme = $derived((route.current?.params.theme as string | undefined) ?? "light");

  const navigate = (newParams: Record<string, string>) => {
    void navigator.navigate(
      route.current?.name ?? "home",
      {
        ...route.current?.params,
        ...newParams,
      },
      { reload: true },
    );
  };
</script>

<div
  style="display: flex; gap: 16px; margin-bottom: 16px; align-items: center"
>
  <div>
    <strong>Lang:</strong>
    <button
      class={lang === "en" ? "primary" : ""}
      onclick={() => { navigate({ lang: "en" }); }}
    >
      EN
    </button>
    <button
      class={lang === "ru" ? "primary" : ""}
      onclick={() => { navigate({ lang: "ru" }); }}
    >
      RU
    </button>
  </div>
  <div>
    <strong>Theme:</strong>
    <button
      class={theme === "light" ? "primary" : ""}
      onclick={() => { navigate({ theme: "light" }); }}
    >
      Light
    </button>
    <button
      class={theme === "dark" ? "primary" : ""}
      onclick={() => { navigate({ theme: "dark" }); }}
    >
      Dark
    </button>
  </div>
  <span style="font-size: 13px; color: #888">
    URL:
    <code>?lang={lang}&theme={theme}</code>
  </span>
</div>

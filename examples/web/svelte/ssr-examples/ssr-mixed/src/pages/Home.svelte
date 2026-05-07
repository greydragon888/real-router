<script lang="ts">
  import { useRoute } from "@real-router/svelte";

  interface HomeData {
    greeting: string;
  }

  const { route } = useRoute();
  const data = $derived(route.current.context.data as HomeData | undefined);
</script>

<main data-testid="home">
  <h1>Home (full SSR)</h1>
  <p data-testid="greeting">{data?.greeting ?? "(no data)"}</p>
</main>

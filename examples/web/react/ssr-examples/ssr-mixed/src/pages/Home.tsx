import { useRoute } from "@real-router/react";

interface HomeData {
  greeting: string;
}

export function Home() {
  const { route } = useRoute();
  const data = route.context.data as HomeData | undefined;

  return (
    <main data-testid="home">
      <h1>Home (full SSR)</h1>
      <p data-testid="greeting">{data?.greeting ?? "(no data)"}</p>
    </main>
  );
}

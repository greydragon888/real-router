import { useRoute } from "@real-router/solid";

import type { JSX } from "solid-js";

interface HomeData {
  greeting: string;
}

export function Home(): JSX.Element {
  const routeState = useRoute();
  const data = (): HomeData | undefined =>
    routeState().route.context.data as HomeData | undefined;

  return (
    <main data-testid="home">
      <h1>Home (full SSR)</h1>
      <p data-testid="greeting">{data()?.greeting ?? "(no data)"}</p>
    </main>
  );
}

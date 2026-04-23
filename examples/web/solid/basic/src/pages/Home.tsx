import { For } from "solid-js";
import { useRoute } from "@real-router/solid";

import type { JSX } from "solid-js";

const items = Array.from({ length: 100 }, (_, i) => i + 1);

export function Home(): JSX.Element {
  const routeState = useRoute();

  return (
    <div>
      <h1>Home</h1>
      <p>Welcome to the Real-Router basic example.</p>
      <p>
        Current route: <strong>{routeState().route?.name ?? "—"}</strong>
      </p>
      <p>
        Use the sidebar to navigate between pages. Try clicking <em>Back</em>{" "}
        and <em>Forward</em> in the browser — routing state is preserved in the
        URL.
      </p>
      <p>
        <strong>Scroll restoration demo:</strong> scroll down the list below,
        navigate to About, then hit Back — your position is restored.
      </p>
      <ul>
        <For each={items}>{(n) => <li>Item #{n}</li>}</For>
      </ul>
    </div>
  );
}

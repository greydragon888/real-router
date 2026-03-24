import { useRoute } from "@real-router/react";

import type { JSX } from "react";

export function Home(): JSX.Element {
  const { route } = useRoute();

  return (
    <div>
      <h1>Home</h1>
      <p>Welcome to the Real-Router basic example.</p>
      <p>
        Current route: <strong>{route?.name ?? "—"}</strong>
      </p>
      <p>
        Use the sidebar to navigate between pages. Try clicking <em>Back</em>{" "}
        and <em>Forward</em> in the browser — routing state is preserved in the
        URL.
      </p>
    </div>
  );
}

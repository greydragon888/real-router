import { Link } from "@real-router/solid";

import type { JSX } from "solid-js";

export function NotFound(): JSX.Element {
  return (
    <section data-testid="not-found">
      <h1>404 — Not Found</h1>
      <p>
        <Link routeName="home">Go home</Link>
      </p>
    </section>
  );
}

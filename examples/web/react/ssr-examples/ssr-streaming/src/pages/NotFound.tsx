import { Link } from "@real-router/react";

export function NotFound(): React.ReactElement {
  return (
    <section data-testid="not-found">
      <h1>404 — Not Found</h1>
      <p>
        <Link routeName="home">Go home</Link>
      </p>
    </section>
  );
}

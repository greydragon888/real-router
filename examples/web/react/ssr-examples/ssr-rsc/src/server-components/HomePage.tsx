import type { ReactElement } from "react";

export function HomePage(): ReactElement {
  return (
    <section data-testid="home-page">
      <h1>Home</h1>
      <p>Welcome to the real-router RSC example.</p>
    </section>
  );
}

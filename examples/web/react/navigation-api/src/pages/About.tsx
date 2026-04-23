import type { JSX } from "react";

export function About(): JSX.Element {
  return (
    <section>
      <h1>About</h1>
      <p>
        This example targets browsers with Navigation API support (~89% as of
        2026). See <code>README.md</code> for the feature-detection pattern and
        rationale.
      </p>
    </section>
  );
}

import type { JSX } from "react";

export function Home(): JSX.Element {
  return (
    <section>
      <h1>Home</h1>
      <p>
        Electron + <code>@real-router/browser-plugin</code> with custom{" "}
        <code>app://</code> scheme. Click links in the sidebar to navigate.
      </p>
    </section>
  );
}

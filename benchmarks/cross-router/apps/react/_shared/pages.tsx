// Engine-agnostic page components — IDENTICAL across all engines in the cohort.
// Only the routing layer differs per app; pages + data-testid are shared so one
// Playwright driver runs against every engine (design doc D4).
import type { JSX } from "react";

export function Home(): JSX.Element {
  return (
    <main data-testid="page-home">
      <h1>Home</h1>
    </main>
  );
}

export function About(): JSX.Element {
  return (
    <main data-testid="page-about">
      <h1>About</h1>
    </main>
  );
}

// Param page — `data-id` lets the driver detect the param actually changed.
// Each engine reads its param idiomatically and passes `id` as a prop, so the
// rendered DOM stays identical across engines.
export function User({ id }: { id: string }): JSX.Element {
  return (
    <main data-testid="page-user" data-id={id}>
      <h1>User {id}</h1>
    </main>
  );
}

// Wide/deep config leaf — `data-n` lets the sweep driver confirm it reached the
// right item (position N in a flat table, or depth D in a nested chain).
export function CatalogItem({ n }: { n: string }): JSX.Element {
  return (
    <main data-testid="page-item" data-n={n}>
      <h1>Item {n}</h1>
    </main>
  );
}

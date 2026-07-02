// Engine-agnostic page components — IDENTICAL across all engines in the Solid
// cohort. Only the routing layer differs per app; pages + data-testid are shared
// so one Playwright driver runs against every engine (design doc D4).
import type { JSX } from "solid-js";

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
// Solid: read `props.id` (do NOT destructure — keeps the value live when the
// same component instance updates across a param navigation).
export function User(props: { id: string }): JSX.Element {
  return (
    <main data-testid="page-user" data-id={props.id}>
      <h1>User {props.id}</h1>
    </main>
  );
}

// Wide/deep config leaf — `data-n` lets the sweep driver confirm it reached the
// right item (position N in a flat table, or depth D in a nested chain).
export function CatalogItem(props: { n: string }): JSX.Element {
  return (
    <main data-testid="page-item" data-n={props.n}>
      <h1>Item {props.n}</h1>
    </main>
  );
}

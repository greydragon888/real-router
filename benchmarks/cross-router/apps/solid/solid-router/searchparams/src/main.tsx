// @solidjs/router search-param-scaling variant — routes with N query params
// (/sN?k1=v1&...&kN=vN). @solidjs/router exposes query via `useSearchParams()`
// (a reactive store). The leaf reads EVERY value (readSearch, once via createMemo)
// so the reactive query is materialized.
import { A, Router, useSearchParams } from "@solidjs/router";
import { For, createMemo } from "solid-js";
import { render } from "solid-js/web";

import {
  SEARCH_COUNTS,
  searchQuery,
  readSearch,
} from "../../../_shared/search-param-spec";

import type { RouteDefinition } from "@solidjs/router";
import type { JSX } from "solid-js";

function SearchLeaf(): JSX.Element {
  const [searchParams] = useSearchParams();
  const info = createMemo(() => readSearch(Object.entries(searchParams)));
  return (
    <main data-testid="page-search" data-count={info().count}>
      {info().count} search · Σ{info().checksum}
    </main>
  );
}

function Layout(props: { children?: JSX.Element }): JSX.Element {
  return (
    <>
      <nav>
        <For each={SEARCH_COUNTS}>
          {(n) => (
            <A href={`/s${n}?${searchQuery(n)}`} data-testid={`link-search-${n}`}>
              {n}
            </A>
          )}
        </For>
      </nav>
      {props.children}
    </>
  );
}

const routes: RouteDefinition[] = [
  { path: "/", component: () => <main data-testid="page-home">Home</main> },
  ...SEARCH_COUNTS.map((n) => ({ path: `/s${n}`, component: SearchLeaf })),
];

const root = document.querySelector("#root");
if (root) {
  render(() => <Router root={Layout}>{routes}</Router>, root);
}

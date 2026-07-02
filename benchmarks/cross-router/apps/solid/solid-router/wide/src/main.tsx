// @solidjs/router wide variant — 1000 flat sibling routes (/catalog/item-1..N).
// Config-route array passed as <Router> children; the nav (WIDE_TARGETS links)
// lives in the `root` layout so it persists across every item navigation.
import { A, Router } from "@solidjs/router";
import { For } from "solid-js";
import { render } from "solid-js/web";

import { CatalogItem, Home } from "../../../_shared/pages";
import { WIDE_TARGETS, wideItems } from "../../../_shared/wide-spec";

import type { RouteDefinition } from "@solidjs/router";
import type { JSX } from "solid-js";

function Layout(props: { children?: JSX.Element }): JSX.Element {
  return (
    <>
      <nav>
        <For each={WIDE_TARGETS}>
          {(n) => (
            <A href={`/catalog/item-${n}`} data-testid={`link-item-${n}`}>
              Item {n}
            </A>
          )}
        </For>
      </nav>
      {props.children}
    </>
  );
}

const routes: RouteDefinition[] = [
  { path: "/", component: Home },
  ...wideItems.map((n) => ({
    path: `/catalog/item-${n}`,
    component: () => <CatalogItem n={String(n)} />,
  })),
];

const root = document.querySelector("#root");
if (root) {
  render(() => <Router root={Layout}>{routes}</Router>, root);
}

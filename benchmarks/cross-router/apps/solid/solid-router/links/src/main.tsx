// @solidjs/router links variant — 100 <A> links to sibling /tab/i routes.
// <A> is inherently active-aware (adds `activeClass`, default "active"), so it
// is the direct analog of react-router's <NavLink>: the router recomputes active
// state on ALL 100 links on every navigation (cost ∝ link count). The nav lives
// in the `root` layout so it persists across tab navigations.
import { A, Router } from "@solidjs/router";
import { For } from "solid-js";
import { render } from "solid-js/web";

import { Home } from "../../../_shared/pages";
import { tabs } from "../../../_shared/links-spec";

import type { RouteDefinition } from "@solidjs/router";
import type { JSX } from "solid-js";

function TabPage(props: { n: string }): JSX.Element {
  return (
    <main data-testid="page-tab" data-n={props.n}>
      <h1>Tab {props.n}</h1>
    </main>
  );
}

function Layout(props: { children?: JSX.Element }): JSX.Element {
  return (
    <>
      <nav>
        <For each={tabs}>
          {(i) => (
            <A href={`/tab/${i}`} data-testid={`link-tab-${i}`}>
              Tab {i}
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
  ...tabs.map((i) => ({
    path: `/tab/${i}`,
    component: () => <TabPage n={String(i)} />,
  })),
];

const root = document.querySelector("#root");
if (root) {
  render(() => <Router root={Layout}>{routes}</Router>, root);
}

// @solidjs/router nested variant — shared SectionLayout (/sec, renders
// props.children) with two sibling leaves a/b. Switching a<->b keeps
// SectionLayout mounted; props.children swaps the leaf.
import { A, Router } from "@solidjs/router";
import { render } from "solid-js/web";

import { Home } from "../../../_shared/pages";

import type { RouteDefinition } from "@solidjs/router";
import type { JSX } from "solid-js";

function Leaf(props: { n: string }): JSX.Element {
  return (
    <main data-testid="page-item" data-n={props.n}>
      <h1>{props.n}</h1>
    </main>
  );
}

function SectionLayout(props: { children?: JSX.Element }): JSX.Element {
  return (
    <div class="sec">
      <nav>
        <A href="/sec/a" data-testid="link-sec-a">
          A
        </A>
        <A href="/sec/b" data-testid="link-sec-b">
          B
        </A>
      </nav>
      {props.children}
    </div>
  );
}

const routes: RouteDefinition[] = [
  { path: "/", component: Home },
  {
    path: "/sec",
    component: SectionLayout,
    children: [
      { path: "a", component: () => <Leaf n="a" /> },
      { path: "b", component: () => <Leaf n="b" /> },
    ],
  },
];

const root = document.querySelector("#root");
if (root) {
  render(() => <Router>{routes}</Router>, root);
}

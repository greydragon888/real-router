// @solidjs/router nested variant — shared layout chain of DEPTH D (from `?n=`,
// default 1) with sibling leaves a/b at the bottom (nested children +
// props.children; switching a↔b keeps the parent layouts mounted).
import { A, Router } from "@solidjs/router";
import { render } from "solid-js/web";

import { Home } from "../../../_shared/pages";

import type { RouteDefinition } from "@solidjs/router";
import type { JSX } from "solid-js";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const DEPTH = _n > 0 ? _n : 1;
const deepPrefix =
  "/sec" + Array.from({ length: DEPTH - 1 }, (_, i) => `/l${i + 2}`).join("");

function Leaf(props: { n: string }): JSX.Element {
  return (
    <main data-testid="page-item" data-n={props.n}>
      <h1>{props.n}</h1>
    </main>
  );
}

function BottomLayout(props: { children?: JSX.Element }): JSX.Element {
  return (
    <div class="sec">
      <nav>
        <A href={`${deepPrefix}/a`} data-testid="link-sec-a">
          A
        </A>
        <A href={`${deepPrefix}/b`} data-testid="link-sec-b">
          B
        </A>
      </nav>
      {props.children}
    </div>
  );
}

function PassLayout(props: { children?: JSX.Element }): JSX.Element {
  return <div class="lvl">{props.children}</div>;
}

function buildSec(): RouteDefinition {
  const abChildren: RouteDefinition[] = [
    { path: "a", component: () => <Leaf n="a" /> },
    { path: "b", component: () => <Leaf n="b" /> },
  ];
  let node: RouteDefinition = {
    path: DEPTH === 1 ? "/sec" : `l${DEPTH}`,
    component: BottomLayout,
    children: abChildren,
  };
  for (let k = DEPTH - 1; k >= 1; k--) {
    node = {
      path: k === 1 ? "/sec" : `l${k}`,
      component: PassLayout,
      children: [node],
    };
  }
  return node;
}

const routes: RouteDefinition[] = [{ path: "/", component: Home }, buildSec()];

const root = document.querySelector("#root");
if (root) {
  render(() => <Router>{routes}</Router>, root);
}

// @solidjs/router params variant — routes with 1/10/100 path params
// (/pN/:k1/.../:kN). ParamLeaf counts the k-params via useParams(); the nav
// (PARAM_COUNTS links) lives in the `root` layout so it persists across nav.
import { A, Router, useParams } from "@solidjs/router";
import { For } from "solid-js";
import { render } from "solid-js/web";

import { PARAM_COUNTS, paramPath, paramPattern } from "../../../_shared/param-spec";

import type { RouteDefinition } from "@solidjs/router";
import type { JSX } from "solid-js";

function ParamLeaf(): JSX.Element {
  const params = useParams();
  const count = (): number =>
    Object.keys(params).filter((k) => /^k\d+$/.test(k)).length;
  return (
    <main data-testid="page-param" data-count={count()}>
      {count()} params
    </main>
  );
}

function Layout(props: { children?: JSX.Element }): JSX.Element {
  return (
    <>
      <nav>
        <For each={PARAM_COUNTS}>
          {(n) => (
            <A href={paramPath(n)} data-testid={`link-param-${n}`}>
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
  ...PARAM_COUNTS.map((n) => ({
    // absolute pattern /pN/:k1/.../:kN (top-level route under the root layout)
    path: paramPattern(n, ":"),
    component: ParamLeaf,
  })),
];

const root = document.querySelector("#root");
if (root) {
  render(() => <Router root={Layout}>{routes}</Router>, root);
}

// @solidjs/router deep variant — nested children to DEEP_DEPTH. Each level is a
// LevelLayout (renders props.children); the deepest reached level's index child
// (path "/") renders CatalogItem n=<depth>. Config-route array, EAGER components
// (recursive buildLevel), matching the react-router reference's structure.
import { A, Router } from "@solidjs/router";
import { For } from "solid-js";
import { render } from "solid-js/web";

import { CatalogItem } from "../../../_shared/pages";
import { DEEP_DEPTH, DEEP_TARGETS, deepPath } from "../../../_shared/deep-spec";

import type { RouteDefinition } from "@solidjs/router";
import type { JSX } from "solid-js";

function LevelLayout(props: { children?: JSX.Element }): JSX.Element {
  return <div class="lvl">{props.children}</div>;
}

function buildLevel(k: number): RouteDefinition {
  const children: RouteDefinition[] = [
    // index equivalent: child path "/" matches the parent level exactly.
    { path: "/", component: () => <CatalogItem n={String(k)} /> },
  ];
  if (k < DEEP_DEPTH) children.push(buildLevel(k + 1));
  return { path: `l${k}`, component: LevelLayout, children };
}

function Home(): JSX.Element {
  return (
    <nav>
      <For each={DEEP_TARGETS}>
        {(d) => (
          <A href={deepPath(d)} data-testid={`link-deep-${d}`}>
            Depth {d}
          </A>
        )}
      </For>
    </nav>
  );
}

const routes: RouteDefinition[] = [
  { path: "/", component: Home },
  { path: "/deep", component: LevelLayout, children: [buildLevel(1)] },
];

const root = document.querySelector("#root");
if (root) {
  render(() => <Router>{routes}</Router>, root);
}

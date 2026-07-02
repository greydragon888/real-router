import { A, Route, Router, useParams } from "@solidjs/router";
import { For } from "solid-js";
import { render } from "solid-js/web";

import { NAV } from "../../_shared/nav-meta";
import { About, Home, User } from "../../_shared/pages";

import type { JSX } from "solid-js";

function Layout(props: { children?: JSX.Element }): JSX.Element {
  return (
    <>
      <nav>
        <For each={NAV}>
          {(n) => (
            <A href={n.path} data-testid={n.testid}>
              {n.label}
            </A>
          )}
        </For>
      </nav>
      {props.children}
    </>
  );
}

function UserRoute(): JSX.Element {
  const params = useParams();
  return (
    <>
      <User id={params.id ?? ""} />
      <A
        href={`/users/${Number(params.id) + 1}`}
        data-testid="link-user-next"
      >
        Next
      </A>
    </>
  );
}

const root = document.querySelector("#root");
if (root) {
  render(
    () => (
      <Router root={Layout}>
        <Route path="/" component={Home} />
        <Route path="/about" component={About} />
        <Route path="/users/:id" component={UserRoute} />
      </Router>
    ),
    root,
  );
}

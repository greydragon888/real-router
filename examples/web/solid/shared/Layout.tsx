import { Link } from "@real-router/solid";
import { For } from "solid-js";

import type { JSX } from "solid-js";

interface NavLink {
  routeName: string;
  label: string;
}

interface LayoutProps {
  title: string;
  links: NavLink[];
  children: JSX.Element;
}

export function Layout(props: LayoutProps): JSX.Element {
  return (
    <div class="app">
      <header class="header">{props.title}</header>
      <aside class="sidebar">
        <For each={props.links}>
          {(link) => (
            <Link routeName={link.routeName} activeClassName="active">
              {link.label}
            </Link>
          )}
        </For>
      </aside>
      <main class="content">{props.children}</main>
      <footer class="footer">@real-router/solid</footer>
    </div>
  );
}

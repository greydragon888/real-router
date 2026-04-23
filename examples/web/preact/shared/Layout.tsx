import { Link } from "@real-router/preact";

import type { ComponentChildren } from "preact";

interface NavLink {
  routeName: string;
  label: string;
}

interface LayoutProps {
  title: string;
  links: NavLink[];
  children: ComponentChildren;
}

export function Layout({ title, links, children }: LayoutProps) {
  return (
    <div className="app">
      <header className="header">{title}</header>
      <aside className="sidebar">
        {links.map((link) => (
          <Link
            key={link.routeName}
            routeName={link.routeName}
            activeClassName="active"
          >
            {link.label}
          </Link>
        ))}
      </aside>
      <main className="content">{children}</main>
      <footer className="footer">@real-router/preact</footer>
    </div>
  );
}

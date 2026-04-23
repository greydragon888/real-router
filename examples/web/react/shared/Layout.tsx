import { Link } from "@real-router/react";

import type { ReactNode } from "react";

interface NavLink {
  routeName: string;
  label: string;
}

interface LayoutProps {
  title: string;
  links: NavLink[];
  children: ReactNode;
}

export function Layout({
  title,
  links,
  children,
}: Readonly<LayoutProps>): ReactNode {
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
      <footer className="footer">@real-router/react</footer>
    </div>
  );
}

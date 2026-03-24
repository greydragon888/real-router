import { useRouteNode, Link } from "@real-router/react/legacy";

import { About } from "./pages/About";
import { Contacts } from "./pages/Contacts";
import { Home } from "./pages/Home";

import type { JSX } from "react";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "about", label: "About" },
  { routeName: "contacts", label: "Contacts" },
];

function RouteContent(): JSX.Element {
  const { route } = useRouteNode("");

  switch (route?.name) {
    case "home": {
      return <Home />;
    }
    case "about": {
      return <About />;
    }
    case "contacts": {
      return <Contacts />;
    }
    default: {
      return (
        <div>
          <h1>404 — Page Not Found</h1>
          <p>The page you are looking for does not exist.</p>
        </div>
      );
    }
  }
}

export function App(): JSX.Element {
  return (
    <div className="app">
      <header className="header">Real-Router — Legacy Entry</header>
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
      <main className="content">
        <RouteContent />
      </main>
      <footer className="footer">@real-router/react/legacy</footer>
    </div>
  );
}

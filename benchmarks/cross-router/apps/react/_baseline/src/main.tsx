// _baseline — bare React, NO router. Manual view state + history.pushState.
// The FLOOR: what cold-start and one navigation cost with zero router overhead,
// so every router's number can be read as "router work = engine − baseline".
// Renders the IDENTICAL shared pages, so only the routing layer is subtracted.
import { useState, type MouseEvent } from "react";
import { createRoot } from "react-dom/client";

import { About, Home } from "../../_shared/pages";

import type { JSX } from "react";

function App(): JSX.Element {
  const [view, setView] = useState<"home" | "about">(
    location.pathname === "/about" ? "about" : "home",
  );

  const go =
    (v: "home" | "about", path: string) => (event: MouseEvent) => {
      event.preventDefault();
      history.pushState(null, "", path);
      setView(v);
    };

  return (
    <>
      <nav>
        <a href="/" data-testid="link-home" onClick={go("home", "/")}>
          Home
        </a>
        <a href="/about" data-testid="link-about" onClick={go("about", "/about")}>
          About
        </a>
      </nav>
      {view === "home" ? <Home /> : <About />}
    </>
  );
}

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<App />);
}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Framework-only baseline: React + react-dom, no router. Subtracted from the
// minimal/full fixtures to isolate the router-attributable bundle size.
createRoot(document.querySelector("#root")!).render(
  <StrictMode>
    <div>hello world</div>
  </StrictMode>,
);

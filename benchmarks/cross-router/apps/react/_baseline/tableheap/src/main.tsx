// _baseline (bare React, NO router) floor for the cold-start route-count sweep.
// No router → route count is N/A, so this renders one minimal view (page-ready) at
// every ?n — the flat bare-framework boot floor the router engines are read against.
import { createRoot } from "react-dom/client";

const el = document.querySelector("#root");
if (el) {
  createRoot(el).render(<main data-testid="page-ready">home</main>);
}

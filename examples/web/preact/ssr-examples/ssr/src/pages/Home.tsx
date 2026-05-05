import { SearchForm } from "../components/SearchForm";

import type { JSX } from "preact";

export function Home(): JSX.Element {
  return (
    <div>
      <h1>Welcome</h1>
      <p>Real-Router SSR example with Preact and Vite.</p>

      <SearchForm />
    </div>
  );
}

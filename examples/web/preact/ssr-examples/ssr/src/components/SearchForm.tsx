import { useId, useState } from "preact/hooks";

import type { JSX } from "preact";

// Preact's `useId()` (since `preact-render-to-string@6.6.5`, Dec 2025)
// returns a stable per-component-instance ID. SSR and client produce
// identical values, so the a11y contract `<label htmlFor={...}>` ↔
// `<input id={...}>` survives hydration without warnings.
//
// Without useId(): Math.random/Date.now/counter all break under SSR
// because server and client render in different processes / different
// times. useId() is the canonical fix — same hook name as React 18+.
export function SearchForm(): JSX.Element {
  const queryId = useId();
  const sortId = useId();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"asc" | "desc">("asc");

  return (
    <form data-testid="search-form" onSubmit={(e) => e.preventDefault()}>
      <fieldset>
        <legend>Search</legend>

        <div>
          <label htmlFor={queryId} data-testid="query-label">
            Search query
          </label>
          <input
            id={queryId}
            type="text"
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            data-testid="query-input"
          />
        </div>

        <div>
          <label htmlFor={sortId} data-testid="sort-label">
            Sort order
          </label>
          <select
            id={sortId}
            value={sort}
            onChange={(e) =>
              setSort((e.target as HTMLSelectElement).value as "asc" | "desc")
            }
            data-testid="sort-select"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
      </fieldset>
    </form>
  );
}

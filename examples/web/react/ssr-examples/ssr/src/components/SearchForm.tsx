import { useId, useState, type JSX } from "react";

// React 18+'s `useId()` returns a stable per-component-instance ID.
// On SSR, every render produces deterministic IDs; the client
// hydration walker sees the same IDs and matches them, so label[for]
// pointers don't break across the SSR→CSR boundary.
//
// Why hand-rolled IDs (Math.random, counter++, crypto.randomUUID)
// fail under SSR:
//   - Math.random differs between server and client → hydration
//     mismatch warnings.
//   - A module-level counter resets between requests on long-lived
//     workers, but worse: the SAME counter advances per request
//     across concurrent renders, leaking state.
//   - crypto.randomUUID changes per call.
//
// useId() solves all three: deterministic, per-instance, request-
// isolated. Maps to Vue 3.5's useId() and Solid's createUniqueId.
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
            onChange={(e) => setQuery(e.target.value)}
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
            onChange={(e) => setSort(e.target.value as "asc" | "desc")}
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

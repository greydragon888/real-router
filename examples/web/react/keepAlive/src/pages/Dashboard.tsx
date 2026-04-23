import { useState } from "react";

import type { JSX } from "react";

const ALL_ITEMS = Array.from({ length: 40 }, (_, i) => ({
  id: i + 1,
  name: `Item ${String(i + 1).padStart(3, "0")}`,
  category: ["Alpha", "Beta", "Gamma"][i % 3],
  value: Math.round(100 + i * 7.3),
}));

export function Dashboard(): JSX.Element {
  const [search, setSearch] = useState("");

  const filtered = ALL_ITEMS.filter(
    (item) =>
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.category.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <h1>Dashboard</h1>
      <p>
        This page uses <strong>keepAlive</strong>. Type in the search box and
        scroll the table, then navigate to Settings and come back — the state is
        preserved.
      </p>
      <div className="form-group" style={{ marginTop: "16px" }}>
        <label htmlFor="search">Search</label>
        <input
          id="search"
          type="text"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          placeholder="Filter by name or category…"
          style={{ width: "100%", maxWidth: "320px" }}
        />
      </div>
      <div style={{ height: "300px", overflowY: "auto", marginTop: "12px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>#</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Value</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td style={tdStyle}>{item.id}</td>
                <td style={tdStyle}>{item.name}</td>
                <td style={tdStyle}>{item.category}</td>
                <td style={tdStyle}>{item.value}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} style={{ ...tdStyle, textAlign: "center" }}>
                  No results
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "8px 12px",
  textAlign: "left",
  borderBottom: "2px solid #e0e0e0",
  background: "#f8f9fa",
  position: "sticky",
  top: 0,
};

const tdStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderBottom: "1px solid #f0f0f0",
};

import type { JSX } from "react";

export function Settings(): JSX.Element {
  return (
    <div>
      <h1>Settings</h1>
      <p>
        Settings page — URL shows <code>#!/settings</code>.
      </p>
      <p>
        Press F5 to reload — you will stay on the Settings page because the hash
        fragment is part of the URL and is not sent to the server.
      </p>
    </div>
  );
}

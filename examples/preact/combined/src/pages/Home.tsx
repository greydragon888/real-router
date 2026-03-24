import type { JSX } from "preact";

export function Home(): JSX.Element {
  return (
    <div>
      <h1>Home</h1>
      <p>Welcome to the Real-Router combined example.</p>
      <p>
        This app demonstrates all routing features together: auth guards, data
        loading, lazy loading, async guards, nested routes, persistent params,
        and error handling.
      </p>
      <p>Login to access the private area of the app.</p>
    </div>
  );
}

import type { JSX } from "solid-js";

export function Checkout(): JSX.Element {
  return (
    <div>
      <h1>Checkout</h1>
      <div class="card">
        <p>
          This page has an async <code>canActivate</code> guard that takes
          ~600ms to complete.
        </p>
        <p>Watch the progress bar appear at the top during navigation.</p>
      </div>
    </div>
  );
}

import type { JSX } from "react";

export function Checkout(): JSX.Element {
  return (
    <section>
      <h1>Checkout</h1>
      <p>
        Plain page without a <code>canDeactivate</code> guard — the dirty-form
        guard lives on the product edit page instead, because that is where
        unsaved data matters most.
      </p>
    </section>
  );
}

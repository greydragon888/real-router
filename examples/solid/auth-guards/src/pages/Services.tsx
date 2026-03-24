import type { JSX } from "solid-js";

export function Services(): JSX.Element {
  return (
    <div>
      <h1>Services</h1>
      <div class="card">
        <strong>Consulting</strong>
        <p>Strategic technology consulting for enterprises.</p>
      </div>
      <div class="card">
        <strong>Development</strong>
        <p>Full-stack web application development.</p>
      </div>
      <div class="card">
        <strong>Support</strong>
        <p>24/7 technical support and maintenance.</p>
      </div>
    </div>
  );
}

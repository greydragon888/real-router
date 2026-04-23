import type { JSX } from "react";

export function Services(): JSX.Element {
  return (
    <div>
      <h1>Services</h1>
      <div className="card">
        <strong>Consulting</strong>
        <p>Strategic technology consulting for enterprises.</p>
      </div>
      <div className="card">
        <strong>Development</strong>
        <p>Full-stack web application development.</p>
      </div>
      <div className="card">
        <strong>Support</strong>
        <p>24/7 technical support and maintenance.</p>
      </div>
    </div>
  );
}

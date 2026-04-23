import type { JSX } from "solid-js";

export function Contacts(): JSX.Element {
  return (
    <div>
      <h1>Contacts</h1>
      <p>Get in touch with the Real-Router team.</p>
      <div class="card">
        <p>
          <strong>GitHub:</strong>{" "}
          <a
            href="https://github.com/greydragon888/real-router"
            target="_blank"
            rel="noreferrer"
          >
            greydragon888/real-router
          </a>
        </p>
        <p>
          <strong>Issues:</strong>{" "}
          <a
            href="https://github.com/greydragon888/real-router/issues"
            target="_blank"
            rel="noreferrer"
          >
            Report a bug or request a feature
          </a>
        </p>
      </div>
    </div>
  );
}

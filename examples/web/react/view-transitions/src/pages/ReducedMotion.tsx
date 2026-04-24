import type { JSX } from "react";

export function ReducedMotion(): JSX.Element {
  return (
    <div>
      <h1>Reduced motion</h1>
      <p>
        This project&apos;s CSS honours{" "}
        <code>prefers-reduced-motion: reduce</code> by setting{" "}
        <code>animation-duration: 0s</code> on VT pseudo-groups. The browser
        still runs the VT pipeline, but transitions are effectively instant.
      </p>
      <p>
        <strong>Try it:</strong> open your system accessibility settings and
        enable &quot;Reduce motion&quot;. Then navigate around — routes swap
        without animation.
      </p>
      <p>
        In Playwright: <code>page.emulateMedia(&#123; reducedMotion: &quot;reduce&quot; &#125;)</code>.
      </p>
    </div>
  );
}

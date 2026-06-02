import type { JSX } from "react";

interface Step {
  id: string;
  title: string;
  body: string;
  excluded?: boolean;
}

const STEPS: Step[] = [
  {
    id: "step-1",
    title: "Step 1: Install dependencies",
    body: "Install @real-router/core, an URL plugin, and your framework adapter.",
  },
  {
    id: "step-2",
    title: "Step 2: Define routes",
    body: "Routes are a flat list. Names are dot-delimited for nesting.",
  },
  {
    id: "step-3",
    title: "Step 3: Mount RouterProvider",
    body: "Pass scrollSpy={{ selector: ... }} to opt in. Empty selector = disabled.",
  },
  {
    id: "ignored",
    title: "Excluded h2 (class no-spy)",
    body: "Under ?spy=per-route this h2 is excluded by the selector :not(.no-spy).",
    excluded: true,
  },
  {
    id: "step-4",
    title: "Step 4: Add a TocSidebar",
    body: "Map sections to <Link hash>. createActiveRouteSource handles highlighting.",
  },
  {
    id: "step-5",
    title: "Step 5: Test in the browser",
    body: "Scroll. URL hash should mirror the topmost visible h2 section.",
  },
  {
    id: "step-6",
    title: "Step 6: Ship",
    body: "Add an e2e test that exercises Scenario 1 (sequential scroll → hash updates).",
  },
];

export function Guide(): JSX.Element {
  return (
    <article className="article" data-testid="guide">
      <h1>Quick-start guide</h1>
      <p className="guide__hint">
        This route uses selector <code>[id]:is(h2):not(.no-spy)</code> under{" "}
        <code>?spy=per-route</code>. The h2 with class <code>no-spy</code> is
        excluded.
      </p>
      {STEPS.map((step) => (
        <section key={step.id} className="article__section">
          <h2 id={step.id} className={step.excluded ? "no-spy" : undefined}>
            {step.title}
          </h2>
          <p>{step.body}</p>
          <p className="article__filler">
            {"Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(
              25,
            )}
          </p>
        </section>
      ))}
    </article>
  );
}

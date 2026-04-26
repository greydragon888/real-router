import type { JSX } from "react";

export function Home(): JSX.Element {
  return (
    <div>
      <h1>Motion Animations</h1>
      <p>
        Router-coordinated recipe via <code>motion</code> (formerly Framer
        Motion, v12+).{" "}
        <code>&lt;AnimatePresence mode=&quot;wait&quot;&gt;</code> in{" "}
        <code>App.tsx</code> wraps a single page-level <code>motion.div</code>{" "}
        keyed by an <code>exitToken</code> counter that bumps inside{" "}
        <code>subscribeLeave</code>; AnimatePresence detects the key change and
        starts exit. The router blocks on a Promise that resolves on{" "}
        <code>onExitComplete</code> — URL and UI stay in lock-step, same
        semantics as the other three examples.
      </p>

      <h2>Scenarios to try</h2>
      <ol>
        <li>
          <strong>Cross-route fade + slide</strong>: click <em>About</em>. The
          page-level <code>motion.div</code> fades / slides out (
          <code>exit=&#123;{`{ opacity: 0, x: -20 }`}&#125;</code>), the new one
          slides in. <code>mode=&quot;wait&quot;</code> guarantees sequential,
          not crossfade.
        </li>
        <li>
          <strong>Skip on initial</strong>: reload this page — the heading is
          visible immediately. <code>initial=&#123;false&#125;</code> on
          <code> AnimatePresence</code> suppresses entry animation for the first
          mount.
        </li>
        <li>
          <strong>Skip same-route</strong>: click <em>Home</em> while on Home —
          the router rejects with <code>SAME_STATES</code> before re-render;{" "}
          <code>route.name</code> stays the same so AnimatePresence is not
          triggered.
        </li>
        <li>
          <strong>Hero morph (free, via layoutId)</strong>: open{" "}
          <em>Products</em>, click any card. The thumbnail&apos;s rect is paired
          with the cover via{" "}
          <code>layoutId=&quot;product-&#123;id&#125;&quot;</code>; library
          handles the FLIP automatically — no <code>getBoundingClientRect</code>{" "}
          or WAAPI bookkeeping in our code.
        </li>
        <li>
          <strong>List reorder (free, via layout)</strong>: open{" "}
          <em>Products</em> and switch sort. Each <code>motion.li</code> with{" "}
          <code>layout</code> animates from old to new position; library reads
          positions before / after re-render and FLIP&apos;s the diff.
        </li>
        <li>
          <strong>Filter (Query demo)</strong>: switch a filter — survivors
          glide via <code>layout</code>, newcomers fade in via{" "}
          <code>initial</code> / <code>animate</code>, removed items fade out
          via the inner <code>&lt;AnimatePresence mode=&quot;popLayout&quot;&gt;</code>
          {" "}wrapping the list. <code>popLayout</code> pulls exiting items
          from layout flow immediately so survivors reflow into the gap.
        </li>
        <li>
          <strong>Reduced motion</strong>: with{" "}
          <code>prefers-reduced-motion: reduce</code>,{" "}
          <code>&lt;MotionConfig reducedMotion=&quot;user&quot;&gt;</code> in{" "}
          <code>main.tsx</code> automatically disables transform / layout
          animations. Slide-x collapses to opacity-only fade; layoutId pairs and
          motion.li layout become instant snaps.
        </li>
        <li>
          <strong>Abort safety (rapid clicks)</strong>: click sidebar links
          rapid-fire — <code>mode=&quot;wait&quot;</code> queues exits;
          intermediate routes&apos; entrances are skipped if a newer navigation
          arrives before they mount.
        </li>
      </ol>

      <p>
        See <em>About</em> for the side-by-side comparison with all four
        approaches and when each is the right call.
      </p>
    </div>
  );
}

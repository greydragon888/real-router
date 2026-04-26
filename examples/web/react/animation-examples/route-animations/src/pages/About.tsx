import type { JSX } from "react";

export function About(): JSX.Element {
  return (
    <div data-route-root data-route-anim="fade" data-route-scope="about">
      <h1>CSS-classes recipe vs View Transitions</h1>
      <p>
        Two first-class approaches ship side-by-side in this monorepo. They
        target different problems — pick by browser support, the kind of
        animation you need, and how much custom JS you&apos;re willing to write.
      </p>

      <h2>What the recipe gives you for free</h2>
      <ul>
        <li>
          <strong>Cross-browser</strong>: works in every browser that runs CSS
          animations. View Transitions silently degrades to no animation in
          older Firefox / Safari; this recipe does not.
        </li>
        <li>
          <strong>Sequential by default</strong>: the router blocks on the
          Promise returned from <code>subscribeLeave</code>, so the exit
          animation completes before the next page mounts. VT always gives you
          parallel crossfade.
        </li>
        <li>
          <strong>Per-route customisation</strong>: each page picks its own
          animation via <code>data-route-anim</code>. Different durations,
          different keyframes, no central knob to tune.
        </li>
        <li>
          <strong>No rendering suppression</strong>: VT freezes the document
          during playback (real DOM is unhittable, clicks land on the overlay).
          CSS animations leave the DOM live throughout.
        </li>
      </ul>

      <h2>What you give up vs View Transitions</h2>
      <ul>
        <li>
          <strong>Hero morph</strong>: VT pairs matching{" "}
          <code>view-transition-name</code> values and FLIPs them between the
          old and new snapshots automatically. The recipe approximates this by
          measuring <code>getBoundingClientRect()</code> on leave + applying an
          inverse-FLIP transform via the Web Animations API after the
          destination mounts. It works (see <em>Products</em> →{" "}
          <em>ProductDetail</em>) but pays ~30 lines of policy code for what VT
          does in two CSS rules.
        </li>
        <li>
          <strong>Persistent shell &quot;free crossfade&quot;</strong>: VT does
          a pixel-level crossfade between snapshots, so identical regions (e.g.
          a header that does not change) are visually static. With CSS recipes,
          anything inside the leaving root fades. We work around this by placing{" "}
          <code>[data-route-root]</code> on each leaf page&apos;s inner content
          (not on the App-level outer), which keeps the <em>Products</em>{" "}
          shell&apos;s heading + intro from fading on the list ↔ detail
          navigations. But this requires per-page wrapping discipline.
        </li>
        <li>
          <strong>Crossfade between routes</strong>: the recipe is sequential. A
          true crossfade (old fading out while new fades in, both visible
          mid-animation) needs both DOM trees mounted simultaneously, which
          would require coordinating with the framework adapter. VT gives this
          for free via DOM snapshots.
        </li>
      </ul>

      <h2>Decision tree</h2>
      <ul>
        <li>
          Need hero morph or persistent-shell crossfade in modern browsers? Use{" "}
          <code>view-transitions/</code>.
        </li>
        <li>
          Need Firefox 145- support, custom timing per route, full hero/list
          FLIP control with router-coordinated URL+UI sync, no rendering
          suppression? Use this recipe.
        </li>
        <li>
          Need simple entry/exit per page without cross-page coordination?
          Use <code>page-animations/</code>.
        </li>
        <li>
          Want library-native hero morph (<code>layoutId</code>) + list
          FLIP (<code>motion.li layout</code>) declaratively, with
          router-coordinated semantics, willing to accept a 50 KB bundle
          cost? Use <code>motion-animations/</code>.
        </li>
      </ul>

      <h2>The recipe internals</h2>
      <p>
        See <code>src/animations.ts</code> (~10 LOC: <code>Promise.race</code>{" "}
        of <code>animationend</code> + 50 ms timeout) and{" "}
        <code>src/animations-policy.ts</code> (~140 LOC including manual FLIP)
        for the full code. Wiring is symmetric to the VT example: call{" "}
        <code>installRouteAnimations(router)</code> once before{" "}
        <code>router.start()</code>. No <code>RouterProvider</code> prop needed
        — the policy talks to the router directly via{" "}
        <code>subscribeLeave</code> + <code>subscribe</code>.
      </p>
    </div>
  );
}

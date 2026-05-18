import { Component } from "@angular/core";

@Component({
  selector: "about-page",
  template: `
    <h1>Four approaches, side by side</h1>
    <p>
      This monorepo ships four first-class examples of router-coordinated
      animations. They cover overlapping ground but emphasise different
      trade-offs.
    </p>

    <h2>view-transitions/</h2>
    <p>
      Browser-driven via <code>document.startViewTransition</code>. Pixel-level
      snapshots of old and new DOM, automatic FLIP for named regions, automatic
      crossfade for everything else. Smallest code, biggest browser support gap
      (Firefox 145- has no API). Hero morphs and persistent-shell crossfades
      come free.
    </p>

    <h2>route-animations/</h2>
    <p>
      Centralised via three thin factories (<code>installPageAnimator</code>,
      <code>installHeroMorph</code>, <code>installListFlip</code>) called once
      in <code>AppComponent</code>'s constructor. Each factory wraps
      <code>injectRouteExit</code> from
      <code>&#64;real-router/angular</code> with its own DOM recipe; pages stay
      declarative — they only mark <code>[data-route-root]</code> /
      <code>[data-flip-key]</code> attributes. Cross-route coordination (hero
      rects, list FLIP, ghost clones) lives in plain <code>let</code> variables
      inside the factories.
    </p>

    <h2>page-animations/</h2>
    <p>
      Distributed via
      <code>installRouteAnimation(hostRef, &hellip;)</code> per page. Each page
      calls the factory in its own constructor; the factory itself is built on
      <code>injectRouteExit</code> + <code>injectRouteEnter</code> from
      <code>&#64;real-router/angular</code>. Encapsulated, simpler mental model,
      less boilerplate per new page once the factory exists. Cross-page
      coordination needs shared state because each component's factory only sees
      its own lifecycle.
    </p>

    <h2>motion-animations/ (this example)</h2>
    <p>
      Router-coordinated via Angular's signal-driven CSS animations. A
      <code>phase</code> signal in <code>TransitionHost</code>
      drives a class binding on the wrapper; the CSS keyframe's
      <code>animationend</code> resolves the router-blocking Promise. No
      external animation library, no
      <code>&#64;angular/animations</code> trigger DSL — just signals and CSS.
      The Promise the router awaits resolves on <code>animationend</code> — URL
      and UI stay in lock-step like the other three examples.
    </p>
    <p>
      <strong>Difference from motion-react:</strong> the React equivalent (<code
        >motion</code
      >
      v12+) ships <code>layoutId</code> for cross-component hero morphs and
      <code>&lt;motion.li layout&gt;</code> for automatic list reorder
      animations. Angular has no built-in equivalent. CSS keyframes on the
      <code>page</code> wrapper are per-element entry/exit only. For cross-route
      hero morph in Angular, see <code>route-animations/</code> for the
      hand-rolled WAAPI recipe.
    </p>

    <h2>Decision tree</h2>
    <ul>
      <li>
        Hero morph or persistent-shell static regions, modern browsers? →
        <code>view-transitions/</code> (cheapest code).
      </li>
      <li>
        Cross-browser, custom timing per route, hero morph,
        <em>and</em> list FLIP with ghosts, full router coordination? →
        <code>route-animations/</code>.
      </li>
      <li>
        Cross-browser, simple entry / exit per page, no hero morph, no
        coordinated reorder, encapsulation? →
        <code>page-animations/</code>.
      </li>
      <li>
        Cross-browser, library-free declarative page transitions via Angular
        signals + CSS keyframes? →
        <code>motion-animations/</code> (this).
      </li>
    </ul>

    <h2>What this example demonstrates uniquely</h2>
    <p>
      <strong>
        Library-free, router-coordinated entry/exit using Angular's signal
        system and plain CSS keyframes.
      </strong>
      The router stays blocked on the page-level exit Promise (resolved by
      <code>animationend</code>), so URL and UI stay in lock-step — same
      semantics as <code>route-animations/</code> and
      <code>page-animations/</code>, but the entry / exit choreography lives in
      a single signal whose value drives all CSS state, instead of hand-rolled
      CSS keyframes + <code>animationend</code> bookkeeping spread across
      multiple factories.
    </p>

    <h2>The wiring</h2>
    <p>
      See <code>src/main.ts</code>, <code>src/app.component.ts</code>, and
      <code>src/transition-host.component.ts</code>.
      <code>TransitionHost</code> bridges the leave-window with Angular's
      signal-driven render pipeline: it calls <code>injectRouteExit</code> from
      <code>&#64;real-router/angular</code> with a handler that sets
      <code>phase()</code> to <code>"leaving"</code> (driving the CSS class
      change, which triggers the leave keyframe) and returns a Promise resolved
      when <code>animationend</code> fires. After the router commits,
      <code>injectRouteEnter</code> snaps phase to <code>"entering"</code>; the
      entry keyframe plays; on its <code>animationend</code> phase snaps back to
      <code>"active"</code>.
    </p>
  `,
})
export class AboutComponent {}

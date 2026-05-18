import { Component } from "@angular/core";

@Component({
  selector: "home-page",
  template: `
    <h1>Motion Animations</h1>
    <p>
      Router-coordinated recipe via Angular's signal-driven CSS animations — no
      external library, no
      <code>&#64;angular/animations</code> trigger DSL. The
      <code>transition-host</code> component owns a <code>phase</code> signal
      whose value drives a class binding on the wrapper
      <code>&lt;div&gt;</code>. <code>injectRouteExit</code> from
      <code>&#64;real-router/angular</code> sets the phase to
      <code>"leaving"</code>; CSS plays a keyframe whose
      <code>animationend</code> resolves the router-blocking Promise. After the
      router commits, <code>injectRouteEnter</code> snaps the phase to
      <code>"entering"</code> so the new content fades in. URL and UI stay in
      lock-step, identical semantics to <code>route-animations/</code> and
      <code>page-animations/</code>.
    </p>

    <h2>Scenarios to try</h2>
    <ol>
      <li>
        <strong>Cross-route fade + slide</strong>: click <em>About</em>. The
        <code>page</code> wrapper fades and slides out (<code
          >opacity: 1 → 0; transform: translateX(0) → -20px</code
        >), the new content slides in from <code>+20px</code>. Sequential — the
        router awaits leave's <code>animationend</code> before committing.
      </li>
      <li>
        <strong>Skip on initial</strong>: reload this page — the heading is
        visible immediately. The default phase is <code>"active"</code>, so no
        entry keyframe plays on first mount. Only
        <code>injectRouteEnter</code> can transition to <code>"entering"</code>,
        and it does not fire on initial load (no <code>previousRoute</code>).
      </li>
      <li>
        <strong>Skip same-route</strong>: click <em>Home</em> while on Home —
        <code>SAME_STATES</code> rejection short-circuits before
        <code>injectRouteExit</code> would fire; phase stays
        <code>"active"</code>, no animation.
      </li>
      <li>
        <strong>Reduced motion</strong>: with
        <code>prefers-reduced-motion: reduce</code>, the
        <code>&#64;media</code> block in <code>animations.css</code> collapses
        <code>page-leave</code> / <code>page-enter</code> keyframes to
        <code>animation: none</code>. <code>animationend</code> still fires on
        the next frame, so the router unblocks immediately and navigation
        completes without visible animation.
      </li>
      <li>
        <strong>Abort safety (rapid clicks)</strong>: click sidebar links
        rapid-fire — the <code>AbortSignal</code> from
        <code>injectRouteExit</code> resolves the in-flight Promise on
        cancellation. The router pipeline drains cleanly; intermediate routes'
        entrances may be skipped, but no animations leak.
      </li>
    </ol>

    <h2>Differences from motion-react</h2>
    <p>
      motion-react ships <code>layoutId</code> for cross-component hero morphs
      and <code>&lt;motion.li layout&gt;</code> for automatic list reorder.
      Angular has no built-in equivalent. CSS animations on the
      <code>page</code> wrapper are <strong>per-element entry/exit</strong> only
      — they do not pair elements across the route boundary or animate position
      changes automatically. For cross-route hero morph in Angular, see
      <code>route-animations/</code>'s <code>installHeroMorph</code> (~110 LOC)
      — manual WAAPI inverse-FLIP. For per-list reorder animations, see
      <code>installListFlip</code> in either <code>route-animations/</code> or
      <code>page-animations/</code>.
    </p>
    <p>
      What this example demonstrates uniquely:
      <strong>library-free, router-coordinated entry/exit</strong>
      using Angular's signal system + plain CSS keyframes. The router stays
      blocked on the page-level exit Promise (resolved by
      <code>animationend</code>), so URL and UI stay in lock-step — same
      semantics as <code>route-animations/</code> and
      <code>page-animations/</code>, but the choreography is expressed through a
      single signal whose value drives all CSS state.
    </p>

    <p>
      See <em>About</em> for the side-by-side comparison with all four
      approaches and when each is the right call.
    </p>
  `,
})
export class HomeComponent {}

import { Component } from "@angular/core";

@Component({
  selector: "about-page",
  template: `
    <div data-route-root data-route-anim="fade">
      <h1>CSS-classes recipe vs View Transitions</h1>
      <p>
        Two first-class approaches ship side-by-side in this monorepo.
        They target different problems — pick by browser support, the
        kind of animation you need, and how much custom JS you're willing
        to write.
      </p>

      <h2>What the recipe gives you for free</h2>
      <ul>
        <li>
          <strong>Cross-browser</strong>: works in every browser that
          runs CSS animations. View Transitions silently degrades to no
          animation in older Firefox / Safari; this recipe does not.
        </li>
        <li>
          <strong>Sequential by default</strong>: the router blocks on
          the Promise returned from <code>subscribeLeave</code>, so the
          exit animation completes before the next page mounts. VT
          always gives you parallel crossfade.
        </li>
        <li>
          <strong>Per-route customisation</strong>: each page picks its
          own animation via <code>data-route-anim</code>. Different
          durations, different keyframes, no central knob to tune.
        </li>
        <li>
          <strong>No rendering suppression</strong>: VT freezes the
          document during playback (real DOM is unhittable, clicks land
          on the overlay). CSS animations leave the DOM live throughout.
        </li>
      </ul>

      <h2>What you give up vs View Transitions</h2>
      <ul>
        <li>
          <strong>Hero morph</strong>: VT pairs matching
          <code>view-transition-name</code> values and FLIPs them between
          the old and new snapshots automatically. The recipe
          approximates this by measuring
          <code>getBoundingClientRect()</code> on leave + applying an
          inverse-FLIP transform via the Web Animations API after the
          destination mounts. It works (see <em>Products</em> →
          <em>ProductDetail</em>) but pays ~30 lines of policy code for
          what VT does in two CSS rules.
        </li>
        <li>
          <strong>Persistent shell "free crossfade"</strong>: VT does a
          pixel-level crossfade between snapshots, so identical regions
          (e.g. a header that does not change) are visually static. With
          CSS recipes, everything inside the leaving root fades — there
          is no concept of "identical region stays static" because we
          never compare old and new DOM.
        </li>
        <li>
          <strong>Crossfade between routes</strong>: the recipe is
          sequential. A true crossfade (old fading out while new fades
          in, both visible mid-animation) needs both DOM trees mounted
          simultaneously, which would require coordinating with the
          framework adapter. VT gives this for free via DOM snapshots.
        </li>
      </ul>

      <h2>Decision tree</h2>
      <ul>
        <li>
          Need hero morph or persistent-shell crossfade in modern
          browsers? Use <code>view-transitions/</code>.
        </li>
        <li>
          Need Firefox 145- support, custom timing per route, full
          hero/list FLIP control with router-coordinated URL+UI sync, no
          rendering suppression? Use this recipe.
        </li>
        <li>
          Need simple entry/exit per page without cross-page
          coordination? Use <code>page-animations/</code>.
        </li>
        <li>
          Want library-free, language-native page transitions via
          Angular's <code>&#64;angular/animations</code> trigger system?
          Use <code>motion-animations/</code>.
        </li>
      </ul>

      <h2>The recipe internals</h2>
      <p>
        Three thin factories own the app's animation behavior, each
        calling <code>injectRouteExit</code> from
        <code>&#64;real-router/angular</code> once with its own recipe:
      </p>
      <ul>
        <li>
          <code>installPageAnimator</code> (~50 LOC) — page-level fade/slide
          on cross-route nav. Adds <code>.leaving</code> to the active
          <code>[data-route-root]</code>, awaits its
          <code>getAnimations() + .finished</code> promises, strips the
          class.
        </li>
        <li>
          <code>installHeroMorph</code> (~110 LOC) — captures the source
          thumb rect on <code>injectRouteExit</code>, plays an inverse-FLIP
          transform on the destination cover after commit (via
          <code>navigator.subscribe</code>) using the Web Animations API.
        </li>
        <li>
          <code>installListFlip</code> (~230 LOC) — same-route reorder +
          ghost exits. Captures rects + clones unmount-bound items,
          replays inverse translates on survivors, fades clones for
          removed items.
        </li>
      </ul>
      <p>
        <code>createDirectionTracker(router)</code> from
        <code>shared/dom-utils</code> is wired in <code>main.ts</code>
        before <code>router.usePlugin(browserPluginFactory())</code>; it
        writes <code>data-nav-direction="forward" | "back"</code> on
        <code>&lt;html&gt;</code> for direction-aware slide keyframes.
      </p>
      <p>
        <strong>Angular handler-reactivity:</strong> <code>inject*</code>
        functions run once at component construction, so handler bodies
        are captured in closure. Cross-handler state
        (<code>installHeroMorph</code>'s <code>pendingHero</code>,
        <code>installListFlip</code>'s <code>pendingFlips</code>) lives
        as plain <code>let</code> variables in the factory body —
        equivalent role to React's <code>useRef</code>, simpler
        ergonomics.
      </p>
    </div>
  `,
})
export class AboutComponent {}

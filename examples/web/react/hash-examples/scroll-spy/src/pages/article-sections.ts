export interface Section {
  id: string;
  title: string;
  body: string;
}

export const SECTIONS: Section[] = [
  {
    id: "intro",
    title: "Introduction",
    body: "The hash channel coordinates URL fragment state with DOM scroll position. real-router exposes this through createScrollSpy in shared/dom-utils.",
  },
  {
    id: "section-1",
    title: "1. Why a scroll spy",
    body: "Long articles need bookmarkable section anchors. Without router coordination, manual replaceState writes drift from router state.",
  },
  {
    id: "section-2",
    title: "2. Hash as plugin state",
    body: "URL plugins claim state.context.url via claimContextNamespace. Hash is decoded, hashChanged signals intent.",
  },
  {
    id: "section-3",
    title: "3. IntersectionObserver",
    body: "createScrollSpy wraps a single IntersectionObserver. Selector targets anchor candidates; rootMargin defines the active zone.",
  },
  {
    id: "section-4",
    title: "4. Debounce coalescing",
    body: "rAF + 150ms trailing debounce caps emit rate at <=10/sec under continuous scroll. Acceptance criterion §8.4.",
  },
  {
    id: "section-5",
    title: "5. Cooldown gate",
    body: "User-driven Link click triggers smooth scrollIntoView. Spy enters cooldown until scrollend or 500ms timeout.",
  },
  {
    id: "section-6",
    title: "6. Self-emit guard",
    body: "Spy's own emits don't trigger cooldown — selfEmitting flag avoids self-rate-limiting.",
  },
  {
    id: "section-7",
    title: "7. Topmost selection",
    body: "Picks the anchor closest to active zone top. Single-pass algorithm with positive/negative distance fallback.",
  },
  {
    id: "section-8",
    title: "8. Map accumulation",
    body: "IO entries delivered only for targets whose intersection state changed (W3C IO §3.2.1). Map keyed by target merges across batches.",
  },
  {
    id: "section-9",
    title: "9. Replace semantics",
    body: "Spy emits with replace:true — scroll-restoration reads portable transition.replace and skips magnetic snap.",
  },
  {
    id: "section-10",
    title: "10. Hash-aware Link",
    body: "createActiveRouteSource reads state.context.url.hash. Tab Links light up via standard subscription pipeline.",
  },
  {
    id: "footer",
    title: "References",
    body: "Issue #575, foundation RFC rfc-transition-meta-discrimination.md (#10.7 closure), W3C IO spec §3.2.",
  },
];

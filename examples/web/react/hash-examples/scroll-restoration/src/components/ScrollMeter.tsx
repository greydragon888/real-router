import { useRouter } from "@real-router/react";
import { useEffect, useState } from "react";

import type { JSX } from "react";

interface NavigationContext {
  navigationType?: "push" | "replace" | "traverse" | "reload";
  direction?: "forward" | "back" | "unknown";
}

interface UrlContext {
  hash?: string;
  hashChanged?: boolean;
}

interface MeterSnapshot {
  scrollY: number;
  containerScrollTop: number | null;
  navigationType: string;
  direction: string;
  hash: string;
  hashChanged: boolean;
  store: Record<string, number>;
}

const STORE_KEY = "real-router:scroll";

function readStore(): Record<string, number> {
  try {
    const raw = globalThis.sessionStorage.getItem(STORE_KEY);

    if (!raw) {
      return {};
    }

    const parsed: unknown = JSON.parse(raw);

    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, number>)
      : {};
  } catch {
    return {};
  }
}

function readContainerTop(): number | null {
  const element = document.querySelector("#virtual-scroller");

  return element ? element.scrollTop : null;
}

/**
 * Floating panel showing live scrollY, navigation context, and the
 * sessionStorage scroll-restore store. Doubles as a stable Playwright anchor:
 * `data-scroll-y` attribute is more rAF-stable than `evaluate(() => scrollY)`.
 */
export function ScrollMeter(): JSX.Element {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<MeterSnapshot>(() =>
    buildSnapshot(router),
  );

  useEffect(() => {
    const update = (): void => {
      setSnapshot(buildSnapshot(router));
    };

    const unsubscribe = router.subscribe(update);

    const tick = (): void => {
      update();
    };

    window.addEventListener("scroll", tick, { passive: true });
    const interval = globalThis.setInterval(tick, 200);

    return () => {
      unsubscribe();
      window.removeEventListener("scroll", tick);
      globalThis.clearInterval(interval);
    };
  }, [router]);

  return (
    <aside
      className="scroll-meter"
      data-testid="scroll-meter"
      data-scroll-y={Math.round(snapshot.scrollY)}
      data-container-top={
        snapshot.containerScrollTop === null
          ? "null"
          : Math.round(snapshot.containerScrollTop)
      }
      data-direction={snapshot.direction}
      data-nav-type={snapshot.navigationType}
      data-hash={snapshot.hash}
      data-hash-changed={String(snapshot.hashChanged)}
    >
      <h4>Scroll Meter</h4>
      <dl>
        <dt>scrollY</dt>
        <dd>{Math.round(snapshot.scrollY)}</dd>
        <dt>container</dt>
        <dd>{snapshot.containerScrollTop ?? "—"}</dd>
        <dt>navType</dt>
        <dd>{snapshot.navigationType}</dd>
        <dt>direction</dt>
        <dd>{snapshot.direction}</dd>
        <dt>hash</dt>
        <dd>{snapshot.hash || "—"}</dd>
      </dl>
      <pre data-testid="scroll-meter-store">
        {JSON.stringify(snapshot.store, null, 2)}
      </pre>
    </aside>
  );
}

function buildSnapshot(router: ReturnType<typeof useRouter>): MeterSnapshot {
  const route = router.getState();
  const nav = (route?.context as { navigation?: NavigationContext } | undefined)
    ?.navigation;
  const url = (route?.context as { url?: UrlContext } | undefined)?.url;

  return {
    scrollY: window.scrollY,
    containerScrollTop: readContainerTop(),
    navigationType: nav?.navigationType ?? "—",
    direction: nav?.direction ?? "—",
    hash: url?.hash ?? "",
    hashChanged: url?.hashChanged ?? false,
    store: readStore(),
  };
}

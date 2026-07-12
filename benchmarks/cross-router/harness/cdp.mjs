// Chrome DevTools Protocol helpers via Playwright's CDPSession (Chromium-only).
// Metric names (ScriptDuration / LayoutDuration / RecalcStyleDuration /
// TaskDuration / JSHeapUsedSize) are runtime Chromium metrics from
// Performance.getMetrics — durations are in SECONDS.

export async function attachCDP(page) {
  const client = await page.context().newCDPSession(page);
  await client.send("Performance.enable");
  await client.send("HeapProfiler.enable");
  return client;
}

export async function getMetrics(client) {
  const { metrics } = await client.send("Performance.getMetrics");
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
}

// Blink history work (`history.pushState`'s same-document-navigation), which
// `ScriptDuration` (V8-only) does NOT count. Traces `fn`'s navigations and sums
// the `FrameLoader::updateForSameDocumentNavigation` event durations. Returns µs
// (caller divides by nav count). The event `dur` is the real Blink work — tracing
// overhead inflates V8, not this event — so it stays clean even on the hot path.
const BLINK_EVENT = "FrameLoader::updateForSameDocumentNavigation";
export async function traceBlinkUs(client, fn) {
  let sum = 0;
  const onData = (d) => {
    for (const e of d.value) {
      if (e.ph === "X" && e.dur && e.name === BLINK_EVENT) sum += e.dur;
    }
  };
  client.on("Tracing.dataCollected", onData);
  await client.send("Tracing.start", {
    categories:
      "toplevel,devtools.timeline,disabled-by-default-devtools.timeline,v8,blink",
    transferMode: "ReportEvents",
  });
  await fn();
  const complete = new Promise((r) => client.once("Tracing.tracingComplete", r));
  await client.send("Tracing.end");
  await complete;
  client.off("Tracing.dataCollected", onData);
  return sum;
}

// Per-nav settle detector, installed once via `page.addInitScript` (measure.mjs)
// so EVERY per-nav scenario shares ONE precise, symmetric close-of-window signal.
// Replaces the old rAF-poll `waitFor` (frame-quantized ~16 ms — it forced async
// engines to wait a whole frame after the click microtask, so any wall-clock built
// on it was frame-quantized and `ScriptDuration`-only was the only sub-ms signal —
// F1/F2, #1451/#1452). A MutationObserver resolves the instant the target selector
// matches — element swap, class toggle, or text change — because the catch-all
// observer re-checks `querySelector` on every mutation and only resolves on the
// real target. Timing a `click()`→`settle()` window with `performance.now`
// (summed over N, so the 100 µs perf.now clamp averages out) captures the FULL
// felt cost: the microtask flush `ScriptDuration` misses AND the Blink pushState
// inside the click task — the unified per-nav metric the audit converged on.
export function installNavMetric() {
  window.__navMetric = {
    settle(selector, timeoutMs = 4000) {
      return new Promise((resolve, reject) => {
        if (document.querySelector(selector)) {
          resolve();
          return;
        }
        let timer;
        const obs = new MutationObserver(() => {
          if (!document.querySelector(selector)) return;
          obs.disconnect();
          clearTimeout(timer);
          resolve();
        });
        obs.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });
        timer = setTimeout(() => {
          obs.disconnect();
          reject(new Error(`__navMetric.settle timeout: ${selector}`));
        }, timeoutMs);
      });
    },
  };
}

// Real forced GC (the browser upgrade over jsdom forceGC), then read used heap.
export async function forceGcHeapBytes(client) {
  await client.send("HeapProfiler.collectGarbage");
  const m = await getMetrics(client);
  return m.JSHeapUsedSize;
}

// Transient allocation (bytes) produced during `fn` — the memory counterpart to
// the script/Blink CPU metrics. Wraps the work in a HeapProfiler allocation
// sample and sums the profile's self-sizes = total bytes allocated (garbage
// included), the driver of GC pressure / jank under load. Pair with a nav count
// → KB/nav. A finer `samplingInterval` = more samples = tighter estimate at some
// overhead; 256 B yields ~30+ samples even for the leanest router over ~60 navs,
// which the warmup+K aggregation then stabilizes. Distinct from
// `forceGcHeapBytes` (retained heap after GC) — this counts churn, not footprint.
export async function sampleAllocationBytes(client, fn, samplingInterval = 256) {
  await client.send("HeapProfiler.enable");
  // includeObjectsCollectedBy{Major,Minor}GC (CDP, Chrome M111+) make the
  // profile count objects the GC already reclaimed during `fn` — i.e. GROSS
  // churn (garbage included). Without them the sampling profiler drops a sample
  // when its object is collected, so `stopSampling` returns only objects LIVE at
  // stop → the sum degrades to ≈ retained growth and silently under-reports
  // transient allocation (the metric this function promises). Do not remove
  // them; that reintroduces #1417 (64 B/nav floor-violating numbers).
  await client.send("HeapProfiler.startSampling", {
    samplingInterval,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });
  await fn();
  const { profile } = await client.send("HeapProfiler.stopSampling");
  await client.send("HeapProfiler.disable");
  const sumSelf = (node) =>
    (node.selfSize || 0) +
    (node.children || []).reduce((acc, c) => acc + sumSelf(c), 0);
  return sumSelf(profile.head);
}

// Shared deck render — the pure, DOM-free HTML/SVG builders used by BOTH shells
// (deck-shell.html interactive web deck + print-shell.html paginated PDF edition).
// build-deck inlines this at each shell's `//__RENDER__` marker (CSP: everything inline,
// no <script src>). It reads config-block globals spliced in by build-deck (SER, RANK,
// SCEN, WHY, why, GROUPS, DATA, GRID, SWEEP, CO, META, VERSIONS, PN_S/MEM_S/SCALE_S) and
// shell-level globals (COHORTS, FIELD). Interactive wiring (isolate/tooltip/anchors) stays
// in deck-shell; the print shell composes pages from these builders with interactive=false.

// translate="no": shield router/brand/framework names + code identifiers from machine
// translation (Google Translate etc.) — else "real-router"→"настоящий роутер". Wraps
// matches ONLY inside text nodes, never inside tags/attributes.
// Each match also earns emphasis in prose: a router name gets .nr (bold); real-router
// additionally gets .rr (brand blue) so it stands out among the bolded rivals. Framework
// names (React/Vue/…), scenario ids (nav-latency, wide-config, …) and code identifiers
// (use:link) are shielded but NOT emphasised — they're context, not the subject. CSS for
// .nr/.rr lives in both shells. (Board framework headers + card scenario keys carry their
// own translate='no' attr — see boardHTML/head — since they aren't run through NT.)
const NO_TR = ["@mateothegreat/svelte5-router", "@tanstack/react-router", "@tanstack/vue-router", "@tanstack/solid-router", "@solidjs/router", "@angular/router", "real-router", "react-router", "vue-router", "solid-router", "sv-router", "mateo-router", "TanStack", "mateo", "use:link", "React", "Vue", "Solid", "Svelte", "Angular", "search-param-scaling", "nested-switch", "back-forward", "active-links", "nav-latency", "wide-config", "deep-config", "gc-per-nav", "table-heap", "link-build", "cold-start", "nav-churn", "param-nav"].sort((a, b) => b.length - a.length);
const ROUTERS = new Set(["@mateothegreat/svelte5-router", "@tanstack/react-router", "@tanstack/vue-router", "@tanstack/solid-router", "@solidjs/router", "@angular/router", "real-router", "react-router", "vue-router", "solid-router", "sv-router", "mateo-router", "TanStack", "mateo"]);
const NT_RE = new RegExp("(" + NO_TR.join("|") + ")", "g");
function ntClass(name) { return name === "real-router" ? " class='nr rr'" : ROUTERS.has(name) ? " class='nr'" : ""; }
function NT(h) { return String(h).replace(/(<[^>]*>)|([^<]+)/g, (m, _tag, txt) => txt == null ? m : txt.replace(NT_RE, (_mm, name) => "<span translate='no'" + ntClass(name) + ">" + name + "</span>")); }

function fmt(v, u) { if (v == null) return "—"; let s; if (u === "KB") s = Math.round(v).toString(); else if (u === "MB") s = v.toFixed(2); else s = (v < 1 ? v.toFixed(3) : v < 10 ? v.toFixed(2) : v.toFixed(1)); if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, ""); return s; }

function head(s) { return "<div class='card-head'><span class='card-title'>" + s.t + "</span><span class='card-key' translate='no'>" + s.k + "</span><span class='chip'>" + s.c + "</span></div><div class='what'>" + s.what + "</div>"; }

function barCard(s) {
  const E = s.e.filter(x => x[1] != null);
  const max = Math.max(...E.map(x => x[1]));
  const sorted = [...E.map(x => x[1])].sort((a, b) => a - b);
  const rank = v => Math.min(2, sorted.indexOf(v));
  const bars = E.map(([n, v]) => {
    const rr = n === "real-router", w = Math.max(3, (v / max) * 100), col = RANK[rank(v)];
    return "<div class='bar" + (rr ? " rr" : "") + "'><span class='en' translate='no'>" + n + "</span><span class='track'><span class='fill' style='width:" + w.toFixed(1) + "%;background:" + col + "'></span></span><span class='val'>" + fmt(v, s.u) + " " + s.u + "</span></div>";
  }).join("");
  const pod = ["1st", "2nd", "3rd"].slice(0, Math.min(3, E.length)).map((lbl, i) => "<span><i style='background:" + RANK[i] + "'></i>" + lbl + "</span>").join("");
  return "<div class='card'>" + head(s) + "<div class='bars'>" + bars + "</div>"
    + "<div class='podium'>" + pod + "</div>"
    + "<div class='why'>" + s.why + "</div></div>";
}

function smoothPath(pts) {
  if (pts.length < 2) return pts.length ? ("M" + pts[0][0].toFixed(1) + "," + pts[0][1].toFixed(1)) : "";
  let d = "M" + pts[0][0].toFixed(1) + "," + pts[0][1].toFixed(1);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += "C" + c1x.toFixed(1) + "," + c1y.toFixed(1) + " " + c2x.toFixed(1) + "," + c2y.toFixed(1) + " " + p2[0].toFixed(1) + "," + p2[1].toFixed(1);
  }
  return d;
}

// interactive (default true): draw the invisible enlarged hover targets (pass 3) that feed
// the value tooltip. The print edition passes false — no pointer events in a PDF, and it
// keeps the SVG lean.
function chart(p, ser, u, log, sw, interactive = true) {
  const W = 560, H = 170, pl = 8, pr = 52, pt = 16, pb = 24, iw = W - pl - pr, ih = H - pt - pb;
  const TIE = "#facc15"; // tie colour for winner diamonds — kept in sync with the board's --sy (also #facc15) so table and chart speak ONE tie yellow. A bright, pure yellow, pushed well off the rival line's orange-brown (#c07b2e) so it stops merging into the curve; a winner diamond turns yellow at a tie point (per-point verdict "y") + a thicker white halo so it detaches from whatever line it sits on. (If --sy changes, change this too — SVG fill attributes can't read the CSS var.)
  const xa = i => pl + (p.length === 1 ? iw / 2 : iw * i / (p.length - 1));
  let o = "", ya;
  if (log) {
    const pos = ser.flatMap(x => x[1]).filter(v => v != null && v > 0);
    let loL = Math.log10(Math.min(...pos)), hiL = Math.log10(Math.max(...pos));
    if (hiL - loL < 1) { const mid = (loL + hiL) / 2; loL = mid - 0.5; hiL = mid + 0.5; }
    const span = (hiL - loL) || 1;
    const dL = loL - span * 0.06, uL = hiL + span * 0.12, rng = uL - dL;
    ya = v => pt + ih - ((Math.log10(v) - dL) / rng) * ih;
    o += "<line x1='" + pl + "' y1='" + pt + "' x2='" + (pl + iw) + "' y2='" + pt + "' stroke='#eceef2'/>";
    for (let d = Math.ceil(dL); d <= Math.floor(uL); d++) { const gv = Math.pow(10, d), gy = ya(gv); if (gy < pt + 11) continue; o += "<line x1='" + pl + "' y1='" + gy.toFixed(1) + "' x2='" + (pl + iw) + "' y2='" + gy.toFixed(1) + "' stroke='#eceef2'/>"; o += "<text x='" + pl + "' y='" + (gy - 2.5).toFixed(1) + "' font-size='8.5' fill='#b3b9c2' font-family='ui-monospace,Menlo,monospace'>" + fmt(gv, u) + "</text>"; }
    o += "<text x='" + pl + "' y='" + (pt - 4) + "' font-size='9.5' fill='#b3b9c2' font-family='ui-monospace,Menlo,monospace'>" + u + " · log</text>";
  } else {
    const maxv = Math.max(...ser.flatMap(x => x[1]).filter(v => v != null)) * 1.08;
    ya = v => pt + ih - (v / maxv) * ih;
    for (let k = 0; k <= 2; k++) { const y = pt + ih * k / 2; o += "<line x1='" + pl + "' y1='" + y + "' x2='" + (pl + iw) + "' y2='" + y + "' stroke='#eceef2'/>"; }
    o += "<text x='" + pl + "' y='" + (pt - 4) + "' font-size='9.5' fill='#b3b9c2' font-family='ui-monospace,Menlo,monospace'>" + maxv.toFixed(maxv < 10 ? 1 : 0) + " " + u + "</text>";
  }
  p.forEach((pp, i) => o += "<text x='" + xa(i).toFixed(1) + "' y='" + (H - 7) + "' font-size='10' fill='#8b939f' text-anchor='middle' font-family='ui-monospace,Menlo,monospace'>" + pp + "</text>");
  const winIdx = p.map((_, i) => { let best = Infinity, bn = null; for (const [n, vals] of ser) { const v = vals[i]; if (v != null && v < best) { best = v; bn = n; } } return bn; });
  for (const [n, vals] of ser) {
    if (vals.every(v => v == null)) continue;
    const col = SER[n];
    const pts = vals.map((v, i) => v == null ? null : [xa(i), ya(v)]).filter(Boolean);
    o += "<path d='" + smoothPath(pts) + "' fill='none' stroke='" + col + "' stroke-width='1.8' stroke-linejoin='round' stroke-linecap='round'/>";
  }
  for (const [n, vals] of ser) { if (vals.every(v => v == null)) continue; vals.forEach((v, i) => { if (v == null || winIdx[i] === n) return; o += "<circle cx='" + xa(i).toFixed(1) + "' cy='" + ya(v).toFixed(1) + "' r='2.4' fill='" + SER[n] + "'/>"; }); }
  for (const [n, vals] of ser) { if (vals.every(v => v == null)) continue; vals.forEach((v, i) => { if (v == null || winIdx[i] !== n) return; const cx = xa(i), cy = ya(v), d = 6.4, tie = sw && sw[i] && sw[i][0] === "y"; o += "<path d='M" + cx.toFixed(1) + "," + (cy - d).toFixed(1) + "L" + (cx + d).toFixed(1) + "," + cy.toFixed(1) + "L" + cx.toFixed(1) + "," + (cy + d).toFixed(1) + "L" + (cx - d).toFixed(1) + "," + cy.toFixed(1) + "Z' fill='" + (tie ? TIE : SER[n]) + "' stroke='#fff' stroke-width='" + (tie ? 2.7 : 1.9) + "' stroke-linejoin='round'/>"; }); }
  for (const [n, vals] of ser) { if (vals.every(v => v == null)) continue; const col = SER[n]; let li = vals.length - 1; while (li >= 0 && vals[li] == null) li--; if (li >= 0) o += "<text x='" + (xa(li) + 6).toFixed(1) + "' y='" + (ya(vals[li]) + 3.5).toFixed(1) + "' font-size='10' fill='" + col + "' font-family='ui-monospace,Menlo,monospace' font-weight='600'>" + fmt(vals[li], u) + "</text>"; }
  if (interactive) for (const [hn, hv] of ser) { if (hv.every(v => v == null)) continue; hv.forEach((v, i) => { if (v == null) return; o += "<circle cx='" + xa(i).toFixed(1) + "' cy='" + ya(v).toFixed(1) + "' r='9' fill='none' pointer-events='all' style='cursor:crosshair' data-tip='" + hn + " · " + fmt(v, u) + " " + u + "'/>"; }); }
  return "<svg viewBox='0 0 " + W + " " + H + "' role='img'>" + o + "</svg>";
}

function rowMax(k, swept) {
  let m = 1.05;
  for (const [co] of COHORTS) {
    if (swept) { const st = SWEEP[co] && SWEEP[co][k]; if (st) for (const p of st) { if (!p) continue; const [cl, ra] = p; if (cl !== "y" && ra > m) m = ra; } }
    else { const c = GRID[co][k]; if (c && c[1] !== "y" && c[0] > m) m = c[0]; }
  }
  return m;
}
function dcell(cls, ratio, rmax) {
  if (cls === "y")
    return "<span class='dcell'><span class='numL'></span><span class='trk'></span><span class='axis tie'></span><span class='trk'></span><span class='numR' style='color:var(--faint)'>≈</span></span>";
  const w = Math.max(4, Math.min(100, ratio / rmax * 100)).toFixed(0);
  const num = (cls === "g" ? "▲" : "▽") + ratio.toFixed(ratio >= 10 ? 0 : 1) + "×";
  if (cls === "g")
    return "<span class='dcell'><span class='numL'></span><span class='trk'></span><span class='axis'></span><span class='trk'><span class='dbar' style='left:0;width:" + w + "%;background:var(--sg)'></span></span><span class='numR'>" + num + "</span></span>";
  return "<span class='dcell'><span class='numL'>" + num + "</span><span class='trk'><span class='dbar' style='right:0;width:" + w + "%;background:var(--sr)'></span></span><span class='axis'></span><span class='trk'></span><span class='numR'></span></span>";
}
// The summary board matrix (rr vs each rival, all scenarios × cohorts) as a <tbody> string.
// groups defaults to all GROUPS (interactive deck: one table). The print edition passes a
// single-group subset to put each row-group (Per navigation / At scale / Memory & startup)
// on its own page.
function boardHTML(groups = GROUPS) {
  let g = "<tbody>";
  for (const [gn, scns] of groups) {
    g += "<tr class='grp'><td class='rowlab'>" + gn + "</td>" + COHORTS.map(([, n]) => "<th translate='no'>" + n + "</th>").join("") + "</tr>";
    for (const [k, title, sub, swept] of scns) {
      const rmax = rowMax(k, swept);
      const pts = swept && SCEN[k] ? SCEN[k].p : null;
      const ptlab = pts ? "<span class='ptstack'>" + pts.map(n => "<span class='pt'>" + n + "</span>").join("") + "</span>" : "";
      g += "<tr class='srow'><td class='rowlab'><span class='rl'><span class='scn'>" + title + "<small>" + sub + "</small></span>" + ptlab + "</span></td>";
      for (const [co] of COHORTS) {
        if (swept) {
          const st = SWEEP[co] && SWEEP[co][k];
          if (!st) { g += "<td class='na'>&mdash;</td>"; continue; }
          g += "<td><span class='dstack'>" + st.map((p) => p ? dcell(p[0], p[1], rmax) : "<span class='dcell'><span class='numL'></span><span class='trk'></span><span class='axis tie'></span><span class='trk'></span><span class='numR' style='color:var(--faint)'>n/a</span></span>").join("") + "</span></td>";
        } else {
          const c = GRID[co][k];
          if (!c) { g += "<td class='na'>&mdash;</td>"; continue; }
          g += "<td>" + dcell(c[1], c[0], rmax) + "</td>";
        }
      }
      g += "</tr>";
    }
  }
  return g + "</tbody>";
}

// The "routers under test" panel. withAnchors=true links each card to its cohort section
// (interactive deck); the print edition passes false (no in-page navigation in a PDF).
// Version = the measured VERSIONS[pkg] (stamped into deck-data) with the FIELD seed as fallback.
function fieldHTML(withAnchors) {
  return FIELD.map(([f, rs]) => {
    const inner = "<div class='n'>" + f + "</div><div class='vs'>" + rs.map(([nm, ver]) => { const v = (typeof VERSIONS !== "undefined" && VERSIONS && VERSIONS[nm]) || ver; return "<span" + (nm.startsWith("@real-router/") ? " class='me'" : "") + ">" + nm + " <span class='ver'>" + v + "</span></span>"; }).join("<br>") + "</div>";
    return withAnchors
      ? "<a class='fw' translate='no' href='#cohort-" + f.toLowerCase() + "'>" + inner + "</a>"
      : "<div class='fw' translate='no'>" + inner + "</div>";
  }).join("");
}

// Install / source badges — self-contained pills (the deck ships to GitHub Pages only, so no
// external badge service / CSP concern). Repo + @real-router/core + every framework adapter
// under test (derived from FIELD), each a link to npm. Versions live in the FIELD panel above,
// so the pills stay link-only. translate='no' on each (package/brand names).
function badgesHTML() {
  const REPO = "https://github.com/greydragon888/real-router";
  const adapters = FIELD.map(([, rs]) => (rs.find(([nm]) => nm.startsWith("@real-router/")) || [])[0]).filter(Boolean);
  const pkgs = ["@real-router/core", ...adapters];
  const pill = (cls, href, label, value) =>
    "<a class='badge " + cls + "' translate='no' href='" + href + "' target='_blank' rel='noopener'><span class='bl'>" + label + "</span><span class='bv'>" + value + "</span></a>";
  return pill("gh", REPO, "GitHub", "real-router") + pkgs.map((nm) => pill("npm", "https://www.npmjs.com/package/" + nm, "npm", nm)).join("");
}

// The provenance stamp (machine · runner · commit · date · n · completeness), or "" when
// META is absent (the committed/seed deck). ci=true adds the CI-runner disclaimer.
function stampHTML() {
  if (typeof META === "undefined" || !META) return "";
  const ci = META.runner && META.runner !== "local" && META.runner !== "unknown";
  const d = String(META.date || "").slice(0, 10);
  const cells = META.cells && typeof META.cells.written === "number" ? META.cells : null;
  const partial = cells && cells.written < cells.expected;
  const mEpoch = META.matcher && META.matcher.commit && META.matcher.commit !== "unknown" && META.commit && META.commit !== "unknown" && META.matcher.commit !== META.commit;
  return "<b>" + META.cpu + "</b> &middot; " + META.runner + " &middot; commit " + META.commit + " &middot; " + d + " &middot; n=" + META.runs + (cells ? " &middot; matrix " + cells.written + "/" + cells.expected : "")
    + (partial ? "<span class='ci-note'>⚠ Partial snapshot — only " + cells.written + " of " + cells.expected + " matrix cells are present (failed/salvaged run); missing cells render as —.</span>" : "")
    + (mEpoch ? "<span class='ci-note'>⚠ Mixed epochs — the isolated wide/deep matcher curves were measured at commit " + META.matcher.commit + ", the browser cells at " + META.commit + ".</span>" : "")
    + (ci ? "<span class='ci-note'>Cards = this run's fresh snapshot (CI runner — see stamp above). The <b>Why</b> blurbs are curated analysis; their ×N multipliers are derived live from this snapshot's own data.</span>" : "");
}

// ---- Data-derived ratio tokens ⟨[sc:]rival[@N|@max|@min]⟩ ----------------------------------
// A prose multiplier is exactly the magnitude a reader can read off the chart: the larger of
// {rr, rival} over the smaller — at a sweep point (@N), across the whole sweep (@max/@min), or
// overall (bar, no @). Deriving it from the SAME DATA the chart plots means the number can never
// drift from the picture again: the hardcoded "~45×" literals were the recurring re-pin tax, and
// at least one had already gone stale (react wide read ~45× in prose while the chart showed ~200×).
// Direction ("heavier"/"leaner"/"lighter") stays in the prose; only the magnitude is derived.
// sc/co default to the card's context; a cohort-panel token carries an explicit "sc:" prefix.
const SC_PTS = {};
for (const k in SCEN) if (SCEN[k] && SCEN[k].p) SC_PTS[k] = SCEN[k].p;
function ratioMag(co, sc, rival, at) {
  const series = DATA[co] && DATA[co][sc];
  if (!series) return null;
  const row = (n) => { const e = series.find((s) => s[0] === n); return e ? e[1] : null; };
  const rr = row("real-router"), rv = row(rival);
  if (rr == null || rv == null) return null;
  const mag = (a, b) => (a == null || b == null ? null : Math.max(a, b) / Math.min(a, b));
  if (!Array.isArray(rr)) return mag(rr, rv); // bar
  const pts = SC_PTS[sc] || rr.map((_, i) => i);
  if (at === "max" || at === "min") {
    const all = rr.map((_, i) => mag(rr[i], rv[i])).filter((v) => v != null);
    if (!all.length) return null;
    return at === "max" ? Math.max(...all) : Math.min(...all);
  }
  const i = pts.indexOf(Number(at));
  return i < 0 ? null : mag(rr[i], rv[i]);
}
function fmtX(v) { if (v == null) return "?×"; const s = v >= 10 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toString().replace(/\.0$/, ""); return s + "×"; }
function resolveR(text, co, sc) {
  return String(text).replace(/⟨([^⟩]+)⟩/g, (_m, body) => {
    let s = sc, spec = body;
    const ci = body.indexOf(":");
    if (ci > 0) { s = body.slice(0, ci); spec = body.slice(ci + 1); }
    const ai = spec.indexOf("@");
    const rival = ai >= 0 ? spec.slice(0, ai) : spec;
    const at = ai >= 0 ? spec.slice(ai + 1) : null;
    return fmtX(ratioMag(co, s, rival, at));
  });
}
// Hero stat: the biggest per-navigation lead vs the fastest rival — the active-links endpoint
// (the "far ahead on link-heavy pages" headline), derived so it re-pins with each snapshot.
function heroMaxX() {
  let best = 0;
  for (const [co] of COHORTS) { const g = GRID[co] && GRID[co]["active-links"]; if (g && g[1] === "g" && g[0] > best) best = g[0]; }
  return fmtX(best);
}

// Build a card spec from config+data for scenario sc in cohort co (used by both shells'
// card renderers). wide-config and non-angular deep-config read the isolated matcher in µs
// on a log axis. Why blurbs run through resolveR (⟨…⟩ → live multiplier) before NT.
function mk(sc, co) {
  const m = SCEN[sc], o = { t: m.t, k: sc, c: m.c, u: m.u, what: NT(m.what), why: NT(resolveR(why(sc, co), co, sc)) };
  if (m.kind === "sweep") { o.p = m.p; o.s = DATA[co][sc]; o.sw = (SWEEP[co] && SWEEP[co][sc]) || null; }
  else { o.e = DATA[co][sc]; }
  if (sc === "wide-config" || (sc === "deep-config" && co !== "angular")) { o.u = "µs"; o.log = 1; }
  return o;
}

function tally(co) { let g = 0, y = 0, r = 0; for (const sc in GRID[co]) { const c = GRID[co][sc][1]; if (c === "g") g++; else if (c === "y") y++; else r++; } return g + " lead · " + y + " tie · " + r + " trail"; }

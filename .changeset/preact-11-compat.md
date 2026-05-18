---
"@real-router/preact": minor
---

Add Preact 11 support; widen peer dependency range (#592)

The adapter now compiles against both Preact 10 (≥ 10.28) and Preact 11 by importing `HTMLAttributes` / `TargetedMouseEvent` from the top-level `preact` namespace instead of the `JSX` namespace. Preact 11 restructures `JSX.*` and only keeps `Element` / `IntrinsicElements`; everything else moves to `preact`. The top-level exports landed in Preact 10.28, so the peer-dep floor moves up to that version.

**Migration:** if you use the adapter you only need to upgrade Preact to 10.28 or newer. No source-code changes are required in consumer apps.

**Peer dependency:** `"preact": ">=10.28.0 || ^11.0.0-0"`. The `-0` suffix lets `npm`/`pnpm` accept Preact 11 pre-release tags during the beta window.

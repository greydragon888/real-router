---
"@real-router/validation-plugin": minor
---

Warn about a route codec that does not round-trip a navigation's state (#2905)

`navigate` never runs `decodeParams`; a reload of the URL it builds does. The plugin now runs a route's `encodeParams` and `decodeParams` over each state `navigate` and `buildNavigationState` build, and warns through the router's logger about each key a reload would not give back:

- a key the codec adds — derive it in a `forwardState` interceptor instead;
- a value the codec changes, compared by printed form, and an object by the piece `encodeParams` prints for it;
- a path slot, the root's included, or a query key the codec drops.

One warning per route, channel and key, per router. A codec that throws during the check is left to `buildPath` and `matchPath`, and the navigation is unaffected. Needs the `@real-router/core` release that adds `RouterValidator["state"]["reportCodecRoundTrip"]`.

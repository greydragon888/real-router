---
"@real-router/validation-plugin": minor
---

The codec round-trip diagnostic judges a real reload of the state's URL (#2905)

The diagnostic ran `encodeParams` and `decodeParams` over a reload it built by hand. It now reloads the state's path through the router's own `matchPath`, without the path rebuild: the router's query formats parse the URL, `decodeParams` and the `forwardState` interceptors run, and the route's defaults and the mode gate apply, as on a real reload. A value comes back when `areParamValuesEqual` says so, and an object only when `encodeParams` also prints it as it printed the given value. Needs the `@real-router/core` release that compares object values by key.

**Breaking Change:** which keys are reported follows the real reload.

- Fixed: a default `encodeParams` leaves out of the URL is no longer reported as dropped (`its codec drops "page" from state.search`): a reload merges it back.
- A key the decoder fills when the URL leaves it out is reported as added, now also where the encoder writes it as `undefined` and the decoder spreads its input over a default (`{ page: 1, ...search }`).
- A value finer than the piece its encoder prints, such as a `Date` with a time under a day codec, is reported: `… encodeParams prints both as one piece of the URL, so a link must pass the value decodeParams returns for that piece.`
- A value two reloads of one URL decode unequal, such as a class instance with no key, is reported: `… Two reloads of one URL decode values that never compare equal: give the value a key — a Date, or a plain object JSON.stringify prints in full.`
- What the URL format loses itself, such as an empty array, is reported as the codec's.
- A path that matches no route or another route, and a reload that throws, are not judged.
- While the diagnostic runs, the `forwardState` interceptors run again — on the reload, once more when it adds keys, and once more when a reloaded object prints alike without comparing equal — and so do their side effects, search-schema-plugin's `onError` among them.

**Known limit:** the diagnostic judges a state before its navigation commits. On the navigation that removes a sticky param — persistent-params-plugin's included — the interceptors still carry its previous value: a key the codec adds with that same value goes unreported, and where the URL leaves a default out, a key can be reported though a reload after the commit matches the state.

**Migration:** nothing to change in code. A new warning names a key a link and a reload commit differently, and says what to change.

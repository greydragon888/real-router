---
"@real-router/preact": patch
---

The link sleeve DEFINES the fragment option instead of assigning it (#2141)

`navigateWithHash` spreads the caller's extra options and then writes the
fragment slot into the result, which has no own key for it — so a plain
assignment walked the prototype. An ambient accessor an application or a polyfill
put on `Object.prototype` took the value and the navigation ran without the
fragment it was asked for; a getter-only one made the call throw. It goes through
`putField` now.

⚠ `shared/dom-utils` feeds six packages — five by symlink and Angular by a
git-tracked copy the sync script regenerates — so one unguarded write here
multiplied by six. The dir's authority scan classifies COMPUTED-key writes only,
which is why a literal slot like this one sat outside it.

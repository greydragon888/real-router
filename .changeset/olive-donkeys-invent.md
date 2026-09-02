---
"@real-router/core": minor
---

The two commit doors read the caller's bag once, like every producer ([#1952](https://github.com/greydragon888/real-router/issues/1952))

`navigateToState` and `systemCommit` reach `adoptForeignBag`, which walked the
caller's bag TWICE — a pre-pass that stripped `undefined`-valued keys, then the
copy loop that took the values. [#1812](https://github.com/greydragon888/real-router/issues/1812)
removed that pair from every producer by routing both channels through
`normalizeChannel`; these two doors stayed on the old mechanism, and the table
that measured them explained the cost as one "every producer above pays".

Both channels now take one walk, so a bag backed by accessors (Vue `reactive()`,
Svelte `$props()`) is asked once per key on the path every URL plugin commits
through on Back. Same shape as
[#1848](https://github.com/greydragon888/real-router/issues/1848): the fix
removes a read rather than adding a check.

- `adoptForeignBag` drops the `mergeDefined(undefined, value)` pre-pass. The
  `UNSAFE_KEY` skip and the `undefined` filter both live in the single walk, and
  that walk fixes its key list before any accessor on the bag runs.
- `mergeDefined`'s no-default arm hands its argument straight back.
  `stripUndefined` and `copyOwnStringKeys`, reachable only from the deleted
  pre-pass, are gone with it, as is the `forwardTo` fold's short-circuit around
  that arm.
- The class guard the issue asked for: all six doors measured from ONE fixture in
  ONE assertion, so a claim that the doors agree is either true in the table or
  visibly false.

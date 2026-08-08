---
"@real-router/core": patch
---

The commit reads nothing off the caller's options — the meta's three flags are snapshotted at the entry (#1719)

`buildTransitionMeta` built `state.transition` from `opts.reload` / `opts.replace`
/ `opts.redirected` — the CALLER's object, which is accessor- and Proxy-backed by
contract. That made it the one step of `completeTransition` that ran application
code, and it forced an ordering rule of its own: the meta had to be built ABOVE
the commit ask, so that a getter calling `stop()` / `dispose()` was still
something the verdict could see. Built below it, such a getter invalidated a
verdict already given — `COMPLETE` found no edge, the send was a silent table
no-op, and `completeTransition` returned its state anyway, i.e. `navigate()`
resolved a state nobody committed.

The three flags are now read once at the navigation's entry and travel on its
plan, so `completeTransition` reads no field of `opts` at all and the window
between the ask and the send is empty **structurally** rather than by ordering.
⚠ Not "no application code runs there" — the announce below the verdict still
emits `TRANSITION_SUCCESS` synchronously into every hook and subscriber; the
exact claim is that between the ask and the send there is bookkeeping and nothing
else.

Two observable consequences, both measured rather than assumed:

- **A getter that tears the router down announces nothing.** `stop()` / `dispose()`
  from an `opts` accessor used to emit `TRANSITION_START` + `TRANSITION_CANCEL`;
  the getter now runs before the announce, so the navigation is born dead and
  emits neither. The outcome is unchanged — `navigate()` rejects
  `TRANSITION_CANCELLED` and nothing is committed.
- **A navigation started from an `opts` getter no longer supersedes the one whose
  options it is.** It used to run inside the commit, after the outer navigation
  had walked its guards, so the outer one was refused by the table and the nested
  one won. It now runs before the announce, which makes it an EARLIER navigation
  that `abortPreviousNavigation` supersedes like any other: the outer navigation
  wins. Both orders are self-consistent; the new one is the rule the rest of the
  pipeline already follows, whereas the old one let a value read inside a commit
  reach back and cancel that commit.

The reads stand ABOVE `abortPreviousNavigation`, and the position is load-bearing:
one statement lower they land in a window where the machine has left the band and
this navigation has not entered it, so a getter starting a nested navigation parks
it back IN and this navigation's own `send(NAVIGATE)` takes the
`LEAVE_APPROVED --NAVIGATE-->` self-loop the table documents as never traversed.
Instrumented over the whole functional tier in both positions: zero traversals in
the shipped one, one in the other — with the tier equally green either way.

`commit-ask-snapshot-1649.test.ts` is replaced by `commit-window-empty-1719.test.ts`:
its subject was the ordering rule, which no longer exists. The new file COUNTS the
caller's getter invocations and requires zero below the announce — mutationally
validated, putting the meta back on `opts` makes it three and reds it.

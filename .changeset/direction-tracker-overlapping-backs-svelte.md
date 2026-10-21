---
"@real-router/svelte": patch
---

`createDirectionTracker` labels a Back pressed while another is held `back` (#2796)

A `popstate` that arrives while a transition is in flight belongs to the traversal a URL plugin starts after that transition. When the held transition left after it, or a navigation to another address was refused in the meantime, that `popstate`'s flag was spent, and its traversal landed labelled `forward`. Each traversal keeps its own flag now: the transition in flight spends only its own, and a refusal spends the waiting one unless it names another address. The same class of defect as #2796.

A Back that waits behind one a guard refuses or cancels quietly is dropped when the URL plugin returns to the entry the router shows, and its flag ends with that return: the next navigation is labelled `forward`. Before, a Back that waited behind a refused one left the next navigation labelled `back`.

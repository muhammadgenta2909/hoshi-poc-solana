// One composable body-scroll lock for every overlay in the app.
//
// The pattern this replaces was `const prev = document.body.style.overflow` in each
// modal, restored on unmount. That is correct for ONE overlay and broken for two,
// because the second one captures the FIRST one's "hidden" as its "previous" value.
//
// The concrete bug (verified against React 19.2.4's own deletion traversal, see
// react-dom/cjs/react-dom-client.development.js — `commitDeletionEffectsOnFiber`
// case 0/11/14/15 runs the fiber's own layout-unmount BEFORE
// `recursivelyTraverseDeletionEffects`, and
// `commitPassiveUnmountEffectsInsideOfDeletedTree_begin` likewise runs a fiber's
// passive destroy before descending to `fiber.child`): when a parent and its child
// unmount in the same commit, the PARENT's useEffect cleanup runs FIRST. So with
// RipReveal (parent, locked) and VrfProofModal (child, locked) both mounted, a back
// button / route change tore down RipReveal first — restoring "" — and then the
// modal restored the "hidden" it had captured. The page stayed unscrollable until
// a reload, on the screen whose entire job is to be trustworthy.
//
// A counter fixes it: the real style is touched only on 0→1 and 1→0, and the value
// restored is the one captured BEFORE any overlay was open. Release order does not
// matter, so nested locks can never strand the page.

/** How many overlays currently hold the lock. */
let held = 0;
/** The page's own overflow, captured before the first lock. */
let savedOverflow = "";

/**
 * Lock body scroll and get back the release function. Call the released function
 * exactly once (returning it straight from a useEffect does that for you); calling
 * it twice is a no-op, so a double-invoked StrictMode effect cannot desync the count.
 */
export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {};

  if (held === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  held += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    held -= 1;
    if (held <= 0) {
      held = 0;
      document.body.style.overflow = savedOverflow;
      savedOverflow = "";
    }
  };
}
